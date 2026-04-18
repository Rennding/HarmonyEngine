//! Per-voice composer workers + plan-flush protocol — SPEC_057 §4 Phase 2b-1 (#81).
//!
//! Phase 2a landed the foundations: `Plan` + `PlanPublisher`, typed
//! `VoiceEvent`s, SPSC rings per voice. This module adds the next layer:
//!
//! 1. **Per-voice lookahead budgets** — how far ahead (in beats) each voice
//!    composes. Drums: 4 beats. Melody: 16 beats. Bass / chord / pad: 0
//!    until #82.
//! 2. **Plan-flush protocol** — when the conductor bumps generation (palette
//!    swap, forced phase, tension spike), voice workers stop emitting events
//!    tagged with the old generation and resume with the new one; the audio
//!    thread skips any leftover events with a stale `plan_generation`. The
//!    result is guaranteed <1 bar flush latency with zero allocation.
//! 3. **Stagger order** — on downward phase transitions melody drains first
//!    (lead instruments drop first), drums last; reversed on upward
//!    transitions. Preserves CLAUDE.md §6 decision under the new threading
//!    model.
//! 4. **Prototype composers** — pure functions `compose_drums_ahead` /
//!    `compose_melody_ahead` that the Phase 2b-1 session validates in tests
//!    but the audio path doesn't yet wire (that happens when Sequencer's
//!    inline tick is replaced by ring consumption in a later slice).
//!
//! The module is pure library code: no threading primitives are spawned
//! here; no global state. Workers can be exercised synchronously from
//! tests — and once #82 + the ring-consumption slice land, the same
//! functions are what the worker threads will call in their compose loop.

use ringbuf::traits::{Consumer, Producer};

use crate::plan::Plan;
use crate::voice_event::{DrumHit, MelodyEvent, MelodyNote, RhythmEvent};
use crate::voice_ring::{MelodyRing, RhythmRing};

/// Identity of a voice worker. Used by the flush order tables +
/// diagnostic labels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VoiceKind {
    Drums,
    Bass,
    Chord,
    Pad,
    Melody,
}

impl VoiceKind {
    pub fn label(self) -> &'static str {
        match self {
            VoiceKind::Drums => "drums",
            VoiceKind::Bass => "bass",
            VoiceKind::Chord => "chord",
            VoiceKind::Pad => "pad",
            VoiceKind::Melody => "melody",
        }
    }
}

/// Per-voice lookahead budget, in beats. Phase 2b-1 enables drums + melody
/// only; bass/chord/pad keep the beat-by-beat (budget 0) semantics of
/// Phase 2a until #82 upgrades them.
#[derive(Clone, Copy, Debug)]
pub struct LookaheadBudget {
    pub drums_beats: u32,
    pub bass_beats: u32,
    pub chord_beats: u32,
    pub pad_beats: u32,
    pub melody_beats: u32,
}

impl LookaheadBudget {
    /// Phase 2b-1 defaults — SPEC_057 §4 Phase 2b scope + #81 "two-voice
    /// prototype".
    pub const fn phase_2b_1() -> Self {
        Self {
            drums_beats: 4,
            melody_beats: 16,
            bass_beats: 0,
            chord_beats: 0,
            pad_beats: 0,
        }
    }

    pub fn beats_for(&self, voice: VoiceKind) -> u32 {
        match voice {
            VoiceKind::Drums => self.drums_beats,
            VoiceKind::Bass => self.bass_beats,
            VoiceKind::Chord => self.chord_beats,
            VoiceKind::Pad => self.pad_beats,
            VoiceKind::Melody => self.melody_beats,
        }
    }
}

impl Default for LookaheadBudget {
    fn default() -> Self {
        Self::phase_2b_1()
    }
}

/// Phase-stagger flush direction — CLAUDE.md §6 decision, preserved from
/// JS `SPEC_010` staggered phase transitions.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FlushDirection {
    /// DC dropped: lead instruments drop first (melody → pad → chord →
    /// bass → drums). Used when the conductor forces a lower phase or
    /// cycle mode decays into bridge.
    Downward,
    /// DC rose: rhythm arrives first (drums → bass → chord → pad →
    /// melody). Used on upward phase transitions and cycle-mode rebuild.
    Upward,
}

/// Downward stagger order — melody first, drums last.
pub const STAGGER_DOWN: [VoiceKind; 5] = [
    VoiceKind::Melody,
    VoiceKind::Pad,
    VoiceKind::Chord,
    VoiceKind::Bass,
    VoiceKind::Drums,
];

/// Upward stagger order — drums first, melody last.
pub const STAGGER_UP: [VoiceKind; 5] = [
    VoiceKind::Drums,
    VoiceKind::Bass,
    VoiceKind::Chord,
    VoiceKind::Pad,
    VoiceKind::Melody,
];

#[inline]
pub fn stagger_order(dir: FlushDirection) -> &'static [VoiceKind; 5] {
    match dir {
        FlushDirection::Downward => &STAGGER_DOWN,
        FlushDirection::Upward => &STAGGER_UP,
    }
}

/// Result of a consumer-side flush pass.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FlushReport {
    /// Events skipped because their `plan_generation` < `current_generation`.
    pub skipped: u32,
    /// Events popped with a current generation (i.e. still valid).
    pub applied: u32,
    /// Sample index of the first applied event, or `None` if no current-gen
    /// event was popped. Used by the flush-latency diagnostic to measure
    /// "beats to drain".
    pub first_applied_time: Option<u64>,
    /// Sample index of the last skipped event. Pairs with
    /// `first_applied_time` to compute flush latency in samples.
    pub last_skipped_time: Option<u64>,
}

impl FlushReport {
    /// How long (in beats) the audio thread spent skipping stale events
    /// before hitting the first current-gen event, given `samples_per_beat`.
    /// Returns `None` when nothing was skipped (no flush needed) or nothing
    /// current-gen arrived yet.
    pub fn beats_to_drain(&self, samples_per_beat: f64) -> Option<f64> {
        let first = self.first_applied_time?;
        let last_skip = self.last_skipped_time?;
        if first <= last_skip {
            // Stale events outran the first current event in time — clamp
            // to zero rather than report negative latency.
            return Some(0.0);
        }
        Some((first - last_skip) as f64 / samples_per_beat.max(1.0))
    }
}

/// Drain helper for the rhythm ring. Pops events in order; skips any whose
/// `plan_generation` lags `current_generation`; returns a `FlushReport`
/// plus the kept events pushed into `out` in original order. Caller is
/// responsible for re-queueing / applying the kept events.
pub fn drain_rhythm_ring(
    ring: &mut RhythmRing,
    current_generation: u64,
    out: &mut Vec<RhythmEvent>,
) -> FlushReport {
    let mut report = FlushReport::default();
    while let Some(ev) = ring.cons.try_pop() {
        if ev.plan_generation() < current_generation {
            report.skipped = report.skipped.saturating_add(1);
            report.last_skipped_time = Some(ev.time());
        } else {
            report.applied = report.applied.saturating_add(1);
            if report.first_applied_time.is_none() {
                report.first_applied_time = Some(ev.time());
            }
            out.push(ev);
        }
    }
    report
}

/// Drain helper for the melody ring — same semantics as
/// [`drain_rhythm_ring`], specialised to `MelodyEvent`.
pub fn drain_melody_ring(
    ring: &mut MelodyRing,
    current_generation: u64,
    out: &mut Vec<MelodyEvent>,
) -> FlushReport {
    let mut report = FlushReport::default();
    while let Some(ev) = ring.cons.try_pop() {
        if ev.plan_generation() < current_generation {
            report.skipped = report.skipped.saturating_add(1);
            report.last_skipped_time = Some(ev.time());
        } else {
            report.applied = report.applied.saturating_add(1);
            if report.first_applied_time.is_none() {
                report.first_applied_time = Some(ev.time());
            }
            out.push(ev);
        }
    }
    report
}

/// Prototype drums composer — pushes a four-on-the-floor kick pattern
/// covering `budget.drums_beats` beats starting at `plan.beat_time_samples`.
/// Each event is tagged with the plan generation. Returns the number of
/// events successfully pushed (bounded by the ring's free capacity).
///
/// This is a demonstration of the producer side of the flush protocol —
/// the actual per-palette drum pattern lives in `Sequencer::tick_16th`;
/// #82 + the ring-consumption slice migrate that code into the worker.
pub fn compose_drums_ahead(
    plan: &Plan,
    ring: &mut RhythmRing,
    budget: &LookaheadBudget,
    kick_freq: f32,
    kick_decay: f32,
) -> u32 {
    let budget_beats = budget.drums_beats;
    if budget_beats == 0 {
        return 0;
    }
    let samples_per_beat = plan.samples_per_16th * 4.0;
    let mut pushed = 0;
    for beat in 0..budget_beats {
        let time = plan
            .beat_time_samples
            .saturating_add((beat as f64 * samples_per_beat) as u64);
        let ev = RhythmEvent::Kick(DrumHit {
            time,
            plan_generation: plan.generation,
            freq: kick_freq,
            decay: kick_decay,
            vel: 0.9,
        });
        if ring.prod.try_push(ev).is_err() {
            break;
        }
        pushed += 1;
    }
    pushed
}

/// Prototype melody composer — pushes a rest-padded phrase across
/// `budget.melody_beats` beats tagged with the plan generation. The pitch
/// walk is a deterministic chord-tone ping-pong so tests can assert
/// ordering without pulling in the full MelodyEngine Markov walk. #82 +
/// later slices replace this with the real `MelodyEngine::on_beat` loop.
pub fn compose_melody_ahead(plan: &Plan, ring: &mut MelodyRing, budget: &LookaheadBudget) -> u32 {
    let budget_beats = budget.melody_beats;
    if budget_beats == 0 {
        return 0;
    }
    let samples_per_beat = plan.samples_per_16th * 4.0;
    let tones = [0_i32, 4, 7, 4];
    let base_midi = 60 + plan.key_root_semitone + plan.chord_root;
    let mut pushed = 0;
    for beat in 0..budget_beats {
        let time = plan
            .beat_time_samples
            .saturating_add((beat as f64 * samples_per_beat) as u64);
        let midi = base_midi + tones[(beat as usize) % tones.len()];
        let ev = MelodyEvent::Note(MelodyNote {
            time,
            plan_generation: plan.generation,
            midi,
            phase_gain: 1.0,
        });
        if ring.prod.try_push(ev).is_err() {
            break;
        }
        pushed += 1;
    }
    pushed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Phase;
    use crate::plan::{Plan, PlanPublisher};
    use crate::voice_event::DrumHit;

    fn initial_plan() -> Plan {
        // BPM 120 @ 48 kHz → 6 000 samples per 16th.
        Plan::initial("dark_techno", 120.0, 6_000.0)
    }

    #[test]
    fn budget_phase_2b_1_drums_and_melody_only() {
        let b = LookaheadBudget::phase_2b_1();
        assert_eq!(b.beats_for(VoiceKind::Drums), 4);
        assert_eq!(b.beats_for(VoiceKind::Melody), 16);
        assert_eq!(b.beats_for(VoiceKind::Bass), 0);
        assert_eq!(b.beats_for(VoiceKind::Chord), 0);
        assert_eq!(b.beats_for(VoiceKind::Pad), 0);
    }

    #[test]
    fn downward_order_melody_first_drums_last() {
        let order = stagger_order(FlushDirection::Downward);
        assert_eq!(order[0], VoiceKind::Melody);
        assert_eq!(order[4], VoiceKind::Drums);
    }

    #[test]
    fn upward_order_drums_first_melody_last() {
        let order = stagger_order(FlushDirection::Upward);
        assert_eq!(order[0], VoiceKind::Drums);
        assert_eq!(order[4], VoiceKind::Melody);
    }

    #[test]
    fn drain_rhythm_skips_stale_events() {
        let mut ring = RhythmRing::new();
        // Two stale gen-0 events, one current gen-1.
        for (gen, time) in [(0, 100), (0, 200), (1, 300)] {
            ring.prod
                .try_push(RhythmEvent::Kick(DrumHit {
                    time,
                    plan_generation: gen,
                    freq: 55.0,
                    decay: 0.3,
                    vel: 0.9,
                }))
                .unwrap();
        }
        let mut kept = Vec::new();
        let report = drain_rhythm_ring(&mut ring, 1, &mut kept);
        assert_eq!(report.skipped, 2);
        assert_eq!(report.applied, 1);
        assert_eq!(report.first_applied_time, Some(300));
        assert_eq!(report.last_skipped_time, Some(200));
        assert_eq!(kept.len(), 1);
    }

    #[test]
    fn flush_latency_reports_beats_to_drain() {
        let samples_per_beat = 6_000.0 * 4.0; // 120 BPM @ 48 kHz.
        let report = FlushReport {
            skipped: 3,
            applied: 1,
            first_applied_time: Some(samples_per_beat as u64 * 2),
            last_skipped_time: Some(samples_per_beat as u64),
        };
        let beats = report.beats_to_drain(samples_per_beat).unwrap();
        assert!(
            (beats - 1.0).abs() < 1e-6,
            "expected 1 beat latency, got {beats}"
        );
    }

    #[test]
    fn compose_drums_ahead_pushes_full_budget() {
        let plan = initial_plan();
        let mut ring = RhythmRing::new();
        let pushed = compose_drums_ahead(&plan, &mut ring, &LookaheadBudget::phase_2b_1(), 55.0, 0.3);
        assert_eq!(pushed, 4);
        let mut kept = Vec::new();
        let report = drain_rhythm_ring(&mut ring, 0, &mut kept);
        assert_eq!(report.applied, 4);
        assert_eq!(kept.len(), 4);
        // Events are spaced by one beat (4 × samples_per_16th).
        let dt = kept[1].time() - kept[0].time();
        assert_eq!(dt, (plan.samples_per_16th * 4.0) as u64);
    }

    #[test]
    fn compose_melody_ahead_respects_budget() {
        let plan = initial_plan();
        let mut ring = MelodyRing::new();
        // melody budget is 16 beats — ring capacity is 64, fits fine.
        let pushed = compose_melody_ahead(&plan, &mut ring, &LookaheadBudget::phase_2b_1());
        assert_eq!(pushed, 16);
    }

    #[test]
    fn flush_after_generation_bump_drops_stale_and_keeps_new() {
        let plan = initial_plan();
        let publisher = PlanPublisher::new(plan.clone());

        let mut drum_ring = RhythmRing::new();
        let mut melody_ring = MelodyRing::new();

        // Compose a lookahead window under the initial plan (generation 0).
        let budget = LookaheadBudget::phase_2b_1();
        compose_drums_ahead(
            &publisher.snapshot(),
            &mut drum_ring,
            &budget,
            55.0,
            0.3,
        );
        compose_melody_ahead(&publisher.snapshot(), &mut melody_ring, &budget);

        // Conductor publishes a new plan (palette swap). Generation ticks.
        let mut next = (*publisher.snapshot()).clone();
        next.phase = Phase::Surge;
        next.beat_time_samples = (plan.samples_per_16th * 4.0) as u64 * 8; // +8 beats
        publisher.publish(next);
        let cur_gen = publisher.current_generation();
        assert_eq!(cur_gen, 1);

        // Audio thread drains both rings using the new generation — every
        // stale event is skipped.
        let mut drum_kept = Vec::new();
        let mut mel_kept = Vec::new();
        let drum_report = drain_rhythm_ring(&mut drum_ring, cur_gen, &mut drum_kept);
        let mel_report = drain_melody_ring(&mut melody_ring, cur_gen, &mut mel_kept);
        assert_eq!(drum_report.applied, 0);
        assert_eq!(mel_report.applied, 0);
        assert_eq!(drum_report.skipped, 4);
        assert_eq!(mel_report.skipped, 16);

        // Worker composes again under the new plan — events survive drain.
        compose_drums_ahead(
            &publisher.snapshot(),
            &mut drum_ring,
            &budget,
            55.0,
            0.3,
        );
        compose_melody_ahead(&publisher.snapshot(), &mut melody_ring, &budget);
        let mut drum_kept = Vec::new();
        let mut mel_kept = Vec::new();
        let drum_report = drain_rhythm_ring(&mut drum_ring, cur_gen, &mut drum_kept);
        let mel_report = drain_melody_ring(&mut melody_ring, cur_gen, &mut mel_kept);
        assert_eq!(drum_report.applied, 4);
        assert_eq!(mel_report.applied, 16);
        assert_eq!(drum_report.skipped, 0);
        assert_eq!(mel_report.skipped, 0);
    }
}
