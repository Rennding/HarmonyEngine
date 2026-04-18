//! Audio diagnostic system — port of `src/diagnostic.js` (SPEC_042) plus
//! the four per-voice detectors that come online with the Rust per-voice
//! split (SPEC_057 §4 Phase 2a).
//!
//! All detectors are observational — they read snapshots provided by the
//! sequencer / voice workers / plan publisher and never touch the audio
//! signal path. Anomalies are written to a 50-entry ring buffer
//! (`DiagnosticLog`) and emitted to stderr; the Slint diagnostic panel
//! lands in Phase 3.
//!
//! Detector layout:
//! * **SPEC_042 (9):** clip_watch, gain_spike, silence_drop, pump_detect,
//!   voice_flood, voice_steal_storm, voice_leak, low_end_stack,
//!   flat_dynamics.
//! * **SPEC_057 §4 (4):** voice_jitter, ring_underrun, ring_overflow,
//!   plan_publish_latency.
//!
//! Threshold constants live in `crate::config::diagnostic`.

use std::collections::VecDeque;
use std::time::Duration;

use crate::config::diagnostic as cfg;
use crate::config::Phase;

// ── DIAGNOSTIC_VOCAB — 18 human terms ───────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VocabTerm {
    Muddy,
    Boomy,
    Harsh,
    Brittle,
    Thin,
    Honky,
    Dull,
    Clipping,
    Pumping,
    SilenceGap,
    Monotone,
    Cluttered,
    Poppy,
    Washy,
    Flat,
    Dissonant,
    Jarring,
    Sloppy,
}

impl VocabTerm {
    /// Human label — mirrors `DIAGNOSTIC_VOCAB[term].label` in JS.
    pub fn label(self) -> &'static str {
        match self {
            VocabTerm::Muddy => "Muddy",
            VocabTerm::Boomy => "Boomy",
            VocabTerm::Harsh => "Harsh",
            VocabTerm::Brittle => "Brittle",
            VocabTerm::Thin => "Thin",
            VocabTerm::Honky => "Honky",
            VocabTerm::Dull => "Dull",
            VocabTerm::Clipping => "Clipping",
            VocabTerm::Pumping => "Pumping",
            VocabTerm::SilenceGap => "Silence gap",
            VocabTerm::Monotone => "Monotone",
            VocabTerm::Cluttered => "Cluttered",
            VocabTerm::Poppy => "Poppy",
            VocabTerm::Washy => "Washy",
            VocabTerm::Flat => "Flat",
            VocabTerm::Dissonant => "Dissonant",
            VocabTerm::Jarring => "Jarring",
            VocabTerm::Sloppy => "Sloppy",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Severity {
    Info,
    Warning,
    Error,
}

impl Severity {
    fn marker(self) -> &'static str {
        match self {
            Severity::Info => "[info]",
            Severity::Warning => "[warn]",
            Severity::Error => "[error]",
        }
    }
}

/// A single diagnostic anomaly. `message` carries detector-specific text;
/// `context` packs the player-state snapshot at log time.
#[derive(Clone, Debug)]
pub struct DiagnosticEntry {
    pub beat: u64,
    pub severity: Severity,
    pub vocab: VocabTerm,
    pub message: String,
    pub context: DiagnosticContext,
}

#[derive(Clone, Debug, Default)]
pub struct DiagnosticContext {
    pub phase: Option<Phase>,
    pub dc: Option<f64>,
    pub palette: Option<&'static str>,
    pub seed: Option<i32>,
}

// ── DiagnosticLog — 50-entry ring buffer ────────────────────────────────────

pub struct DiagnosticLog {
    entries: VecDeque<DiagnosticEntry>,
    max_entries: usize,
    /// When true, every push is also written to stderr. The Slint panel
    /// sets this to false to avoid double-printing.
    stderr_emit: bool,
}

impl Default for DiagnosticLog {
    fn default() -> Self {
        Self::new()
    }
}

impl DiagnosticLog {
    pub fn new() -> Self {
        Self {
            entries: VecDeque::with_capacity(cfg::LOG_MAX),
            max_entries: cfg::LOG_MAX,
            stderr_emit: true,
        }
    }

    pub fn set_stderr_emit(&mut self, on: bool) {
        self.stderr_emit = on;
    }

    pub fn push(&mut self, entry: DiagnosticEntry) {
        if self.stderr_emit {
            eprintln!(
                "{} [beat {}] {}: {}",
                entry.severity.marker(),
                entry.beat,
                entry.vocab.label(),
                entry.message
            );
        }
        self.entries.push_front(entry);
        while self.entries.len() > self.max_entries {
            self.entries.pop_back();
        }
    }

    pub fn entries(&self) -> impl Iterator<Item = &DiagnosticEntry> {
        self.entries.iter()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }
}

// ── Track snapshot — per-beat input to the SPEC_042 detectors ───────────────

/// Per-track gain values pulled from `_trackGains` in JS. The Rust
/// audio thread renders mix once per block; the sequencer copies the
/// current per-track post-fader gain into this struct each beat for the
/// detector pass.
#[derive(Clone, Copy, Debug, Default)]
pub struct TrackGains {
    pub kick: f32,
    pub bass: f32,
    pub snare: f32,
    pub hat: f32,
    pub pad: f32,
    pub perc: f32,
    pub melody: f32,
    pub chord: f32,
}

impl TrackGains {
    pub fn iter(&self) -> [(&'static str, f32); 8] {
        [
            ("kick", self.kick),
            ("bass", self.bass),
            ("snare", self.snare),
            ("hat", self.hat),
            ("pad", self.pad),
            ("perc", self.perc),
            ("melody", self.melody),
            ("chord", self.chord),
        ]
    }
}

/// Master-bus snapshot for clip detection.
#[derive(Clone, Copy, Debug, Default)]
pub struct MasterSnapshot {
    pub master_gain: f32,
    /// Limiter gain reduction in dB (negative = reducing).
    pub limiter_reduction_db: f32,
}

/// Voice-pool snapshot — per-beat counts. `pool_size` is included so
/// the formatted message can show "n/N voices active".
#[derive(Clone, Copy, Debug, Default)]
pub struct VoiceSnapshot {
    pub active: usize,
    pub steals_this_beat: usize,
    pub pool_size: usize,
}

// ── AnomalyDetector — per-beat runner ───────────────────────────────────────

#[derive(Default)]
pub struct AnomalyDetector {
    prev_gains: Option<TrackGains>,
    pump_history: PumpHistory,
    voice_count_history: VecDeque<usize>,
    dc_history: VecDeque<f64>,
    /// Skip silence_drop while the stagger transition is active.
    pub stagger_active: bool,
    /// Skip flat_dynamics while a TensionMap plateau event is active.
    pub plateau_active: bool,
}

#[derive(Default)]
struct PumpHistory {
    bass: VecDeque<f32>,
    pad: VecDeque<f32>,
}

impl AnomalyDetector {
    pub fn new() -> Self {
        Self::default()
    }

    /// Reset all accumulated state — call at song-start.
    pub fn reset(&mut self) {
        self.prev_gains = None;
        self.pump_history = PumpHistory::default();
        self.voice_count_history.clear();
        self.dc_history.clear();
        self.stagger_active = false;
        self.plateau_active = false;
    }

    /// JS `AnomalyDetector.runAll()` — invoke every detector once per beat.
    /// `vp_reset` is called at the end so the caller can zero the per-beat
    /// VoicePool counters.
    #[allow(clippy::too_many_arguments)]
    pub fn run_all(
        &mut self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: DiagnosticContext,
        gains: TrackGains,
        master: MasterSnapshot,
        voices: VoiceSnapshot,
    ) {
        self.clip_watch(log, beat, &ctx, gains, master);
        self.gain_spike(log, beat, &ctx, gains);
        self.silence_drop(log, beat, &ctx, gains);
        self.pump_detect(log, beat, &ctx, gains);
        self.voice_flood(log, beat, &ctx, voices);
        self.voice_steal_storm(log, beat, &ctx, voices);
        self.voice_leak(log, beat, &ctx, voices);
        self.low_end_stack(log, beat, &ctx, gains);
        self.flat_dynamics(log, beat, &ctx);
        self.prev_gains = Some(gains);
    }

    // ── SPEC_042 detectors ─────────────────────────────────────────────

    fn clip_watch(
        &self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
        gains: TrackGains,
        master: MasterSnapshot,
    ) {
        for (name, g) in gains.iter() {
            if g > cfg::CLIP_TRACK_MAX {
                log.push(DiagnosticEntry {
                    beat,
                    severity: Severity::Error,
                    vocab: VocabTerm::Clipping,
                    message: format!("{name} track gain {g:.2}"),
                    context: ctx.clone(),
                });
                return;
            }
        }
        if master.master_gain > cfg::CLIP_MASTER_MAX {
            log.push(DiagnosticEntry {
                beat,
                severity: Severity::Error,
                vocab: VocabTerm::Clipping,
                message: format!("master gain {:.2}", master.master_gain),
                context: ctx.clone(),
            });
            return;
        }
        if master.limiter_reduction_db < -cfg::CLIP_LIMITER_DB {
            log.push(DiagnosticEntry {
                beat,
                severity: Severity::Error,
                vocab: VocabTerm::Clipping,
                message: format!(
                    "limiter reducing {:.1}dB",
                    master.limiter_reduction_db.abs()
                ),
                context: ctx.clone(),
            });
        }
    }

    fn gain_spike(
        &self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
        gains: TrackGains,
    ) {
        let Some(prev) = self.prev_gains else {
            return;
        };
        for ((name, cur), (_, p)) in gains.iter().iter().zip(prev.iter().iter()) {
            if (cur - p).abs() > cfg::GAIN_SPIKE_DELTA {
                log.push(DiagnosticEntry {
                    beat,
                    severity: Severity::Warning,
                    vocab: VocabTerm::Brittle,
                    message: format!("{name} gain jumped {p:.2}\u{2192}{cur:.2}"),
                    context: ctx.clone(),
                });
            }
        }
    }

    fn silence_drop(
        &self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
        gains: TrackGains,
    ) {
        if self.stagger_active {
            return;
        }
        let Some(prev) = self.prev_gains else {
            return;
        };
        // Skip kick — it's expected to drop at cycle bridge.
        let pairs = [
            ("bass", gains.bass, prev.bass),
            ("snare", gains.snare, prev.snare),
            ("hat", gains.hat, prev.hat),
            ("pad", gains.pad, prev.pad),
            ("perc", gains.perc, prev.perc),
            ("melody", gains.melody, prev.melody),
            ("chord", gains.chord, prev.chord),
        ];
        for (name, cur, p) in pairs {
            if p > cfg::SILENCE_DROP_THRESHOLD && cur < 0.01 {
                log.push(DiagnosticEntry {
                    beat,
                    severity: Severity::Warning,
                    vocab: VocabTerm::SilenceGap,
                    message: format!("{name} dropped from {p:.2} to 0"),
                    context: ctx.clone(),
                });
            }
        }
    }

    fn pump_detect(
        &mut self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
        gains: TrackGains,
    ) {
        for (name, history, value) in [
            ("bass", &mut self.pump_history.bass, gains.bass),
            ("pad", &mut self.pump_history.pad, gains.pad),
        ] {
            history.push_back(value);
            while history.len() > cfg::PUMP_WINDOW {
                history.pop_front();
            }
            if history.len() >= cfg::PUMP_WINDOW {
                let mut min = f32::INFINITY;
                let mut max = f32::NEG_INFINITY;
                for &v in history.iter() {
                    min = min.min(v);
                    max = max.max(v);
                }
                if max - min > cfg::PUMP_RANGE {
                    log.push(DiagnosticEntry {
                        beat,
                        severity: Severity::Warning,
                        vocab: VocabTerm::Pumping,
                        message: format!(
                            "{name} gain swing {min:.2}\u{2192}{max:.2} in {} beats",
                            cfg::PUMP_WINDOW
                        ),
                        context: ctx.clone(),
                    });
                    history.clear();
                }
            }
        }
    }

    fn voice_flood(
        &self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
        voices: VoiceSnapshot,
    ) {
        if voices.active > cfg::VOICE_FLOOD_THRESHOLD {
            log.push(DiagnosticEntry {
                beat,
                severity: Severity::Warning,
                vocab: VocabTerm::Cluttered,
                message: format!(
                    "{}/{} voices active",
                    voices.active, voices.pool_size
                ),
                context: ctx.clone(),
            });
        }
    }

    fn voice_steal_storm(
        &self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
        voices: VoiceSnapshot,
    ) {
        if voices.steals_this_beat > cfg::VOICE_STEAL_MAX {
            log.push(DiagnosticEntry {
                beat,
                severity: Severity::Error,
                vocab: VocabTerm::Poppy,
                message: format!("{} voice steals this beat", voices.steals_this_beat),
                context: ctx.clone(),
            });
        }
    }

    fn voice_leak(
        &mut self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
        voices: VoiceSnapshot,
    ) {
        self.voice_count_history.push_back(voices.active);
        while self.voice_count_history.len() > cfg::VOICE_LEAK_BEATS + 1 {
            self.voice_count_history.pop_front();
        }
        if self.voice_count_history.len() >= cfg::VOICE_LEAK_BEATS {
            let mut rising = true;
            let h: Vec<usize> = self.voice_count_history.iter().copied().collect();
            for i in 1..h.len() {
                if h[i] <= h[i - 1] {
                    rising = false;
                    break;
                }
            }
            if rising {
                log.push(DiagnosticEntry {
                    beat,
                    severity: Severity::Warning,
                    vocab: VocabTerm::Cluttered,
                    message: format!(
                        "voice count rising for {}+ beats (leak?): {}/{}",
                        cfg::VOICE_LEAK_BEATS,
                        voices.active,
                        voices.pool_size
                    ),
                    context: ctx.clone(),
                });
                self.voice_count_history.clear();
            }
        }
    }

    fn low_end_stack(
        &self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
        gains: TrackGains,
    ) {
        // JS gates this on phase index <= LOW_END_STACK_MAX_PHASE (default
        // 'swell'). Use Phase enum ordering: only flag at Pulse/Swell.
        let allow = matches!(ctx.phase, Some(Phase::Pulse) | Some(Phase::Swell) | None);
        if !allow {
            return;
        }
        if gains.bass > cfg::LOW_END_STACK_GAIN
            && gains.kick > cfg::LOW_END_STACK_GAIN
            && gains.pad > cfg::LOW_END_STACK_GAIN
        {
            let phase_str = ctx
                .phase
                .map(|p| format!("{p:?}"))
                .unwrap_or_else(|| "—".into());
            log.push(DiagnosticEntry {
                beat,
                severity: Severity::Warning,
                vocab: VocabTerm::Boomy,
                message: format!(
                    "bass({:.2}) + kick({:.2}) + pad({:.2}) all >{} in {}",
                    gains.bass,
                    gains.kick,
                    gains.pad,
                    cfg::LOW_END_STACK_GAIN,
                    phase_str
                ),
                context: ctx.clone(),
            });
        }
    }

    fn flat_dynamics(
        &mut self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
    ) {
        if matches!(ctx.phase, Some(Phase::Maelstrom)) {
            return;
        }
        if self.plateau_active {
            return;
        }
        let Some(dc) = ctx.dc else {
            return;
        };
        self.dc_history.push_back(dc);
        while self.dc_history.len() > cfg::FLAT_DC_BEATS + 1 {
            self.dc_history.pop_front();
        }
        if self.dc_history.len() >= cfg::FLAT_DC_BEATS {
            let mut min = f64::INFINITY;
            let mut max = f64::NEG_INFINITY;
            for &v in self.dc_history.iter() {
                min = min.min(v);
                max = max.max(v);
            }
            if max - min < cfg::FLAT_DC_DELTA {
                log.push(DiagnosticEntry {
                    beat,
                    severity: Severity::Info,
                    vocab: VocabTerm::Flat,
                    message: format!(
                        "DC unchanged ({min:.2}–{max:.2}) for {} beats",
                        cfg::FLAT_DC_BEATS
                    ),
                    context: ctx.clone(),
                });
                self.dc_history.clear();
            }
        }
    }

    // ── SPEC_057 §4 per-voice detectors ────────────────────────────────

    /// Voice-jitter: actual note-on sample index vs scheduled. Caller
    /// passes the absolute deviation in samples; threshold is
    /// `VOICE_JITTER_SAMPLES` (≈ 5 ms at 48 kHz).
    pub fn voice_jitter(
        &self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
        voice_label: &str,
        deviation_samples: i64,
    ) {
        if deviation_samples.abs() > cfg::VOICE_JITTER_SAMPLES {
            log.push(DiagnosticEntry {
                beat,
                severity: Severity::Warning,
                vocab: VocabTerm::Sloppy,
                message: format!(
                    "{voice_label} note-on off by {deviation_samples} samples (>{} thresh)",
                    cfg::VOICE_JITTER_SAMPLES
                ),
                context: ctx.clone(),
            });
        }
    }

    /// Ring-buffer underrun: audio thread tried to drain an event ring
    /// but found it empty when one was expected (e.g. melody worker
    /// stalled). `voice_label` identifies which ring.
    pub fn ring_underrun(
        &self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
        voice_label: &str,
    ) {
        log.push(DiagnosticEntry {
            beat,
            severity: Severity::Warning,
            vocab: VocabTerm::SilenceGap,
            message: format!("{voice_label} ring underrun — worker behind"),
            context: ctx.clone(),
        });
    }

    /// Ring-buffer overflow: worker tried to push but the ring was full.
    /// Indicates the audio thread is draining too slowly or the worker is
    /// over-producing.
    pub fn ring_overflow(
        &self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
        voice_label: &str,
        capacity: usize,
    ) {
        log.push(DiagnosticEntry {
            beat,
            severity: Severity::Error,
            vocab: VocabTerm::Cluttered,
            message: format!("{voice_label} ring overflow (cap={capacity})"),
            context: ctx.clone(),
        });
    }

    /// Plan-publish latency: time between conductor calling `publish()`
    /// and worker calling `pickup()`. Threshold is
    /// `PLAN_PUBLISH_LATENCY_NS` (2 ms).
    pub fn plan_publish_latency(
        &self,
        log: &mut DiagnosticLog,
        beat: u64,
        ctx: &DiagnosticContext,
        latency: Duration,
    ) {
        let ns = latency.as_nanos() as u64;
        if ns > cfg::PLAN_PUBLISH_LATENCY_NS {
            log.push(DiagnosticEntry {
                beat,
                severity: Severity::Warning,
                vocab: VocabTerm::Jarring,
                message: format!(
                    "plan publish→pickup latency {}µs (>{}µs)",
                    ns / 1_000,
                    cfg::PLAN_PUBLISH_LATENCY_NS / 1_000
                ),
                context: ctx.clone(),
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx_default() -> DiagnosticContext {
        DiagnosticContext {
            phase: Some(Phase::Surge),
            dc: Some(0.7),
            palette: Some("dark_techno"),
            seed: Some(12345),
        }
    }

    fn silent_log() -> DiagnosticLog {
        let mut l = DiagnosticLog::new();
        l.set_stderr_emit(false);
        l
    }

    #[test]
    fn vocab_table_matches_js_reference() {
        // JS `DIAGNOSTIC_VOCAB` has 18 terms (issue #70 mistakenly says 17;
        // verified via `grep -c "^  [a-z]\\w*:" diagnostic.js`).
        let all = [
            VocabTerm::Muddy, VocabTerm::Boomy, VocabTerm::Harsh,
            VocabTerm::Brittle, VocabTerm::Thin, VocabTerm::Honky,
            VocabTerm::Dull, VocabTerm::Clipping, VocabTerm::Pumping,
            VocabTerm::SilenceGap, VocabTerm::Monotone, VocabTerm::Cluttered,
            VocabTerm::Poppy, VocabTerm::Washy, VocabTerm::Flat,
            VocabTerm::Dissonant, VocabTerm::Jarring, VocabTerm::Sloppy,
        ];
        assert_eq!(all.len(), 18);
        // Each label is unique and non-empty.
        let mut seen = std::collections::HashSet::new();
        for t in all {
            let l = t.label();
            assert!(!l.is_empty());
            assert!(seen.insert(l), "duplicate label: {l}");
        }
    }

    #[test]
    fn log_caps_at_max_entries() {
        let mut log = silent_log();
        for i in 0..(cfg::LOG_MAX as u64 + 25) {
            log.push(DiagnosticEntry {
                beat: i,
                severity: Severity::Info,
                vocab: VocabTerm::Flat,
                message: format!("entry {i}"),
                context: DiagnosticContext::default(),
            });
        }
        assert_eq!(log.len(), cfg::LOG_MAX);
        // Newest first → first entry should be the last pushed.
        assert_eq!(log.entries().next().unwrap().beat, cfg::LOG_MAX as u64 + 24);
    }

    #[test]
    fn clip_watch_fires_on_track_overshoot() {
        let mut log = silent_log();
        let det = AnomalyDetector::new();
        let gains = TrackGains { bass: 1.05, ..Default::default() };
        det.clip_watch(
            &mut log, 1, &ctx_default(), gains, MasterSnapshot::default(),
        );
        assert_eq!(log.len(), 1);
        let e = log.entries().next().unwrap();
        assert_eq!(e.vocab, VocabTerm::Clipping);
        assert_eq!(e.severity, Severity::Error);
    }

    #[test]
    fn clip_watch_fires_on_limiter_reduction() {
        let mut log = silent_log();
        let det = AnomalyDetector::new();
        let master = MasterSnapshot {
            master_gain: 0.5,
            limiter_reduction_db: -8.0, // > 6 dB threshold
        };
        det.clip_watch(
            &mut log, 1, &ctx_default(), TrackGains::default(), master,
        );
        assert_eq!(log.len(), 1);
        assert!(log
            .entries()
            .next()
            .unwrap()
            .message
            .contains("limiter"));
    }

    #[test]
    fn gain_spike_needs_prev_snapshot() {
        let mut log = silent_log();
        let mut det = AnomalyDetector::new();
        let g1 = TrackGains { melody: 0.1, ..Default::default() };
        let g2 = TrackGains { melody: 0.5, ..g1 }; // delta 0.4 > 0.30 threshold
        det.run_all(
            &mut log,
            1,
            ctx_default(),
            g1,
            MasterSnapshot::default(),
            VoiceSnapshot::default(),
        );
        // First pass: no prev → no spike.
        assert_eq!(log.len(), 0);
        det.run_all(
            &mut log,
            2,
            ctx_default(),
            g2,
            MasterSnapshot::default(),
            VoiceSnapshot::default(),
        );
        assert!(log
            .entries()
            .any(|e| e.vocab == VocabTerm::Brittle));
    }

    #[test]
    fn silence_drop_skipped_when_stagger_active() {
        let mut log = silent_log();
        let mut det = AnomalyDetector::new();
        det.stagger_active = true;
        let g1 = TrackGains { melody: 0.5, ..Default::default() };
        let g2 = TrackGains::default(); // melody = 0
        det.prev_gains = Some(g1);
        det.silence_drop(&mut log, 1, &ctx_default(), g2);
        assert_eq!(log.len(), 0);
    }

    #[test]
    fn silence_drop_fires_when_track_falls_to_zero() {
        let mut log = silent_log();
        let mut det = AnomalyDetector::new();
        let g1 = TrackGains { melody: 0.5, ..Default::default() };
        let g2 = TrackGains::default();
        det.prev_gains = Some(g1);
        det.silence_drop(&mut log, 1, &ctx_default(), g2);
        assert_eq!(log.len(), 1);
        assert_eq!(log.entries().next().unwrap().vocab, VocabTerm::SilenceGap);
    }

    #[test]
    fn pump_detect_flags_bass_swing() {
        let mut log = silent_log();
        let mut det = AnomalyDetector::new();
        let beats: [f32; 4] = [0.1, 0.6, 0.1, 0.6]; // range 0.5 > 0.40
        for (i, &g) in beats.iter().enumerate() {
            let gains = TrackGains { bass: g, ..Default::default() };
            det.pump_detect(&mut log, i as u64, &ctx_default(), gains);
        }
        assert!(log
            .entries()
            .any(|e| e.vocab == VocabTerm::Pumping));
    }

    #[test]
    fn voice_flood_fires_above_threshold() {
        let mut log = silent_log();
        let det = AnomalyDetector::new();
        let v = VoiceSnapshot {
            active: cfg::VOICE_FLOOD_THRESHOLD + 1,
            steals_this_beat: 0,
            pool_size: 16,
        };
        det.voice_flood(&mut log, 1, &ctx_default(), v);
        assert_eq!(log.len(), 1);
        assert_eq!(log.entries().next().unwrap().vocab, VocabTerm::Cluttered);
    }

    #[test]
    fn voice_steal_storm_fires_above_threshold() {
        let mut log = silent_log();
        let det = AnomalyDetector::new();
        let v = VoiceSnapshot {
            active: 4,
            steals_this_beat: cfg::VOICE_STEAL_MAX + 1,
            pool_size: 16,
        };
        det.voice_steal_storm(&mut log, 1, &ctx_default(), v);
        assert_eq!(log.len(), 1);
        let e = log.entries().next().unwrap();
        assert_eq!(e.vocab, VocabTerm::Poppy);
        assert_eq!(e.severity, Severity::Error);
    }

    #[test]
    fn voice_leak_detects_monotonic_rise() {
        let mut log = silent_log();
        let mut det = AnomalyDetector::new();
        for i in 0..cfg::VOICE_LEAK_BEATS {
            let v = VoiceSnapshot {
                active: i + 1,
                steals_this_beat: 0,
                pool_size: 16,
            };
            det.voice_leak(&mut log, i as u64, &ctx_default(), v);
        }
        assert!(log
            .entries()
            .any(|e| e.vocab == VocabTerm::Cluttered
                && e.message.contains("leak")));
    }

    #[test]
    fn low_end_stack_only_in_low_phases() {
        let mut log = silent_log();
        let det = AnomalyDetector::new();
        let gains = TrackGains {
            bass: 0.7,
            kick: 0.7,
            pad: 0.7,
            ..Default::default()
        };

        // Surge — should NOT fire (above max phase).
        let mut ctx = ctx_default();
        ctx.phase = Some(Phase::Surge);
        det.low_end_stack(&mut log, 1, &ctx, gains);
        assert_eq!(log.len(), 0);

        // Swell — SHOULD fire.
        ctx.phase = Some(Phase::Swell);
        det.low_end_stack(&mut log, 2, &ctx, gains);
        assert_eq!(log.len(), 1);
        assert_eq!(log.entries().next().unwrap().vocab, VocabTerm::Boomy);
    }

    #[test]
    fn flat_dynamics_skipped_in_maelstrom() {
        let mut log = silent_log();
        let mut det = AnomalyDetector::new();
        let mut ctx = ctx_default();
        ctx.phase = Some(Phase::Maelstrom);
        for i in 0..(cfg::FLAT_DC_BEATS + 5) {
            ctx.dc = Some(0.5);
            det.flat_dynamics(&mut log, i as u64, &ctx);
        }
        assert_eq!(log.len(), 0);
    }

    #[test]
    fn flat_dynamics_fires_when_dc_unchanged() {
        let mut log = silent_log();
        let mut det = AnomalyDetector::new();
        let mut ctx = ctx_default();
        ctx.phase = Some(Phase::Surge);
        for i in 0..cfg::FLAT_DC_BEATS {
            ctx.dc = Some(0.50); // dead flat
            det.flat_dynamics(&mut log, i as u64, &ctx);
        }
        assert!(log
            .entries()
            .any(|e| e.vocab == VocabTerm::Flat));
    }

    // ── Per-voice detectors ───────────────────────────────────────────

    #[test]
    fn voice_jitter_fires_above_5ms() {
        let mut log = silent_log();
        let det = AnomalyDetector::new();
        // 300 samples > 240 threshold (≈5ms @ 48kHz).
        det.voice_jitter(&mut log, 1, &ctx_default(), "melody", 300);
        assert_eq!(log.len(), 1);
        assert_eq!(log.entries().next().unwrap().vocab, VocabTerm::Sloppy);
    }

    #[test]
    fn voice_jitter_silent_below_threshold() {
        let mut log = silent_log();
        let det = AnomalyDetector::new();
        det.voice_jitter(&mut log, 1, &ctx_default(), "melody", 100);
        assert_eq!(log.len(), 0);
    }

    #[test]
    fn ring_underrun_logs_silence_gap() {
        let mut log = silent_log();
        let det = AnomalyDetector::new();
        det.ring_underrun(&mut log, 1, &ctx_default(), "harmony");
        assert_eq!(log.len(), 1);
        assert_eq!(log.entries().next().unwrap().vocab, VocabTerm::SilenceGap);
    }

    #[test]
    fn ring_overflow_logs_cluttered_error() {
        let mut log = silent_log();
        let det = AnomalyDetector::new();
        det.ring_overflow(&mut log, 1, &ctx_default(), "rhythm", 64);
        let e = log.entries().next().unwrap();
        assert_eq!(e.vocab, VocabTerm::Cluttered);
        assert_eq!(e.severity, Severity::Error);
    }

    #[test]
    fn plan_publish_latency_fires_above_2ms() {
        let mut log = silent_log();
        let det = AnomalyDetector::new();
        det.plan_publish_latency(
            &mut log, 1, &ctx_default(), Duration::from_micros(2_500),
        );
        assert_eq!(log.len(), 1);
        assert_eq!(log.entries().next().unwrap().vocab, VocabTerm::Jarring);
    }

    #[test]
    fn plan_publish_latency_silent_below_2ms() {
        let mut log = silent_log();
        let det = AnomalyDetector::new();
        det.plan_publish_latency(
            &mut log, 1, &ctx_default(), Duration::from_micros(1_000),
        );
        assert_eq!(log.len(), 0);
    }
}
