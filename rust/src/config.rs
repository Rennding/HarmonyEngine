//! Port of `src/config.js` CFG constants.
//!
//! Only the subset used by the Phase 1 dark_techno audio path is included —
//! Phase 2a/2b will extend this as sequencer/melody/state-mapper come online.

/// Base BPM when no palette override is active (`CFG.BPM`).
pub const BPM: u32 = 120;

/// Milliseconds per beat at `BPM` (`CFG.BEAT_MS`). Kept as f64 for scheduler
/// math — JS computes this via a getter, result is identical.
pub fn beat_ms(bpm: u32) -> f64 {
    60_000.0 / bpm as f64
}

/// `CFG.GAIN` — per-track volume scalars. Only the Phase 1 instruments
/// (kick, snare noise/tonal, hat, bass, pad, chord, melody) are included.
pub mod gain {
    pub const KICK: f32 = 0.38;
    pub const SNARE_NOISE: f32 = 0.24;
    pub const SNARE_TONAL: f32 = 0.10;
    pub const HAT: f32 = 0.12;
    pub const PERC: f32 = 0.13;
    pub const BASS: f32 = 0.20;
    pub const MELODY: f32 = 0.06;
    pub const CHORD: f32 = 0.10;
    pub const PAD: f32 = 0.013;
    pub const VOICE: f32 = 0.03;
}

/// `CFG.PHASES` — ordered low→high. Phase is the name; DC threshold
/// is the lower bound for that phase.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Pulse,
    Swell,
    Surge,
    Storm,
    Maelstrom,
}

impl Phase {
    pub const ALL: [Phase; 5] = [
        Phase::Pulse,
        Phase::Swell,
        Phase::Surge,
        Phase::Storm,
        Phase::Maelstrom,
    ];

    /// DC threshold (entry point) for this phase. Matches `CFG.PHASES[i].dc`.
    pub fn dc_threshold(self) -> f64 {
        match self {
            Phase::Pulse => 0.0,
            Phase::Swell => 0.30,
            Phase::Surge => 0.60,
            Phase::Storm => 1.00,
            Phase::Maelstrom => 1.50,
        }
    }

    /// Pick phase from a DC value (highest phase whose threshold is ≤ dc).
    pub fn from_dc(dc: f64) -> Phase {
        let mut out = Phase::Pulse;
        for p in Phase::ALL {
            if dc >= p.dc_threshold() {
                out = p;
            }
        }
        out
    }

    /// `CFG.PHASE_FLOOR[phase][track]` — is this track always audible in
    /// this phase? Stubbed for the Phase 1 dark_techno path (kick/hat/snare/
    /// bass/chord/melody) — full table ports in Phase 2a.
    pub fn floor_kick(self) -> bool {
        true // kick floors in every phase
    }
    pub fn floor_hat(self) -> bool {
        matches!(
            self,
            Phase::Swell | Phase::Surge | Phase::Storm | Phase::Maelstrom
        )
    }
    pub fn floor_snare(self) -> bool {
        matches!(self, Phase::Surge | Phase::Storm | Phase::Maelstrom)
    }
    pub fn floor_bass(self) -> bool {
        matches!(self, Phase::Surge | Phase::Storm | Phase::Maelstrom)
    }
    pub fn floor_chord(self) -> bool {
        matches!(
            self,
            Phase::Swell | Phase::Surge | Phase::Storm | Phase::Maelstrom
        )
    }
    pub fn floor_melody(self) -> bool {
        matches!(
            self,
            Phase::Swell | Phase::Surge | Phase::Storm | Phase::Maelstrom
        )
    }
    pub fn floor_pad(self) -> bool {
        matches!(self, Phase::Storm | Phase::Maelstrom)
    }
    pub fn floor_perc(self) -> bool {
        matches!(self, Phase::Surge | Phase::Storm | Phase::Maelstrom)
    }

    /// `CFG.PHASE_FX[phase].padVoices` — number of pad voices per phase.
    pub fn pad_voices(self) -> u32 {
        match self {
            Phase::Pulse | Phase::Swell => 3,
            Phase::Surge | Phase::Storm | Phase::Maelstrom => 4,
        }
    }
}

/// Per-phase melody density (port of JS `_PHASE_DENSITY` in `melody.js`).
/// `(rest_min, rest_max, max_phrase_len, gain)`.
pub fn melody_density(phase: Phase) -> (u32, u32, u32, f32) {
    match phase {
        Phase::Pulse => (99, 99, 0, 0.0),
        Phase::Swell => (4, 6, 3, 0.35),
        Phase::Surge => (3, 5, 3, 0.50),
        Phase::Storm => (2, 3, 4, 0.75),
        Phase::Maelstrom => (1, 2, 4, 0.90),
    }
}

/// `CFG.DIFFICULTY.CURVES.normal` — dc(beat) = (beat/scale)^exp.
/// Phase 1 hardcodes "normal" mood; mood selection returns in Phase 2a.
pub const DC_SCALE: f64 = 200.0;
pub const DC_EXP: f64 = 1.3;

/// `CFG.TENSION` constants (SPEC_011 §5).
pub mod tension {
    pub const WINDOW_MIN: u32 = 32;
    pub const WINDOW_MAX: u32 = 64;
    pub const GRACE_BEATS: u32 = 16;
    pub const GAP_MIN: u32 = 8;
    pub const PROB_NONE: f64 = 0.40;
    pub const PROB_PLATEAU: f64 = 0.25;
    pub const PROB_SPIKE: f64 = 0.15;
    pub const _PROB_RETREAT: f64 = 0.20;
    // Cumulative thresholds (used in event-type roll).
    pub const CUMUL_NONE: f64 = PROB_NONE; // 0.40
    pub const CUMUL_PLATEAU: f64 = PROB_NONE + PROB_PLATEAU; // 0.65
    pub const CUMUL_SPIKE: f64 = CUMUL_PLATEAU + PROB_SPIKE; // 0.80
    // Duration ranges per event type.
    pub const PLATEAU_MIN: u32 = 16;
    pub const PLATEAU_MAX: u32 = 32;
    pub const PLATEAU_EASE_OUT: u32 = 4;
    pub const SPIKE_MIN: u32 = 8;
    pub const SPIKE_MAX: u32 = 16;
    pub const SPIKE_EASE_IN: u32 = 4;
    pub const SPIKE_EASE_OUT: u32 = 4;
    pub const RETREAT_MIN: u32 = 12;
    pub const RETREAT_MAX: u32 = 24;
    pub const RETREAT_EASE_IN: u32 = 4;
    pub const RETREAT_EASE_OUT: u32 = 8;
    /// Maximum cycleBeat the generator walks to. JS uses 800.
    pub const MAX_BEATS: u32 = 800;
    /// Spike size base = next-phase gap. With 0.30 phase gaps, 0.30 × spikeHeight.
    pub const SPIKE_BASE_GAP: f64 = 0.30;
}

/// `CFG.DIAGNOSTIC` — detector thresholds and per-detector enable flags.
/// Mirrors `diagnostic.js` + `config.js` tuning constants. All thresholds in
/// linear gain unless noted.
pub mod diagnostic {
    /// `DiagnosticLog` ring-buffer capacity.
    pub const LOG_MAX: usize = 50;

    // Gain / voice detectors (SPEC_042).
    pub const CLIP_TRACK_MAX: f32 = 1.0;
    pub const CLIP_MASTER_MAX: f32 = 0.95;
    /// dB of limiter gain-reduction that triggers a clip warning.
    pub const CLIP_LIMITER_DB: f32 = 6.0;
    pub const GAIN_SPIKE_DELTA: f32 = 0.30;
    pub const SILENCE_DROP_THRESHOLD: f32 = 0.30;
    pub const PUMP_WINDOW: usize = 4;
    pub const PUMP_RANGE: f32 = 0.40;
    pub const VOICE_FLOOD_THRESHOLD: usize = 14;
    pub const VOICE_STEAL_MAX: usize = 4;
    pub const VOICE_LEAK_BEATS: usize = 8;
    pub const LOW_END_STACK_GAIN: f32 = 0.50;
    pub const FLAT_DC_BEATS: usize = 16;
    pub const FLAT_DC_DELTA: f64 = 0.05;

    // Per-voice detectors (SPEC_057 §4 Phase 2a).
    /// Voice-jitter threshold: actual note-on vs scheduled beat-time (samples).
    /// 5 ms at 48 kHz ≈ 240 samples.
    pub const VOICE_JITTER_SAMPLES: i64 = 240;
    /// Plan-publish → plan-pickup latency threshold (nanoseconds).
    /// 2 ms = 2_000_000 ns.
    pub const PLAN_PUBLISH_LATENCY_NS: u64 = 2_000_000;

    // Lookahead detectors (SPEC_057 §4 Phase 2b-1 #81).
    /// Lookahead fill floor: chronic under-fill (worker falling behind its
    /// budget) is warned when current fill drops below this fraction of
    /// the worker's capacity budget. 0.25 = 25 % of the budget.
    pub const LOOKAHEAD_FILL_LOW: f32 = 0.25;
    /// Lookahead fill ceiling: chronic over-fill (ring pressure, audio
    /// thread draining too slowly) is warned when current fill exceeds
    /// this fraction. 0.95 = within 5 % of capacity.
    pub const LOOKAHEAD_FILL_HIGH: f32 = 0.95;
    /// Flush-latency threshold in beats. #81 acceptance: drums + melody
    /// must drain within 1 bar after a plan-generation bump.
    pub const FLUSH_LATENCY_MAX_BEATS: f64 = 4.0;
}

/// Phase 2b-2 (#82) feature flags. Each algorithm upgrade lives behind a
/// flag so the golden-parity test vs #81 stays byte-identical when flags
/// are off. Flip per-flag at runtime (`flags::enable_voicing_engine`) or
/// use `flags::enable_all_2b2` to turn everything on (production listen
/// mode). `main.rs --enable-2b2` maps to `enable_all_2b2`.
///
/// Defaults: all flags OFF. Read via the public getters — never touch the
/// atomics directly from call sites. The atomics are `Relaxed` on read
/// (hot path) + `Release`/`Acquire` on write so a thread that observes a
/// flipped flag also sees whatever plan edits preceded the flip.
pub mod flags {
    use std::sync::atomic::{AtomicBool, Ordering};

    static VOICING_ENGINE: AtomicBool = AtomicBool::new(false);
    static HARMONIC_RHYTHM: AtomicBool = AtomicBool::new(false);
    static WALKING_BASS_NEXT_CHORD: AtomicBool = AtomicBool::new(false);
    static CADENTIAL_PLANNING: AtomicBool = AtomicBool::new(false);
    static LOOKAHEAD_ALL_VOICES: AtomicBool = AtomicBool::new(false);

    #[inline]
    pub fn voicing_engine() -> bool {
        VOICING_ENGINE.load(Ordering::Relaxed)
    }
    #[inline]
    pub fn harmonic_rhythm() -> bool {
        HARMONIC_RHYTHM.load(Ordering::Relaxed)
    }
    #[inline]
    pub fn walking_bass_next_chord() -> bool {
        WALKING_BASS_NEXT_CHORD.load(Ordering::Relaxed)
    }
    #[inline]
    pub fn cadential_planning() -> bool {
        CADENTIAL_PLANNING.load(Ordering::Relaxed)
    }
    #[inline]
    pub fn lookahead_all_voices() -> bool {
        LOOKAHEAD_ALL_VOICES.load(Ordering::Relaxed)
    }

    pub fn set_voicing_engine(v: bool) {
        VOICING_ENGINE.store(v, Ordering::Release);
    }
    pub fn set_harmonic_rhythm(v: bool) {
        HARMONIC_RHYTHM.store(v, Ordering::Release);
    }
    pub fn set_walking_bass_next_chord(v: bool) {
        WALKING_BASS_NEXT_CHORD.store(v, Ordering::Release);
    }
    pub fn set_cadential_planning(v: bool) {
        CADENTIAL_PLANNING.store(v, Ordering::Release);
    }
    pub fn set_lookahead_all_voices(v: bool) {
        LOOKAHEAD_ALL_VOICES.store(v, Ordering::Release);
    }

    /// Turn on every Phase 2b-2 upgrade. Production listen mode.
    pub fn enable_all_2b2() {
        set_voicing_engine(true);
        set_harmonic_rhythm(true);
        set_walking_bass_next_chord(true);
        set_cadential_planning(true);
        set_lookahead_all_voices(true);
    }

    /// Reset every flag to its default (off). Used by tests that need to
    /// restore isolation after flipping — always pair with a `Drop` guard
    /// if flags are flipped inside a `#[test]`.
    pub fn disable_all_2b2() {
        set_voicing_engine(false);
        set_harmonic_rhythm(false);
        set_walking_bass_next_chord(false);
        set_cadential_planning(false);
        set_lookahead_all_voices(false);
    }
}

/// Master chain (post-mix) constants — port of JS `audio.js:374–432`.
/// Phase 1b uses a simplified chain: peak compressor → tanh soft-clip →
/// final limiter. The full multi-band EQ + convolver reverb + delay sends
/// land in Phase 2a alongside the per-track EQ chains.
pub mod master {
    /// Compressor threshold (linear amplitude) — JS uses -14 dB.
    pub const COMP_THRESHOLD: f32 = 0.199_526_23; // 10^(-14/20)
    /// Compressor knee width (linear) — JS uses 30 dB knee.
    pub const COMP_KNEE: f32 = 0.5;
    /// Compressor ratio.
    pub const COMP_RATIO: f32 = 2.5;
    /// Compressor attack (s).
    pub const COMP_ATTACK: f32 = 0.003;
    /// Compressor release (s).
    pub const COMP_RELEASE: f32 = 0.250;
    /// Limiter threshold (linear amplitude) — JS uses -2 dB.
    pub const LIM_THRESHOLD: f32 = 0.794_328_2; // 10^(-2/20)
    /// Limiter ratio.
    pub const LIM_RATIO: f32 = 20.0;
    /// Limiter attack (s).
    pub const LIM_ATTACK: f32 = 0.001;
    /// Limiter release (s).
    pub const LIM_RELEASE: f32 = 0.100;
    /// Final master make-up gain (post-everything).
    pub const MASTER_GAIN: f32 = 0.85;
}
