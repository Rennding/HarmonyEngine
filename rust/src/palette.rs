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
    // Kick-role patterns
    FourOnFloor, // dark_techno, synthwave, chiptune (hits on 0,4,8,12)
    HalfTime,    // ambient_dread `sparse_kick`, vaporwave (0 + 8)
    LaidBack,    // lo_fi `lo_fi_kick`, noir_jazz `jazz_kick` (0 + syncopated)
    Syncopated,  // glitch `glitch_kick`, industrial `industrial_kick`
    BreakKick,   // breakbeat `break_kick` (amen-style 0, 2.5, 10)

    // Snare-role patterns
    Backbeat,   // dark_techno, synthwave, vaporwave, lo_fi, chiptune (4, 12)
    Scattered,  // glitch, industrial (stuttered 4, 6, 12, 14)
    Ghost,      // ambient_dread `ghost_snare` (mostly ghosts + weak 4,12)
    Jazz,       // noir_jazz `jazz_snare` (brush on 4,12 + ghosts)
    BreakSnare, // breakbeat (4, 10, 12)

    // Hat-role patterns
    Offbeat8th,  // dark_techno, vaporwave (2, 6, 10, 14)
    Straight8th, // synthwave, chiptune, lo_fi (0,2,4,6,8,10,12,14)
    Busy16th,    // glitch, industrial, breakbeat (all 16ths)
    SlowQuarter, // ambient_dread `slow_hat` (0, 4, 8, 12)
    JazzRide,    // noir_jazz `jazz_ride` (swung 8ths with accent)

    // Perc-role patterns (shared by palette)
    Euclidean3_8,
    Euclidean5_8,
    Euclidean7_16,
}

/// `palette.chord.style` — SPEC_032 §4.4 articulation style selector.
/// Phase 2a-2 ports all four; `Stab` and `None` are fully supported,
/// `Comp`/`Arp` approximate as staggered stab sequences until Phase 2b adds
/// full comp/arp engines.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChordStyle {
    Stab,
    Comp,
    Arp,
    None,
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
    pub style: ChordStyle,
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

/// `palette.melody` — SPEC_032 §3.3 + Phase 1b synth chain.
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
    pub staccato: bool,
    /// `palette.melody.narrativeMotif` — when false, `NarrativeConductor`
    /// skips motif cues for this palette (legato-bloom palettes drown in
    /// narrative stabs). See `harmony.js:330` etc.
    pub narrative_motif: bool,
}

/// `palette.melodyRhythm` — note-rhythm controls for MelodyEngine.
#[derive(Clone, Copy, Debug)]
pub struct MelodyRhythm {
    pub hold_probability: f32,
    pub syncopation_probability: f32,
}

/// `palette.groove` — swing / humanize / ghost probability base values.
/// Phase multipliers live in `GrooveEngine::onPhaseChange` (see groove.rs).
/// JS reference: per-palette `groove: { swing, humanize }` in harmony.js.
#[derive(Clone, Copy, Debug)]
pub struct GrooveConfig {
    /// 0.0 = dead straight, 0.5 = triplet shuffle. Applied to odd 16ths.
    pub swing: f32,
    /// Per-note random timing deviation window in milliseconds.
    pub humanize_ms: f32,
}

/// `palette.motif` + `motif.variationWeights` — phrase generation controls.
/// Each phase weight is a probability mass over (repeat, transpose, invert,
/// diminish, fragment); zero entries mean "never pick that variation".
#[derive(Clone, Copy, Debug)]
pub struct VariationWeights {
    pub repeat: f32,
    pub transpose: f32,
    pub invert: f32,
    pub diminish: f32,
    pub fragment: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct MotifConfig {
    pub length: usize,
    pub weights_swell: VariationWeights,
    pub weights_surge: VariationWeights,
    pub weights_storm: VariationWeights,
    pub weights_maelstrom: VariationWeights,
}

/// `palette.tension` — SPEC_011 modulation knobs.
#[derive(Clone, Copy, Debug)]
pub struct TensionParams {
    pub event_density: f32,
    pub retreat_depth: f32,
    pub spike_height: f32,
    pub plateau_bias: f32,
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

/// SPEC_040 §3.2 — voicing style vocabulary. Each palette declares one;
/// `VoicingEngine::voice` uses it to arrange chord tones.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VoicingStyle {
    /// Root + P5. No 3rd. dark_techno, industrial.
    Power,
    /// Close-voiced root-position triad. chiptune, breakbeat, glitch.
    Close,
    /// Drop-2 voicing (second-from-top dropped an octave). noir_jazz.
    Drop2,
    /// Wide spread: root low, 3rd/5th/7th higher. synthwave, vaporwave.
    Open,
    /// Root + 3rd + 7th only — skeletal jazz harmony.
    Shell,
    /// Notes packed within a minor 3rd — dissonant stack. ambient_dread.
    Cluster,
    /// add9/sus voicings — root, 5th, 9th spread wide. lo_fi_chill.
    Spread,
}

/// SPEC_040 §3.3 — collision-avoidance mode between chord and melody.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CollisionMode {
    /// Drop chord voices that match the melody pitch class in the same
    /// octave. Preferred default for active-melody palettes.
    Avoid,
    /// Hard register split — clamp chord voices to ≤ MIDI 71 (B4).
    Split,
    /// No collision logic (sparse / ambient palettes).
    None,
}

/// SPEC_040 §3.3 — per-palette `voicing_profile`. `'static` slices in
/// `extensions_*` keep the struct `Copy` and let palette builders return
/// constants without alloc.
#[derive(Clone, Copy, Debug)]
pub struct VoicingProfile {
    pub style: VoicingStyle,
    pub extensions_pulse: &'static [u8],
    pub extensions_swell: &'static [u8],
    pub extensions_surge: &'static [u8],
    pub extensions_storm: &'static [u8],
    pub extensions_maelstrom: &'static [u8],
    /// Lowest octave for chord voices (e.g. 3 → C3 = MIDI 36).
    pub register_floor: i32,
    /// Highest octave for chord voices.
    pub register_ceiling: i32,
    /// Max simultaneous notes allowed in octave 3 (critical-band rule).
    pub max_notes_oct3: u32,
    /// Voice-leading strength — 0 = no smoothing, 1 = always pick the
    /// closest octave to the previous voicing.
    pub voice_lead_strength: f32,
    pub collision: CollisionMode,
}

/// SPEC_040 §4 — phase-driven harmonic rhythm. Beats per chord change at
/// each phase. Sub-beat values (< 1.0) only used by noir_jazz Maelstrom;
/// every other palette has a 1-beat floor.
#[derive(Clone, Copy, Debug)]
pub struct HarmonicRhythm {
    pub pulse_beats: f32,
    pub swell_beats: f32,
    pub surge_beats: f32,
    pub storm_beats: f32,
    pub maelstrom_beats: f32,
}

impl HarmonicRhythm {
    pub fn beats_for(&self, phase: Phase) -> f32 {
        match phase {
            Phase::Pulse => self.pulse_beats,
            Phase::Swell => self.swell_beats,
            Phase::Surge => self.surge_beats,
            Phase::Storm => self.storm_beats,
            Phase::Maelstrom => self.maelstrom_beats,
        }
    }
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
    pub melody_rhythm: MelodyRhythm,
    pub motif: MotifConfig,
    pub tension: TensionParams,
    pub groove: GrooveConfig,
    pub progressions: Vec<Progression>,
    pub beats_per_chord: u32, // JS `HarmonyEngine._beatsPerChord` default = 4
    /// SPEC_040 §3 — voicing profile used by `VoicingEngine::voice` when
    /// `config::flags::voicing_engine()` is on. Off → ChordTrack/PadTrack
    /// fall back to `HarmonyEngine::voiced_chord_tones`.
    pub voicing: VoicingProfile,
    /// SPEC_040 §4 — per-phase chord-change rate, read by HarmonyEngine
    /// when `config::flags::harmonic_rhythm()` is on. Off → the flat
    /// `beats_per_chord` above is used.
    pub harmonic_rhythm: HarmonicRhythm,
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
            style: ChordStyle::Stab,
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
            staccato: true,
            narrative_motif: true,
        },
        melody_rhythm: MelodyRhythm {
            hold_probability: 0.15,
            syncopation_probability: 0.10,
        },
        motif: MotifConfig {
            length: 5,
            weights_swell: VariationWeights {
                repeat: 1.0,
                transpose: 0.0,
                invert: 0.0,
                diminish: 0.0,
                fragment: 0.0,
            },
            weights_surge: VariationWeights {
                repeat: 0.4,
                transpose: 0.6,
                invert: 0.0,
                diminish: 0.0,
                fragment: 0.0,
            },
            weights_storm: VariationWeights {
                repeat: 0.2,
                transpose: 0.3,
                invert: 0.3,
                diminish: 0.2,
                fragment: 0.0,
            },
            weights_maelstrom: VariationWeights {
                repeat: 0.1,
                transpose: 0.2,
                invert: 0.2,
                diminish: 0.2,
                fragment: 0.3,
            },
        },
        tension: TensionParams {
            event_density: 0.6,
            retreat_depth: 0.10,
            spike_height: 0.25,
            plateau_bias: 0.0,
        },
        groove: GrooveConfig { swing: 0.0, humanize_ms: 3.0 },
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
        voicing: VoicingProfile {
            style: VoicingStyle::Power,
            extensions_pulse: &[],
            extensions_swell: &[],
            extensions_surge: &[],
            extensions_storm: &[],
            extensions_maelstrom: &[],
            register_floor: 3,
            register_ceiling: 4,
            max_notes_oct3: 2,
            voice_lead_strength: 0.3,
            collision: CollisionMode::Split,
        },
        harmonic_rhythm: HarmonicRhythm {
            pulse_beats: 32.0,
            swell_beats: 24.0,
            surge_beats: 16.0,
            storm_beats: 8.0,
            maelstrom_beats: 4.0,
        },
    }
}

/// JS `harmony.js:236` — synthwave.
pub fn synthwave() -> Palette {
    Palette {
        name: "synthwave",
        bpm_range: (100, 120),
        scale: "majorPentatonic",
        drums: DrumKit {
            kick: DrumVoice { wave: Wave::Sine, freq: 50.0, decay: 0.35 },
            kick_pattern: DrumPattern::FourOnFloor,
            snare: DrumVoice { wave: Wave::Noise, freq: 180.0, decay: 0.2 },
            snare_pattern: DrumPattern::Backbeat,
            hat: DrumVoice { wave: Wave::Noise, freq: 7000.0, decay: 0.04 },
            hat_pattern: DrumPattern::Straight8th,
            perc: DrumVoice { wave: Wave::Sine, freq: 1200.0, decay: 0.04 },
        },
        bass: BassConfig {
            wave: Wave::Sawtooth, octave: 2,
            filter_cutoff: 600.0, filter_resonance: 5.0,
            tier_cap: 3, gain_scalar: 1.1,
            phase_filter: [None, None, None, Some(700.0), Some(800.0)],
        },
        pad: PadConfig { wave: Wave::Triangle, octave: 4, attack: 1.0, release: 1.5, detune_cents: 10.0 },
        chord: ChordConfig {
            style: ChordStyle::Stab, voices: 3,
            attack: 0.01, decay: 0.18, sustain_level: 0.0, release: 0.06,
            octave: 4, lpf_cutoff: 2800.0, lpf_resonance: 1.0,
            gain_scalar: 1.1, entry_phase: Phase::Swell,
        },
        melody: MelodyConfig {
            octave: 5, attack: 0.08, decay: 0.15, sustain_level: 1.0, release: 0.2,
            lpf_cutoff: 2500.0, lpf_env_amount: 400.0, lpf_env_decay: 0.3, lpf_resonance: 1.0,
            gain_scalar: 1.0, staccato: false, narrative_motif: false,
        },
        melody_rhythm: MelodyRhythm { hold_probability: 0.25, syncopation_probability: 0.35 },
        motif: MotifConfig {
            length: 6,
            weights_swell: VariationWeights { repeat: 1.0, transpose: 0.0, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_surge: VariationWeights { repeat: 0.3, transpose: 0.7, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_storm: VariationWeights { repeat: 0.2, transpose: 0.3, invert: 0.3, diminish: 0.2, fragment: 0.0 },
            weights_maelstrom: VariationWeights { repeat: 0.1, transpose: 0.2, invert: 0.2, diminish: 0.2, fragment: 0.3 },
        },
        tension: TensionParams { event_density: 0.7, retreat_depth: 0.15, spike_height: 0.20, plateau_bias: 0.1 },
        groove: GrooveConfig { swing: 0.15, humanize_ms: 8.0 },
        progressions: vec![
            Progression { section_a: vec!["I","V","vi","IV"], section_b: vec!["I","IV","ii","V"], section_c: vec!["vi","IV","bVII","I"], form: vec!['A','B','A','C'], phase: "default" },
            Progression { section_a: vec!["I","IV","V","I"], section_b: vec!["vi","ii","V","I"], section_c: vec!["IV","iv","I","V"], form: vec!['A','A','B','C'], phase: "default" },
            Progression { section_a: vec!["vi","IV","I","V"], section_b: vec!["ii","V","vi","IV"], section_c: vec!["bVI","bVII","I","V"], form: vec!['A','B','A','C'], phase: "storm" },
        ],
        beats_per_chord: 4,
        voicing: VoicingProfile {
            style: VoicingStyle::Open,
            extensions_pulse: &[],
            extensions_swell: &[],
            extensions_surge: &[7],
            extensions_storm: &[7],
            extensions_maelstrom: &[7],
            register_floor: 3,
            register_ceiling: 5,
            max_notes_oct3: 3,
            voice_lead_strength: 0.7,
            collision: CollisionMode::Avoid,
        },
        harmonic_rhythm: HarmonicRhythm {
            pulse_beats: 8.0,
            swell_beats: 8.0,
            surge_beats: 6.0,
            storm_beats: 4.0,
            maelstrom_beats: 4.0,
        },
    }
}

/// JS `harmony.js:380` — glitch.
pub fn glitch() -> Palette {
    Palette {
        name: "glitch",
        bpm_range: (130, 160),
        scale: "wholeTone",
        drums: DrumKit {
            kick: DrumVoice { wave: Wave::Sine, freq: 60.0, decay: 0.18 },
            kick_pattern: DrumPattern::Syncopated,
            snare: DrumVoice { wave: Wave::Noise, freq: 300.0, decay: 0.08 },
            snare_pattern: DrumPattern::Scattered,
            hat: DrumVoice { wave: Wave::Noise, freq: 10000.0, decay: 0.02 },
            hat_pattern: DrumPattern::Busy16th,
            perc: DrumVoice { wave: Wave::Square, freq: 1500.0, decay: 0.03 },
        },
        bass: BassConfig {
            wave: Wave::Square, octave: 2,
            filter_cutoff: 300.0, filter_resonance: 12.0,
            tier_cap: 2, gain_scalar: 0.85,
            phase_filter: [None, None, None, Some(350.0), Some(400.0)],
        },
        pad: PadConfig { wave: Wave::Triangle, octave: 3, attack: 0.4, release: 0.6, detune_cents: 12.0 },
        chord: ChordConfig {
            style: ChordStyle::Arp, voices: 3,
            attack: 0.003, decay: 0.06, sustain_level: 0.0, release: 0.03,
            octave: 4, lpf_cutoff: 4000.0, lpf_resonance: 1.5,
            gain_scalar: 0.8, entry_phase: Phase::Swell,
        },
        melody: MelodyConfig {
            octave: 5, attack: 0.003, decay: 0.05, sustain_level: 0.0, release: 0.02,
            lpf_cutoff: 5000.0, lpf_env_amount: 0.0, lpf_env_decay: 0.1, lpf_resonance: 0.7,
            gain_scalar: 1.0, staccato: true, narrative_motif: true,
        },
        melody_rhythm: MelodyRhythm { hold_probability: 0.10, syncopation_probability: 0.80 },
        motif: MotifConfig {
            length: 4,
            weights_swell: VariationWeights { repeat: 1.0, transpose: 0.0, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_surge: VariationWeights { repeat: 0.3, transpose: 0.7, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_storm: VariationWeights { repeat: 0.1, transpose: 0.2, invert: 0.3, diminish: 0.4, fragment: 0.0 },
            weights_maelstrom: VariationWeights { repeat: 0.05, transpose: 0.1, invert: 0.15, diminish: 0.3, fragment: 0.4 },
        },
        tension: TensionParams { event_density: 0.9, retreat_depth: 0.20, spike_height: 0.30, plateau_bias: -0.1 },
        groove: GrooveConfig { swing: 0.0, humanize_ms: 15.0 },
        progressions: vec![
            Progression { section_a: vec!["i","II","iii","IV"], section_b: vec!["V","iii","i","II"], section_c: vec!["IV","bVII","II","i"], form: vec!['A','B','A','C'], phase: "default" },
            Progression { section_a: vec!["i","iii","V","VII"], section_b: vec!["II","IV","i","iii"], section_c: vec!["bVI","V","II","i"], form: vec!['A','A','B','C'], phase: "default" },
            Progression { section_a: vec!["i","II","V","i"], section_b: vec!["iii","VII","IV","II"], section_c: vec!["bVII","bVI","V","i"], form: vec!['A','B','B','C'], phase: "storm" },
        ],
        beats_per_chord: 4,
        voicing: VoicingProfile {
            style: VoicingStyle::Close,
            extensions_pulse: &[],
            extensions_swell: &[],
            extensions_surge: &[7],
            extensions_storm: &[7],
            extensions_maelstrom: &[7],
            register_floor: 4,
            register_ceiling: 5,
            max_notes_oct3: 4,
            voice_lead_strength: 0.2,
            collision: CollisionMode::None,
        },
        harmonic_rhythm: HarmonicRhythm {
            pulse_beats: 16.0,
            swell_beats: 8.0,
            surge_beats: 4.0,
            storm_beats: 2.0,
            maelstrom_beats: 1.0,
        },
    }
}

/// JS `harmony.js:524` — ambient_dread.
pub fn ambient_dread() -> Palette {
    Palette {
        name: "ambient_dread",
        bpm_range: (80, 100),
        scale: "locrian",
        drums: DrumKit {
            kick: DrumVoice { wave: Wave::Sine, freq: 45.0, decay: 0.5 },
            kick_pattern: DrumPattern::HalfTime,
            snare: DrumVoice { wave: Wave::Noise, freq: 150.0, decay: 0.25 },
            snare_pattern: DrumPattern::Ghost,
            hat: DrumVoice { wave: Wave::Noise, freq: 6000.0, decay: 0.06 },
            hat_pattern: DrumPattern::SlowQuarter,
            perc: DrumVoice { wave: Wave::Sine, freq: 280.0, decay: 0.08 },
        },
        bass: BassConfig {
            wave: Wave::Sine, octave: 1,
            filter_cutoff: 200.0, filter_resonance: 3.0,
            tier_cap: 1, gain_scalar: 1.2,
            phase_filter: [None, None, None, Some(180.0), Some(200.0)],
        },
        pad: PadConfig { wave: Wave::Sine, octave: 3, attack: 2.0, release: 2.5, detune_cents: 8.0 },
        chord: ChordConfig {
            style: ChordStyle::None, voices: 0,
            attack: 0.0, decay: 0.0, sustain_level: 0.0, release: 0.0,
            octave: 4, lpf_cutoff: 2000.0, lpf_resonance: 0.7,
            gain_scalar: 0.0, entry_phase: Phase::Maelstrom,
        },
        melody: MelodyConfig {
            octave: 4, attack: 0.15, decay: 0.2, sustain_level: 0.7, release: 0.5,
            lpf_cutoff: 1200.0, lpf_env_amount: 0.0, lpf_env_decay: 0.1, lpf_resonance: 0.7,
            gain_scalar: 0.0, // muted per JS — boinging oscillator artifact
            staccato: false,
            narrative_motif: false,
        },
        melody_rhythm: MelodyRhythm { hold_probability: 0.50, syncopation_probability: 0.05 },
        motif: MotifConfig {
            length: 5,
            weights_swell: VariationWeights { repeat: 1.0, transpose: 0.0, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_surge: VariationWeights { repeat: 0.5, transpose: 0.5, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_storm: VariationWeights { repeat: 0.2, transpose: 0.3, invert: 0.3, diminish: 0.2, fragment: 0.0 },
            weights_maelstrom: VariationWeights { repeat: 0.1, transpose: 0.2, invert: 0.3, diminish: 0.1, fragment: 0.3 },
        },
        tension: TensionParams { event_density: 0.5, retreat_depth: 0.12, spike_height: 0.10, plateau_bias: 0.3 },
        groove: GrooveConfig { swing: 0.25, humanize_ms: 12.0 },
        progressions: vec![
            Progression { section_a: vec!["i","ii","v","i"], section_b: vec!["vi","iii","iv","i"], section_c: vec!["bVI","v","ii","i"], form: vec!['A','B','A','C'], phase: "default" },
            Progression { section_a: vec!["i","vi","iii","v"], section_b: vec!["iv","ii","v","i"], section_c: vec!["bII","v","iv","i"], form: vec!['A','A','B','C'], phase: "default" },
            Progression { section_a: vec!["i","iv","vii","i"], section_b: vec!["ii","v","vi","iii"], section_c: vec!["bVI","bVII","v","i"], form: vec!['A','B','A','C'], phase: "storm" },
        ],
        beats_per_chord: 4,
        voicing: VoicingProfile {
            style: VoicingStyle::Cluster,
            extensions_pulse: &[],
            extensions_swell: &[],
            extensions_surge: &[],
            extensions_storm: &[],
            extensions_maelstrom: &[],
            register_floor: 3,
            register_ceiling: 5,
            max_notes_oct3: 3,
            voice_lead_strength: 0.5,
            collision: CollisionMode::None,
        },
        harmonic_rhythm: HarmonicRhythm {
            pulse_beats: 64.0,
            swell_beats: 48.0,
            surge_beats: 32.0,
            storm_beats: 16.0,
            maelstrom_beats: 8.0,
        },
    }
}

/// JS `harmony.js:667` — lo_fi_chill.
pub fn lo_fi_chill() -> Palette {
    Palette {
        name: "lo_fi_chill",
        bpm_range: (75, 90),
        scale: "majorPentatonic",
        drums: DrumKit {
            kick: DrumVoice { wave: Wave::Sine, freq: 50.0, decay: 0.35 },
            kick_pattern: DrumPattern::LaidBack,
            snare: DrumVoice { wave: Wave::Noise, freq: 180.0, decay: 0.2 },
            snare_pattern: DrumPattern::Backbeat,
            hat: DrumVoice { wave: Wave::Noise, freq: 7000.0, decay: 0.05 },
            hat_pattern: DrumPattern::Straight8th,
            perc: DrumVoice { wave: Wave::Triangle, freq: 400.0, decay: 0.06 },
        },
        bass: BassConfig {
            wave: Wave::Sine, octave: 2,
            filter_cutoff: 300.0, filter_resonance: 3.0,
            tier_cap: 2, gain_scalar: 1.1,
            phase_filter: [None, None, None, Some(350.0), Some(400.0)],
        },
        pad: PadConfig { wave: Wave::Sine, octave: 4, attack: 1.5, release: 2.0, detune_cents: 6.0 },
        chord: ChordConfig {
            style: ChordStyle::Comp, voices: 3,
            attack: 0.02, decay: 0.20, sustain_level: 0.15, release: 0.10,
            octave: 4, lpf_cutoff: 1800.0, lpf_resonance: 0.7,
            gain_scalar: 0.7, entry_phase: Phase::Swell,
        },
        melody: MelodyConfig {
            octave: 4, attack: 0.04, decay: 0.15, sustain_level: 0.6, release: 0.15,
            lpf_cutoff: 2000.0, lpf_env_amount: 200.0, lpf_env_decay: 0.2, lpf_resonance: 1.0,
            gain_scalar: 0.9, staccato: false, narrative_motif: true,
        },
        melody_rhythm: MelodyRhythm { hold_probability: 0.35, syncopation_probability: 0.55 },
        motif: MotifConfig {
            length: 6,
            weights_swell: VariationWeights { repeat: 1.0, transpose: 0.0, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_surge: VariationWeights { repeat: 0.4, transpose: 0.6, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_storm: VariationWeights { repeat: 0.2, transpose: 0.3, invert: 0.3, diminish: 0.2, fragment: 0.0 },
            weights_maelstrom: VariationWeights { repeat: 0.1, transpose: 0.2, invert: 0.2, diminish: 0.2, fragment: 0.3 },
        },
        tension: TensionParams { event_density: 0.6, retreat_depth: 0.18, spike_height: 0.12, plateau_bias: 0.2 },
        groove: GrooveConfig { swing: 0.3, humanize_ms: 10.0 },
        progressions: vec![
            Progression { section_a: vec!["ii","V","I","vi"], section_b: vec!["IV","iii","vi","V"], section_c: vec!["ii","bVII","I","IV"], form: vec!['A','B','A','C'], phase: "default" },
            Progression { section_a: vec!["I","vi","ii","V"], section_b: vec!["IV","I","ii","vi"], section_c: vec!["I","IV","bVII","I"], form: vec!['A','A','B','C'], phase: "default" },
            Progression { section_a: vec!["ii","V","vi","IV"], section_b: vec!["I","bVII","IV","V"], section_c: vec!["ii","IV","I","vi"], form: vec!['A','B','A','C'], phase: "storm" },
        ],
        beats_per_chord: 4,
        voicing: VoicingProfile {
            style: VoicingStyle::Spread,
            extensions_pulse: &[],
            extensions_swell: &[],
            extensions_surge: &[7],
            extensions_storm: &[7, 9],
            extensions_maelstrom: &[7, 9],
            register_floor: 3,
            register_ceiling: 5,
            max_notes_oct3: 3,
            voice_lead_strength: 0.8,
            collision: CollisionMode::Avoid,
        },
        harmonic_rhythm: HarmonicRhythm {
            pulse_beats: 16.0,
            swell_beats: 12.0,
            surge_beats: 8.0,
            storm_beats: 6.0,
            maelstrom_beats: 4.0,
        },
    }
}

/// JS `harmony.js:815` — chiptune.
pub fn chiptune() -> Palette {
    Palette {
        name: "chiptune",
        bpm_range: (140, 170),
        scale: "major",
        drums: DrumKit {
            kick: DrumVoice { wave: Wave::Sine, freq: 80.0, decay: 0.12 },
            kick_pattern: DrumPattern::FourOnFloor,
            snare: DrumVoice { wave: Wave::Noise, freq: 500.0, decay: 0.06 },
            snare_pattern: DrumPattern::Backbeat,
            hat: DrumVoice { wave: Wave::Noise, freq: 12000.0, decay: 0.01 },
            hat_pattern: DrumPattern::Straight8th,
            perc: DrumVoice { wave: Wave::Square, freq: 1000.0, decay: 0.03 },
        },
        bass: BassConfig {
            wave: Wave::Square, octave: 2,
            filter_cutoff: 800.0, filter_resonance: 2.0,
            tier_cap: 2, gain_scalar: 0.7,
            phase_filter: [None, None, None, Some(600.0), Some(700.0)],
        },
        pad: PadConfig { wave: Wave::Square, octave: 4, attack: 0.01, release: 0.1, detune_cents: 0.0 },
        chord: ChordConfig {
            style: ChordStyle::Arp, voices: 3,
            attack: 0.003, decay: 0.04, sustain_level: 0.0, release: 0.02,
            octave: 4, lpf_cutoff: 6000.0, lpf_resonance: 0.5,
            gain_scalar: 0.85, entry_phase: Phase::Swell,
        },
        melody: MelodyConfig {
            octave: 5, attack: 0.005, decay: 0.05, sustain_level: 0.8, release: 0.02,
            lpf_cutoff: 6000.0, lpf_env_amount: 0.0, lpf_env_decay: 0.1, lpf_resonance: 0.7,
            gain_scalar: 1.0, staccato: true, narrative_motif: true,
        },
        melody_rhythm: MelodyRhythm { hold_probability: 0.10, syncopation_probability: 0.12 },
        motif: MotifConfig {
            length: 6,
            weights_swell: VariationWeights { repeat: 1.0, transpose: 0.0, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_surge: VariationWeights { repeat: 0.3, transpose: 0.7, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_storm: VariationWeights { repeat: 0.2, transpose: 0.3, invert: 0.3, diminish: 0.2, fragment: 0.0 },
            weights_maelstrom: VariationWeights { repeat: 0.1, transpose: 0.2, invert: 0.2, diminish: 0.2, fragment: 0.3 },
        },
        tension: TensionParams { event_density: 0.8, retreat_depth: 0.15, spike_height: 0.25, plateau_bias: 0.0 },
        groove: GrooveConfig { swing: 0.0, humanize_ms: 0.0 },
        progressions: vec![
            Progression { section_a: vec!["I","IV","V","I"], section_b: vec!["vi","IV","V","I"], section_c: vec!["I","V","vi","IV"], form: vec!['A','B','A','C'], phase: "default" },
            Progression { section_a: vec!["I","V","vi","IV"], section_b: vec!["I","IV","ii","V"], section_c: vec!["vi","V","IV","I"], form: vec!['A','A','B','C'], phase: "default" },
            Progression { section_a: vec!["I","vi","IV","V"], section_b: vec!["IV","V","I","vi"], section_c: vec!["bVI","bVII","I","V"], form: vec!['A','B','A','C'], phase: "storm" },
        ],
        beats_per_chord: 4,
        voicing: VoicingProfile {
            style: VoicingStyle::Close,
            extensions_pulse: &[],
            extensions_swell: &[],
            extensions_surge: &[],
            extensions_storm: &[],
            extensions_maelstrom: &[],
            register_floor: 4,
            register_ceiling: 5,
            max_notes_oct3: 4,
            voice_lead_strength: 0.4,
            collision: CollisionMode::Split,
        },
        harmonic_rhythm: HarmonicRhythm {
            pulse_beats: 8.0,
            swell_beats: 8.0,
            surge_beats: 8.0,
            storm_beats: 4.0,
            maelstrom_beats: 4.0,
        },
    }
}

/// JS `harmony.js:960` — noir_jazz (#56 60s-detective overhaul).
pub fn noir_jazz() -> Palette {
    Palette {
        name: "noir_jazz",
        bpm_range: (85, 105),
        scale: "harmonicMinor",
        drums: DrumKit {
            kick: DrumVoice { wave: Wave::Sine, freq: 50.0, decay: 0.3 },
            kick_pattern: DrumPattern::LaidBack,
            snare: DrumVoice { wave: Wave::Noise, freq: 200.0, decay: 0.15 },
            snare_pattern: DrumPattern::Jazz,
            hat: DrumVoice { wave: Wave::Noise, freq: 8000.0, decay: 0.04 },
            hat_pattern: DrumPattern::JazzRide,
            perc: DrumVoice { wave: Wave::Noise, freq: 500.0, decay: 0.08 },
        },
        bass: BassConfig {
            wave: Wave::Sine, octave: 2,
            filter_cutoff: 620.0, filter_resonance: 3.2,
            tier_cap: 5, gain_scalar: 1.15,
            phase_filter: [None, None, None, Some(800.0), Some(950.0)],
        },
        pad: PadConfig { wave: Wave::Sine, octave: 3, attack: 0.6, release: 1.5, detune_cents: 4.0 },
        chord: ChordConfig {
            style: ChordStyle::Comp, voices: 4,
            attack: 0.015, decay: 0.25, sustain_level: 0.08, release: 0.14,
            octave: 4, lpf_cutoff: 1700.0, lpf_resonance: 0.7,
            gain_scalar: 0.40, entry_phase: Phase::Storm,
        },
        melody: MelodyConfig {
            octave: 4, attack: 0.12, decay: 0.22, sustain_level: 1.0, release: 0.30,
            lpf_cutoff: 1900.0, lpf_env_amount: 450.0, lpf_env_decay: 0.28, lpf_resonance: 1.0,
            gain_scalar: 1.10, staccato: false, narrative_motif: false,
        },
        melody_rhythm: MelodyRhythm { hold_probability: 0.40, syncopation_probability: 0.40 },
        motif: MotifConfig {
            length: 6,
            weights_swell: VariationWeights { repeat: 1.0, transpose: 0.0, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_surge: VariationWeights { repeat: 0.3, transpose: 0.7, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_storm: VariationWeights { repeat: 0.15, transpose: 0.25, invert: 0.35, diminish: 0.25, fragment: 0.0 },
            weights_maelstrom: VariationWeights { repeat: 0.1, transpose: 0.15, invert: 0.25, diminish: 0.2, fragment: 0.3 },
        },
        tension: TensionParams { event_density: 0.6, retreat_depth: 0.25, spike_height: 0.18, plateau_bias: 0.30 },
        groove: GrooveConfig { swing: 0.4, humanize_ms: 12.0 },
        progressions: vec![
            Progression { section_a: vec!["i","iv","v","i"], section_b: vec!["bVI","bII","v","i"], section_c: vec!["ii","v","i","iv"], form: vec!['A','B','A','C'], phase: "default" },
            Progression { section_a: vec!["i","bVI","bII","v"], section_b: vec!["iv","bVII","i","v"], section_c: vec!["ii","v","bVI","i"], form: vec!['A','A','B','C'], phase: "default" },
            Progression { section_a: vec!["i","iv","bII","v"], section_b: vec!["bVI","v","i","bII"], section_c: vec!["ii","bVI","v","i"], form: vec!['A','B','A','C'], phase: "storm" },
        ],
        beats_per_chord: 4,
        voicing: VoicingProfile {
            style: VoicingStyle::Drop2,
            extensions_pulse: &[],
            extensions_swell: &[],
            extensions_surge: &[7],
            extensions_storm: &[7, 9],
            extensions_maelstrom: &[7, 9, 11, 13],
            register_floor: 3,
            register_ceiling: 5,
            max_notes_oct3: 3,
            voice_lead_strength: 0.95,
            collision: CollisionMode::Avoid,
        },
        harmonic_rhythm: HarmonicRhythm {
            pulse_beats: 2.0,
            swell_beats: 2.0,
            surge_beats: 1.0,
            storm_beats: 1.0,
            maelstrom_beats: 0.5,
        },
    }
}

/// JS `harmony.js:1207` — industrial.
pub fn industrial() -> Palette {
    Palette {
        name: "industrial",
        bpm_range: (130, 145),
        scale: "phrygian",
        drums: DrumKit {
            kick: DrumVoice { wave: Wave::Sine, freq: 45.0, decay: 0.25 },
            kick_pattern: DrumPattern::Syncopated,
            snare: DrumVoice { wave: Wave::Noise, freq: 350.0, decay: 0.12 },
            snare_pattern: DrumPattern::Scattered,
            hat: DrumVoice { wave: Wave::Noise, freq: 10000.0, decay: 0.015 },
            hat_pattern: DrumPattern::Busy16th,
            perc: DrumVoice { wave: Wave::Sawtooth, freq: 2000.0, decay: 0.02 },
        },
        bass: BassConfig {
            wave: Wave::Sawtooth, octave: 1,
            filter_cutoff: 250.0, filter_resonance: 15.0,
            tier_cap: 2, gain_scalar: 0.9,
            phase_filter: [None, None, None, Some(300.0), Some(350.0)],
        },
        pad: PadConfig { wave: Wave::Sawtooth, octave: 4, attack: 0.3, release: 0.8, detune_cents: 8.0 },
        chord: ChordConfig {
            style: ChordStyle::Stab, voices: 2,
            attack: 0.003, decay: 0.08, sustain_level: 0.0, release: 0.03,
            octave: 4, lpf_cutoff: 3000.0, lpf_resonance: 3.0,
            gain_scalar: 1.0, entry_phase: Phase::Swell,
        },
        melody: MelodyConfig {
            octave: 4, attack: 0.005, decay: 0.06, sustain_level: 0.1, release: 0.04,
            lpf_cutoff: 4000.0, lpf_env_amount: 1200.0, lpf_env_decay: 0.08, lpf_resonance: 3.0,
            gain_scalar: 1.1, staccato: true, narrative_motif: true,
        },
        melody_rhythm: MelodyRhythm { hold_probability: 0.05, syncopation_probability: 0.12 },
        motif: MotifConfig {
            length: 5,
            weights_swell: VariationWeights { repeat: 1.0, transpose: 0.0, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_surge: VariationWeights { repeat: 0.4, transpose: 0.6, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_storm: VariationWeights { repeat: 0.2, transpose: 0.2, invert: 0.3, diminish: 0.3, fragment: 0.0 },
            weights_maelstrom: VariationWeights { repeat: 0.1, transpose: 0.2, invert: 0.2, diminish: 0.2, fragment: 0.3 },
        },
        tension: TensionParams { event_density: 0.7, retreat_depth: 0.10, spike_height: 0.30, plateau_bias: -0.1 },
        groove: GrooveConfig { swing: 0.0, humanize_ms: 2.0 },
        progressions: vec![
            Progression { section_a: vec!["i","bII","i","bII"], section_b: vec!["i","v","bVI","bII"], section_c: vec!["i","bII","bVII","v"], form: vec!['A','A','B','C'], phase: "default" },
            Progression { section_a: vec!["i","bVI","bII","i"], section_b: vec!["bVII","bVI","v","i"], section_c: vec!["i","bII","v","bVI"], form: vec!['A','B','A','C'], phase: "default" },
            Progression { section_a: vec!["i","bII","bVII","bVI"], section_b: vec!["v","bVI","bII","i"], section_c: vec!["bVII","i","bII","v"], form: vec!['A','A','B','C'], phase: "storm" },
        ],
        beats_per_chord: 4,
        voicing: VoicingProfile {
            style: VoicingStyle::Power,
            extensions_pulse: &[],
            extensions_swell: &[],
            extensions_surge: &[],
            extensions_storm: &[],
            extensions_maelstrom: &[],
            register_floor: 3,
            register_ceiling: 4,
            max_notes_oct3: 2,
            voice_lead_strength: 0.3,
            collision: CollisionMode::Split,
        },
        harmonic_rhythm: HarmonicRhythm {
            pulse_beats: 32.0,
            swell_beats: 24.0,
            surge_beats: 16.0,
            storm_beats: 8.0,
            maelstrom_beats: 2.0,
        },
    }
}

/// JS `harmony.js:1465` — vaporwave.
pub fn vaporwave() -> Palette {
    Palette {
        name: "vaporwave",
        bpm_range: (70, 85),
        scale: "lydian",
        drums: DrumKit {
            kick: DrumVoice { wave: Wave::Sine, freq: 45.0, decay: 0.4 },
            kick_pattern: DrumPattern::HalfTime,
            snare: DrumVoice { wave: Wave::Noise, freq: 180.0, decay: 0.2 },
            snare_pattern: DrumPattern::Backbeat,
            hat: DrumVoice { wave: Wave::Noise, freq: 6000.0, decay: 0.06 },
            hat_pattern: DrumPattern::Offbeat8th,
            perc: DrumVoice { wave: Wave::Triangle, freq: 300.0, decay: 0.1 },
        },
        bass: BassConfig {
            wave: Wave::Sine, octave: 2,
            filter_cutoff: 250.0, filter_resonance: 5.0,
            tier_cap: 1, gain_scalar: 1.15,
            phase_filter: [None, None, None, Some(220.0), Some(250.0)],
        },
        pad: PadConfig { wave: Wave::Sawtooth, octave: 4, attack: 2.5, release: 3.0, detune_cents: 20.0 },
        chord: ChordConfig {
            style: ChordStyle::None, voices: 0,
            attack: 0.0, decay: 0.0, sustain_level: 0.0, release: 0.0,
            octave: 4, lpf_cutoff: 2000.0, lpf_resonance: 0.7,
            gain_scalar: 0.0, entry_phase: Phase::Maelstrom,
        },
        melody: MelodyConfig {
            octave: 4, attack: 0.08, decay: 0.2, sustain_level: 0.8, release: 0.3,
            lpf_cutoff: 1800.0, lpf_env_amount: 0.0, lpf_env_decay: 0.1, lpf_resonance: 0.7,
            gain_scalar: 0.85, staccato: false, narrative_motif: false,
        },
        melody_rhythm: MelodyRhythm { hold_probability: 0.45, syncopation_probability: 0.10 },
        motif: MotifConfig {
            length: 6,
            weights_swell: VariationWeights { repeat: 1.0, transpose: 0.0, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_surge: VariationWeights { repeat: 0.4, transpose: 0.6, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_storm: VariationWeights { repeat: 0.2, transpose: 0.3, invert: 0.3, diminish: 0.2, fragment: 0.0 },
            weights_maelstrom: VariationWeights { repeat: 0.1, transpose: 0.2, invert: 0.2, diminish: 0.2, fragment: 0.3 },
        },
        tension: TensionParams { event_density: 0.5, retreat_depth: 0.15, spike_height: 0.10, plateau_bias: 0.25 },
        groove: GrooveConfig { swing: 0.15, humanize_ms: 15.0 },
        progressions: vec![
            Progression { section_a: vec!["I","iii","IV","ii"], section_b: vec!["vi","IV","I","V"], section_c: vec!["I","#IV","IV","I"], form: vec!['A','B','A','C'], phase: "default" },
            Progression { section_a: vec!["I","V","vi","iii"], section_b: vec!["IV","ii","I","V"], section_c: vec!["I","#IV","vi","IV"], form: vec!['A','A','B','C'], phase: "default" },
            Progression { section_a: vec!["I","iii","#IV","ii"], section_b: vec!["vi","I","IV","V"], section_c: vec!["I","#IV","V","I"], form: vec!['A','B','A','C'], phase: "storm" },
        ],
        beats_per_chord: 4,
        voicing: VoicingProfile {
            style: VoicingStyle::Spread,
            extensions_pulse: &[],
            extensions_swell: &[],
            extensions_surge: &[7],
            extensions_storm: &[7, 9],
            extensions_maelstrom: &[7, 9],
            register_floor: 3,
            register_ceiling: 5,
            max_notes_oct3: 3,
            voice_lead_strength: 0.7,
            collision: CollisionMode::None,
        },
        harmonic_rhythm: HarmonicRhythm {
            pulse_beats: 16.0,
            swell_beats: 16.0,
            surge_beats: 8.0,
            storm_beats: 8.0,
            maelstrom_beats: 4.0,
        },
    }
}

/// JS `harmony.js:1611` — breakbeat.
pub fn breakbeat() -> Palette {
    Palette {
        name: "breakbeat",
        bpm_range: (155, 175),
        scale: "minor",
        drums: DrumKit {
            kick: DrumVoice { wave: Wave::Sine, freq: 55.0, decay: 0.2 },
            kick_pattern: DrumPattern::BreakKick,
            snare: DrumVoice { wave: Wave::Noise, freq: 250.0, decay: 0.1 },
            snare_pattern: DrumPattern::BreakSnare,
            hat: DrumVoice { wave: Wave::Noise, freq: 9000.0, decay: 0.02 },
            hat_pattern: DrumPattern::Busy16th,
            perc: DrumVoice { wave: Wave::Sawtooth, freq: 800.0, decay: 0.04 },
        },
        bass: BassConfig {
            wave: Wave::Sawtooth, octave: 1,
            filter_cutoff: 350.0, filter_resonance: 10.0,
            tier_cap: 3, gain_scalar: 0.95,
            phase_filter: [None, None, None, Some(400.0), Some(500.0)],
        },
        pad: PadConfig { wave: Wave::Sawtooth, octave: 4, attack: 0.3, release: 0.8, detune_cents: 8.0 },
        chord: ChordConfig {
            style: ChordStyle::Stab, voices: 3,
            attack: 0.008, decay: 0.12, sustain_level: 0.0, release: 0.05,
            octave: 4, lpf_cutoff: 2400.0, lpf_resonance: 1.5,
            gain_scalar: 0.95, entry_phase: Phase::Swell,
        },
        melody: MelodyConfig {
            octave: 4, attack: 0.01, decay: 0.1, sustain_level: 0.5, release: 0.08,
            lpf_cutoff: 3500.0, lpf_env_amount: 600.0, lpf_env_decay: 0.15, lpf_resonance: 1.5,
            gain_scalar: 1.0, staccato: false, narrative_motif: true,
        },
        melody_rhythm: MelodyRhythm { hold_probability: 0.15, syncopation_probability: 0.40 },
        motif: MotifConfig {
            length: 6,
            weights_swell: VariationWeights { repeat: 1.0, transpose: 0.0, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_surge: VariationWeights { repeat: 0.3, transpose: 0.7, invert: 0.0, diminish: 0.0, fragment: 0.0 },
            weights_storm: VariationWeights { repeat: 0.2, transpose: 0.3, invert: 0.2, diminish: 0.3, fragment: 0.0 },
            weights_maelstrom: VariationWeights { repeat: 0.1, transpose: 0.2, invert: 0.2, diminish: 0.2, fragment: 0.3 },
        },
        tension: TensionParams { event_density: 0.8, retreat_depth: 0.18, spike_height: 0.28, plateau_bias: -0.05 },
        groove: GrooveConfig { swing: 0.0, humanize_ms: 5.0 },
        progressions: vec![
            Progression { section_a: vec!["i","bVII","bVI","v"], section_b: vec!["i","iv","bVII","i"], section_c: vec!["bVI","bVII","i","i"], form: vec!['A','B','A','C'], phase: "default" },
            Progression { section_a: vec!["i","v","bVI","bVII"], section_b: vec!["iv","bVII","i","v"], section_c: vec!["bVI","iv","bVII","i"], form: vec!['A','A','B','C'], phase: "default" },
            Progression { section_a: vec!["i","bVII","iv","bVI"], section_b: vec!["v","bVII","i","bVI"], section_c: vec!["iv","v","bVII","i"], form: vec!['A','B','A','C'], phase: "storm" },
        ],
        beats_per_chord: 4,
        voicing: VoicingProfile {
            style: VoicingStyle::Close,
            extensions_pulse: &[],
            extensions_swell: &[],
            extensions_surge: &[7],
            extensions_storm: &[7],
            extensions_maelstrom: &[7],
            register_floor: 4,
            register_ceiling: 5,
            max_notes_oct3: 4,
            voice_lead_strength: 0.5,
            collision: CollisionMode::Avoid,
        },
        harmonic_rhythm: HarmonicRhythm {
            pulse_beats: 8.0,
            swell_beats: 8.0,
            surge_beats: 4.0,
            storm_beats: 4.0,
            maelstrom_beats: 2.0,
        },
    }
}

/// All 10 palettes in JS declaration order (`harmony.js:84` — matches
/// `PALETTES[0..9]` so index-based lookups agree with the JS reference).
pub fn all_palettes() -> Vec<Palette> {
    vec![
        dark_techno(),
        synthwave(),
        glitch(),
        ambient_dread(),
        lo_fi_chill(),
        chiptune(),
        noir_jazz(),
        industrial(),
        vaporwave(),
        breakbeat(),
    ]
}

/// Look up a palette by its `name` field (case-sensitive). Returns `None` for
/// unknown names — Phase 2a-2 CLI uses this for `--palette <name>`.
pub fn palette_by_name(name: &str) -> Option<Palette> {
    match name {
        "dark_techno" => Some(dark_techno()),
        "synthwave" => Some(synthwave()),
        "glitch" => Some(glitch()),
        "ambient_dread" => Some(ambient_dread()),
        "lo_fi_chill" => Some(lo_fi_chill()),
        "chiptune" => Some(chiptune()),
        "noir_jazz" => Some(noir_jazz()),
        "industrial" => Some(industrial()),
        "vaporwave" => Some(vaporwave()),
        "breakbeat" => Some(breakbeat()),
        _ => None,
    }
}

/// JS `_selectPalette` (`harmony.js:2359`) port. `recent` holds the last-
/// played palette indices (most-recent first). The picker applies the same
/// recency penalty curve (1.0 → 0.7 → 0.4 → 0.1, min weight 0.05), rolls a
/// weighted random using `rng`, and mutates `recent` to prepend the pick.
pub fn select_palette(rng: &mut crate::rng::Mulberry32, recent: &mut Vec<usize>) -> Palette {
    let palettes = all_palettes();
    let weights: Vec<f64> = (0..palettes.len())
        .map(|i| {
            let pos = recent.iter().position(|&r| r == i);
            let penalty: f64 = match pos {
                Some(0) => 1.0,
                Some(1) => 0.7,
                Some(2) => 0.4,
                Some(_) => 0.1,
                None => 0.0,
            };
            (1.0f64 - penalty).max(0.05)
        })
        .collect();
    let total: f64 = weights.iter().sum();
    let mut r = rng.next_f64() * total;
    let mut idx = 0;
    for (i, &w) in weights.iter().enumerate() {
        r -= w;
        if r <= 0.0 {
            idx = i;
            break;
        }
    }
    recent.insert(0, idx);
    recent.truncate(5);
    palettes.into_iter().nth(idx).unwrap()
}
