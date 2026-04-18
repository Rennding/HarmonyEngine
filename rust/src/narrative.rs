//! Narrative conductor — abridged port of `src/narrative.js`.
//!
//! SPEC_020 §1–§2. The JS file couples tightly to DOM/game state (silence
//! moments on hit/death, streak milestones, per-instrument intros). The
//! Rust port keeps the musical core:
//!
//!   * 4-note theme motif generated per run (SPEC_020 §2)
//!   * Variation system (original / harmonized_3rds / inverted /
//!     transposed / retrograde)
//!   * Phase-driven cue emission (swell → harmonized, surge → inverted,
//!     storm → transposed, maelstrom → augmented canon)
//!   * Pulse-intro cue at beat 4 and recurring Surge cue every 32 beats
//!
//! Cues are emitted as [`NarrativeCue`] values; the melody worker picks
//! them up and routes the notes through [`crate::voice_ring::MelodyRing`].
//! UI/game-only paths (hit fragment, death cadence, streak unison, silence
//! moments) are intentionally skipped — they come back if we grow a
//! gameplay bridge in Phase 3.

use crate::config::Phase;
use crate::harmony::HarmonyEngine;
use crate::palette::Palette;
use crate::rng::Mulberry32;

/// Motif is always 4 scale-degrees long.
pub const MOTIF_LEN: usize = 4;

/// Quarter, 8th, 8th, half — the motif's rhythmic signature
/// (SPEC_020 §2). Indexed as beat-fractions.
pub const MOTIF_RHYTHM: [f32; MOTIF_LEN] = [1.0, 0.5, 0.5, 2.0];

/// Default melody register for the motif.
pub const DEFAULT_OCTAVE: i32 = 5;

/// Recurring-Surge cadence in beats.
const SURGE_RECURRING_BEATS: i64 = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VariationKind {
    Original,
    Harmonized3rds,
    Inverted,
    Transposed,
    Retrograde,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CueKind {
    PulseIntro,
    SwellEntry,
    SurgeEntry,
    SurgeRecurring,
    StormEntry,
    MaelstromEntry,
    PhaseTransitionSilence,
    MaelstromIntimacy,
}

/// Maximum notes an emitted cue can carry. 8 covers harmonized_3rds
/// (4 melody + 4 harmony) and augmented_canon (4 notes, voice 2 queued
/// separately by the caller at +2 beats).
pub const MAX_CUE_NOTES: usize = 8;

#[derive(Clone, Copy, Debug)]
pub struct NarrativeCue {
    pub kind: CueKind,
    pub beat_time: u64,
    pub notes: [i32; MAX_CUE_NOTES],
    pub note_count: u8,
    pub rhythm: [f32; MOTIF_LEN],
    pub volume: f32,
    pub tempo_mult: f32,
    /// True for `harmonized_3rds` — consumer should emit pairs at the
    /// same time rather than sequentially.
    pub harmonized: bool,
    /// For `MaelstromEntry` the consumer schedules a second voice 2 beats
    /// later; this flag tells it which invocation is the canon voice.
    pub is_canon_voice: bool,
}

impl NarrativeCue {
    pub fn notes_slice(&self) -> &[i32] {
        &self.notes[..self.note_count as usize]
    }
}

/// Per-run motif data — 4 scale-degrees + register.
#[derive(Clone, Copy, Debug)]
pub struct Motif {
    pub degrees: [usize; MOTIF_LEN],
    pub rhythm: [f32; MOTIF_LEN],
    pub octave: i32,
}

pub struct NarrativeConductor {
    motif: Option<Motif>,
    active: bool,
    narrative_enabled: bool,
    intro_played: bool,
    swell_played: bool,
    storm_played: bool,
    maelstrom_played: bool,
    surge_last_beat: i64,
    current_phase: Phase,
}

impl Default for NarrativeConductor {
    fn default() -> Self {
        Self::new()
    }
}

impl NarrativeConductor {
    pub fn new() -> Self {
        Self {
            motif: None,
            active: false,
            narrative_enabled: true,
            intro_played: false,
            swell_played: false,
            storm_played: false,
            maelstrom_played: false,
            surge_last_beat: i64::MIN,
            current_phase: Phase::Pulse,
        }
    }

    /// JS `NarrativeConductor.initRun(palette)` — generate the motif and
    /// reset per-run flags. `rng` must be the song-seeded Mulberry32.
    pub fn init_run(
        &mut self,
        palette: &Palette,
        harmony: &HarmonyEngine,
        rng: &mut Mulberry32,
    ) {
        self.active = true;
        self.narrative_enabled = palette.melody.narrative_motif;
        self.intro_played = false;
        self.swell_played = false;
        self.storm_played = false;
        self.maelstrom_played = false;
        self.surge_last_beat = i64::MIN;
        self.current_phase = Phase::Pulse;
        self.motif = Some(generate_motif(harmony, rng));
    }

    pub fn motif(&self) -> Option<&Motif> {
        self.motif.as_ref()
    }

    pub fn is_active(&self) -> bool {
        self.active
    }

    /// JS `NarrativeConductor.onBeat(beatTime)` — fires the Pulse intro at
    /// beat 4 and the recurring Surge cue every 32 beats. The caller
    /// passes the absolute beat count (`G.beatCount`) and the audio-thread
    /// sample index at which the cue should sound (`beat_time`).
    pub fn on_beat(
        &mut self,
        beat_count: i64,
        beat_time: u64,
        harmony: &HarmonyEngine,
    ) -> Option<NarrativeCue> {
        if !self.active || !self.narrative_enabled {
            return None;
        }

        if !self.intro_played && self.current_phase == Phase::Pulse && beat_count == 4 {
            self.intro_played = true;
            return Some(self.build_cue(
                CueKind::PulseIntro,
                VariationKind::Original,
                beat_time,
                0.5,
                1.0,
                harmony,
            ));
        }

        if self.current_phase == Phase::Surge
            && beat_count.saturating_sub(self.surge_last_beat) >= SURGE_RECURRING_BEATS
        {
            self.surge_last_beat = beat_count;
            return Some(self.build_cue(
                CueKind::SurgeRecurring,
                VariationKind::Inverted,
                beat_time,
                0.7,
                1.0,
                harmony,
            ));
        }

        None
    }

    /// JS `NarrativeConductor.onPhaseChange(newPhase, oldPhase, beatTime)`.
    /// Emits the phase-entry cue(s). Returns up to two cues: a transition
    /// silence (when `old_phase` is `Some`) plus the phase-entry variation.
    /// The audio worker receiving these schedules them through the melody
    /// ring. For `Maelstrom`, the canon voice-2 cue is returned with
    /// `is_canon_voice = true` and `beat_time` already shifted by 2 beats.
    #[allow(clippy::too_many_arguments)]
    pub fn on_phase_change(
        &mut self,
        new_phase: Phase,
        old_phase: Option<Phase>,
        beat_time: u64,
        beat_count: i64,
        samples_per_beat: u64,
        harmony: &HarmonyEngine,
        out: &mut Vec<NarrativeCue>,
    ) {
        if !self.active {
            return;
        }
        self.current_phase = new_phase;

        if old_phase.is_some() {
            out.push(self.build_cue(
                CueKind::PhaseTransitionSilence,
                VariationKind::Original,
                beat_time,
                0.0,
                1.0,
                harmony,
            ));
        }

        if new_phase == Phase::Maelstrom {
            out.push(self.build_cue(
                CueKind::MaelstromIntimacy,
                VariationKind::Original,
                beat_time,
                0.0,
                1.0,
                harmony,
            ));
        }

        if !self.narrative_enabled {
            return;
        }

        match new_phase {
            Phase::Swell if !self.swell_played => {
                self.swell_played = true;
                // Harmonize_3rds one octave up (JS: _motif.octave = 6).
                let mut harmony_cue = self.build_cue_at_octave(
                    CueKind::SwellEntry,
                    VariationKind::Harmonized3rds,
                    beat_time,
                    0.6,
                    1.0,
                    harmony,
                    DEFAULT_OCTAVE + 1,
                );
                harmony_cue.harmonized = true;
                out.push(harmony_cue);
            }
            Phase::Surge => {
                self.surge_last_beat = beat_count;
                out.push(self.build_cue(
                    CueKind::SurgeEntry,
                    VariationKind::Inverted,
                    beat_time,
                    0.7,
                    1.0,
                    harmony,
                ));
            }
            Phase::Storm if !self.storm_played => {
                self.storm_played = true;
                // JS waits 1 beat for Storm modulation to settle.
                let delayed = beat_time.saturating_add(samples_per_beat);
                out.push(self.build_cue(
                    CueKind::StormEntry,
                    VariationKind::Transposed,
                    delayed,
                    0.75,
                    1.0,
                    harmony,
                ));
            }
            Phase::Maelstrom if !self.maelstrom_played => {
                self.maelstrom_played = true;
                // Voice 1: original, tempo ×2 (augmented).
                out.push(self.build_cue(
                    CueKind::MaelstromEntry,
                    VariationKind::Original,
                    beat_time,
                    0.6,
                    2.0,
                    harmony,
                ));
                // Voice 2: 2 beats later, lower volume.
                let canon_time = beat_time.saturating_add(samples_per_beat * 2);
                let mut canon = self.build_cue(
                    CueKind::MaelstromEntry,
                    VariationKind::Original,
                    canon_time,
                    0.45,
                    2.0,
                    harmony,
                );
                canon.is_canon_voice = true;
                out.push(canon);
            }
            _ => {}
        }
    }

    fn build_cue(
        &self,
        kind: CueKind,
        variation: VariationKind,
        beat_time: u64,
        volume: f32,
        tempo_mult: f32,
        harmony: &HarmonyEngine,
    ) -> NarrativeCue {
        let octave = self.motif.as_ref().map(|m| m.octave).unwrap_or(DEFAULT_OCTAVE);
        self.build_cue_at_octave(kind, variation, beat_time, volume, tempo_mult, harmony, octave)
    }

    #[allow(clippy::too_many_arguments)]
    fn build_cue_at_octave(
        &self,
        kind: CueKind,
        variation: VariationKind,
        beat_time: u64,
        volume: f32,
        tempo_mult: f32,
        harmony: &HarmonyEngine,
        octave: i32,
    ) -> NarrativeCue {
        let mut cue = NarrativeCue {
            kind,
            beat_time,
            notes: [0; MAX_CUE_NOTES],
            note_count: 0,
            rhythm: MOTIF_RHYTHM,
            volume,
            tempo_mult,
            harmonized: false,
            is_canon_voice: false,
        };
        if let Some(m) = self.motif {
            let rendered = render_variation(&m, variation, harmony, octave);
            let n = rendered.len().min(MAX_CUE_NOTES);
            cue.notes[..n].copy_from_slice(&rendered[..n]);
            cue.note_count = n as u8;
        }
        cue
    }
}

/// Pick next degree with JS `_pickNextDegree` weighting:
/// ±1 = 40% each, ±2 = 10% each, renormalized against scale-length clamp.
fn pick_next_degree(current: usize, scale_len: usize, rng: &mut Mulberry32) -> usize {
    const OFFSETS: [i32; 4] = [-2, -1, 1, 2];
    const WEIGHTS: [f64; 4] = [0.10, 0.40, 0.40, 0.10];

    let mut candidates: Vec<usize> = Vec::with_capacity(4);
    let mut weights: Vec<f64> = Vec::with_capacity(4);
    for (o, w) in OFFSETS.iter().zip(WEIGHTS.iter()) {
        let d = current as i32 + o;
        if d >= 0 && (d as usize) < scale_len {
            candidates.push(d as usize);
            weights.push(*w);
        }
    }
    if candidates.is_empty() {
        return (current + 1) % scale_len.max(1);
    }
    let sum: f64 = weights.iter().sum();
    let r = rng.next_f64() * sum;
    let mut acc = 0.0;
    for (i, w) in weights.iter().enumerate() {
        acc += w;
        if r <= acc {
            return candidates[i];
        }
    }
    candidates[candidates.len() - 1]
}

/// JS `_generateThemeMotif(palette)` — pick 4 scale degrees.
pub fn generate_motif(harmony: &HarmonyEngine, rng: &mut Mulberry32) -> Motif {
    let scale = crate::harmony::MINOR_SCALE;
    let scale_len = scale.len();

    // Degree index closest to a perfect fifth (7 semitones).
    let mut fifth_deg = 0usize;
    let mut best_dist = i32::MAX;
    for (i, s) in scale.iter().enumerate() {
        let d = (s - 7).abs();
        if d < best_dist {
            best_dist = d;
            fifth_deg = i;
        }
    }

    let deg0 = if rng.next_f64() < 0.6 { 0 } else { fifth_deg };
    let deg3 = 0usize;
    let deg1 = pick_next_degree(deg0, scale_len, rng);
    let mut deg2 = pick_next_degree(deg1, scale_len, rng);
    if deg2 == deg3 && scale_len > 2 {
        deg2 = (deg3 + 1) % scale_len;
    }

    let _ = harmony; // Harmony reserved for future scale swaps.

    Motif {
        degrees: [deg0, deg1, deg2, deg3],
        rhythm: MOTIF_RHYTHM,
        octave: DEFAULT_OCTAVE,
    }
}

/// JS `_refreshMotifMidi` — degrees → MIDI using HarmonyEngine's key root.
fn motif_midi(motif: &Motif, harmony: &HarmonyEngine, octave: i32) -> [i32; MOTIF_LEN] {
    let scale = crate::harmony::MINOR_SCALE;
    let root = harmony.root_semitone();
    let base_midi = (octave + 1) * 12;
    let mut out = [0i32; MOTIF_LEN];
    for (i, &deg) in motif.degrees.iter().enumerate() {
        let d = deg % scale.len();
        out[i] = base_midi + root + scale[d];
    }
    out
}

/// JS `_getVariation(type)` — render the transformed MIDI sequence.
pub fn render_variation(
    motif: &Motif,
    variation: VariationKind,
    harmony: &HarmonyEngine,
    octave: i32,
) -> Vec<i32> {
    let midi = motif_midi(motif, harmony, octave);
    match variation {
        VariationKind::Original | VariationKind::Transposed => midi.to_vec(),
        VariationKind::Retrograde => midi.iter().rev().copied().collect(),
        VariationKind::Harmonized3rds => {
            let scale = crate::harmony::MINOR_SCALE;
            let root = harmony.root_semitone();
            let base_midi = (octave + 1) * 12;
            let mut out = Vec::with_capacity(MOTIF_LEN * 2);
            for (i, &note) in midi.iter().enumerate() {
                out.push(note);
                let deg_above = (motif.degrees[i] + 2) % scale.len();
                out.push(base_midi + root + scale[deg_above]);
            }
            out
        }
        VariationKind::Inverted => {
            // Intervals flip direction around first note.
            let anchor = midi[0];
            let mut out = Vec::with_capacity(MOTIF_LEN);
            out.push(anchor);
            for v in 1..midi.len() {
                let interval = midi[v] - midi[v - 1];
                let prev = *out.last().unwrap();
                out.push(prev - interval);
            }
            out
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::palette_by_name;

    fn harmony_env(palette: &Palette) -> HarmonyEngine {
        let mut rng = Mulberry32::new(1);
        HarmonyEngine::init_run(palette, &mut rng)
    }

    fn conductor(palette: &Palette, harmony: &HarmonyEngine) -> NarrativeConductor {
        let mut rng = Mulberry32::new(42);
        let mut c = NarrativeConductor::new();
        c.init_run(palette, harmony, &mut rng);
        c
    }

    #[test]
    fn motif_starts_on_root_or_fifth_and_ends_on_root() {
        let p = palette_by_name("dark_techno").unwrap();
        let h = harmony_env(&p);
        // 100 different seeds — every motif must start on root(0) or
        // fifth index and end on root.
        for seed in 0..100 {
            let mut rng = Mulberry32::new(seed);
            let m = generate_motif(&h, &mut rng);
            assert_eq!(m.degrees[3], 0, "seed {seed} did not end on root");
            // Scale len = 7; fifth index in MINOR_SCALE is 4 (value 7).
            assert!(
                m.degrees[0] == 0 || m.degrees[0] == 4,
                "seed {seed} bad start: {}",
                m.degrees[0]
            );
        }
    }

    #[test]
    fn motif_deg2_never_equals_root() {
        let p = palette_by_name("dark_techno").unwrap();
        let h = harmony_env(&p);
        for seed in 0..100 {
            let mut rng = Mulberry32::new(seed);
            let m = generate_motif(&h, &mut rng);
            assert_ne!(m.degrees[2], m.degrees[3], "seed {seed} boring cadence");
        }
    }

    #[test]
    fn pulse_intro_fires_only_at_beat_4() {
        let p = palette_by_name("dark_techno").unwrap();
        let h = harmony_env(&p);
        let mut c = conductor(&p, &h);
        // Beats 0..3: no cue.
        for b in 0..4 {
            assert!(c.on_beat(b, 0, &h).is_none(), "beat {b} fired early");
        }
        let cue = c.on_beat(4, 1_000, &h).expect("beat 4 should fire intro");
        assert_eq!(cue.kind, CueKind::PulseIntro);
        assert_eq!(cue.beat_time, 1_000);
        // Won't fire twice.
        assert!(c.on_beat(4, 2_000, &h).is_none());
    }

    #[test]
    fn surge_recurring_every_32_beats() {
        let p = palette_by_name("dark_techno").unwrap();
        let h = harmony_env(&p);
        let mut c = conductor(&p, &h);
        let mut out = Vec::new();
        c.on_phase_change(Phase::Surge, Some(Phase::Swell), 0, 0, 48_000, &h, &mut out);
        // First recurring trigger is at beat 32.
        assert!(c.on_beat(31, 31 * 48_000, &h).is_none());
        assert!(c.on_beat(32, 32 * 48_000, &h).is_some());
        assert!(c.on_beat(33, 33 * 48_000, &h).is_none());
        // Next fires at 64.
        assert!(c.on_beat(63, 63 * 48_000, &h).is_none());
        let second = c.on_beat(64, 64 * 48_000, &h).expect("recurring at 64");
        assert_eq!(second.kind, CueKind::SurgeRecurring);
    }

    #[test]
    fn phase_change_emits_silence_plus_entry() {
        let p = palette_by_name("dark_techno").unwrap();
        let h = harmony_env(&p);
        let mut c = conductor(&p, &h);
        let mut out = Vec::new();
        c.on_phase_change(Phase::Swell, Some(Phase::Pulse), 1_000, 8, 48_000, &h, &mut out);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].kind, CueKind::PhaseTransitionSilence);
        assert_eq!(out[1].kind, CueKind::SwellEntry);
        assert!(out[1].harmonized);
        // Harmonized_3rds renders 8 notes (pairs).
        assert_eq!(out[1].note_count, 8);
    }

    #[test]
    fn maelstrom_emits_canon_voice_shifted_by_2_beats() {
        let p = palette_by_name("dark_techno").unwrap();
        let h = harmony_env(&p);
        let mut c = conductor(&p, &h);
        let mut out = Vec::new();
        let samples_per_beat = 48_000u64;
        c.on_phase_change(
            Phase::Maelstrom,
            Some(Phase::Storm),
            10_000,
            100,
            samples_per_beat,
            &h,
            &mut out,
        );
        // silence + intimacy + voice1 + voice2
        assert_eq!(out.len(), 4);
        assert_eq!(out[2].kind, CueKind::MaelstromEntry);
        assert!(!out[2].is_canon_voice);
        assert_eq!(out[3].kind, CueKind::MaelstromEntry);
        assert!(out[3].is_canon_voice);
        assert_eq!(out[3].beat_time, 10_000 + samples_per_beat * 2);
        // Augmented tempo.
        assert!((out[2].tempo_mult - 2.0).abs() < 1e-6);
        assert!((out[3].tempo_mult - 2.0).abs() < 1e-6);
    }

    #[test]
    fn storm_entry_delayed_by_one_beat() {
        let p = palette_by_name("dark_techno").unwrap();
        let h = harmony_env(&p);
        let mut c = conductor(&p, &h);
        let mut out = Vec::new();
        let spb = 48_000u64;
        c.on_phase_change(Phase::Storm, Some(Phase::Surge), 5_000, 64, spb, &h, &mut out);
        // Silence + StormEntry (delayed).
        let storm = out.iter().find(|c| c.kind == CueKind::StormEntry).unwrap();
        assert_eq!(storm.beat_time, 5_000 + spb);
    }

    #[test]
    fn inverted_variation_flips_intervals() {
        let p = palette_by_name("dark_techno").unwrap();
        let h = harmony_env(&p);
        let mut rng = Mulberry32::new(7);
        let m = generate_motif(&h, &mut rng);
        let orig = render_variation(&m, VariationKind::Original, &h, DEFAULT_OCTAVE);
        let inv = render_variation(&m, VariationKind::Inverted, &h, DEFAULT_OCTAVE);
        assert_eq!(orig[0], inv[0]);
        // Sum of original intervals + sum of inverted intervals = 0 modulo
        // the first-note anchor.
        let orig_range: i32 = orig[orig.len() - 1] - orig[0];
        let inv_range: i32 = inv[inv.len() - 1] - inv[0];
        assert_eq!(orig_range, -inv_range);
    }
}
