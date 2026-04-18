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
}

/// `CFG.DIFFICULTY.CURVES.normal` — dc(beat) = (beat/scale)^exp.
/// Phase 1 hardcodes "normal" mood; mood selection returns in Phase 2a.
pub const DC_SCALE: f64 = 200.0;
pub const DC_EXP: f64 = 1.3;
