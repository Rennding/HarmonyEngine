//! Palette data — Phase 1 ships `dark_techno` only. The other nine port in
//! Phase 2a per SPEC_057 §4.
//!
//! JS reference: `src/harmony.js:84` (`PALETTES[0] = { name: 'dark_techno', ... }`).
//! Only fields consumed by the Phase 1 audio path are represented — arrangement
//! fields (motif, contour, phrasing, IR, intervalAffinity, tension.*, etc.)
//! port alongside their consumers.

use crate::config::Phase;

#[derive(Clone, Copy, Debug)]
pub enum Wave {
    Sine,
    Triangle,
    Square,
    Sawtooth,
    Noise,
}

#[derive(Clone, Copy, Debug)]
pub struct DrumVoice {
    pub wave: Wave,
    pub freq: f32,
    pub decay: f32,
}

#[derive(Clone, Copy, Debug)]
pub enum DrumPattern {
    FourOnFloor,
    Backbeat,
    Offbeat8th,
    Euclidean5_8,
}

#[derive(Clone, Copy, Debug)]
pub struct DrumKit {
    pub kick: DrumVoice,
    pub kick_pattern: DrumPattern,
    pub snare: DrumVoice,
    pub snare_pattern: DrumPattern,
    pub hat: DrumVoice,
    pub hat_pattern: DrumPattern,
    pub perc: DrumVoice,
}

/// `palette.bass` — per-palette bass configuration.
#[derive(Clone, Copy, Debug)]
pub struct BassConfig {
    pub wave: Wave,
    pub octave: i32,
    pub filter_cutoff: f32,
    pub filter_resonance: f32,
    /// SPEC_028 per-palette tier cap. dark_techno = 2.
    pub tier_cap: u32,
    pub gain_scalar: f32,
    /// SPEC_028 per-phase filter cutoff override. `None` = use `filter_cutoff`.
    pub phase_filter: [Option<f32>; 5],
}

/// `palette.pad` — Phase 1 uses pad as a held chord sustain.
#[derive(Clone, Copy, Debug)]
pub struct PadConfig {
    pub wave: Wave,
    pub octave: i32,
    pub attack: f32,
    pub release: f32,
    pub detune_cents: f32,
}

/// `palette.chord` — SPEC_032 §4.4 per-palette chord articulation. Phase 1
/// supports the stab style for dark_techno; comp/arp styles come in Phase 2a.
#[derive(Clone, Copy, Debug)]
pub struct ChordConfig {
    pub voices: u32,
    pub attack: f32,
    pub decay: f32,
    pub sustain_level: f32,
    pub release: f32,
    pub octave: i32,
    pub lpf_cutoff: f32,
    pub lpf_resonance: f32,
    pub gain_scalar: f32,
    pub entry_phase: Phase,
}

/// `palette.melody` — SPEC_032 §3.3. Phase 1 melody is stubbed; a pad-like
/// legato line on the minor-pentatonic root is used as placeholder audible
/// layer. Full MelodyEngine port is Phase 2a.
#[derive(Clone, Copy, Debug)]
pub struct MelodyConfig {
    pub octave: i32,
    pub attack: f32,
    pub decay: f32,
    pub sustain_level: f32,
    pub release: f32,
    pub lpf_cutoff: f32,
    pub lpf_env_amount: f32,
    pub lpf_env_decay: f32,
    pub lpf_resonance: f32,
    pub gain_scalar: f32,
}

/// `palette.chordProgressions[*]` — three progression sets per dark_techno.
/// Each set has three sections A/B/C (Roman-numeral list) and a form
/// indicating the section cycle (e.g. `['A','B','A','C']`).
#[derive(Clone, Debug)]
pub struct Progression {
    pub section_a: Vec<&'static str>,
    pub section_b: Vec<&'static str>,
    pub section_c: Vec<&'static str>,
    pub form: Vec<char>,
    pub phase: &'static str,
}

#[derive(Clone, Debug)]
pub struct Palette {
    pub name: &'static str,
    pub bpm_range: (u32, u32),
    pub scale: &'static str, // e.g. "minorPentatonic"
    pub drums: DrumKit,
    pub bass: BassConfig,
    pub pad: PadConfig,
    pub chord: ChordConfig,
    pub melody: MelodyConfig,
    pub progressions: Vec<Progression>,
    pub beats_per_chord: u32, // JS `HarmonyEngine._beatsPerChord` default = 4
}

/// JS `harmony.js:84` — dark_techno.
pub fn dark_techno() -> Palette {
    Palette {
        name: "dark_techno",
        bpm_range: (125, 140),
        scale: "minorPentatonic",
        drums: DrumKit {
            kick: DrumVoice {
                wave: Wave::Sine,
                freq: 55.0,
                decay: 0.3,
            },
            kick_pattern: DrumPattern::FourOnFloor,
            snare: DrumVoice {
                wave: Wave::Noise,
                freq: 200.0,
                decay: 0.15,
            },
            snare_pattern: DrumPattern::Backbeat,
            hat: DrumVoice {
                wave: Wave::Noise,
                freq: 8000.0,
                decay: 0.03,
            },
            hat_pattern: DrumPattern::Offbeat8th,
            perc: DrumVoice {
                wave: Wave::Triangle,
                freq: 800.0,
                decay: 0.05,
            },
        },
        bass: BassConfig {
            wave: Wave::Sawtooth,
            octave: 2,
            filter_cutoff: 400.0,
            filter_resonance: 8.0,
            tier_cap: 2,
            gain_scalar: 1.0,
            phase_filter: [None, None, None, Some(500.0), Some(600.0)],
        },
        pad: PadConfig {
            wave: Wave::Triangle,
            octave: 4,
            attack: 0.8,
            release: 1.2,
            detune_cents: 12.0,
        },
        chord: ChordConfig {
            voices: 2,
            attack: 0.005,
            decay: 0.10,
            sustain_level: 0.0,
            release: 0.04,
            octave: 4,
            lpf_cutoff: 1600.0,
            lpf_resonance: 2.0,
            gain_scalar: 0.9,
            entry_phase: Phase::Swell,
        },
        melody: MelodyConfig {
            octave: 4,
            attack: 0.02,
            decay: 0.08,
            sustain_level: 0.3,
            release: 0.06,
            lpf_cutoff: 1800.0,
            lpf_env_amount: 800.0,
            lpf_env_decay: 0.12,
            lpf_resonance: 4.0,
            gain_scalar: 1.0,
        },
        progressions: vec![
            Progression {
                section_a: vec!["i", "VI", "III", "VII"],
                section_b: vec!["iv", "i", "v", "III"],
                section_c: vec!["bVI", "bVII", "i", "v"],
                form: vec!['A', 'B', 'A', 'C'],
                phase: "default",
            },
            Progression {
                section_a: vec!["i", "iv", "v", "i"],
                section_b: vec!["VI", "III", "VII", "iv"],
                section_c: vec!["i", "bVII", "v", "i"],
                form: vec!['A', 'A', 'B', 'C'],
                phase: "default",
            },
            Progression {
                section_a: vec!["i", "VII", "VI", "v"],
                section_b: vec!["iv", "VII", "III", "i"],
                section_c: vec!["bVI", "iv", "v", "i"],
                form: vec!['A', 'B', 'A', 'C'],
                phase: "storm",
            },
        ],
        beats_per_chord: 4,
    }
}
