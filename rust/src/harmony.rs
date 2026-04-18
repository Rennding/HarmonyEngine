//! HarmonyEngine — chord progression stepper + scale math.
//!
//! JS reference: `src/harmony.js:1400–2283`. Phase 1 ports only the subset
//! needed to drive the chord loop: root-note selection, progression walk,
//! chord-quality resolution, and `getChordTones(octave)`. VoicingEngine,
//! PaletteBlender, and harmonic-rhythm ride-along port in Phase 2b (#61).

use crate::palette::Palette;
use crate::rng::Mulberry32;

/// Minor pentatonic scale — JS `harmony.js:7` `[0, 3, 5, 7, 10]`.
pub const MINOR_PENTATONIC: [i32; 5] = [0, 3, 5, 7, 10];

/// Natural minor scale — used for chord-building.
/// JS `SCALES.minor = [0, 2, 3, 5, 7, 8, 10]`.
pub const MINOR_SCALE: [i32; 7] = [0, 2, 3, 5, 7, 8, 10];

/// Semitone offsets for root-note picker.
/// JS `ROOT_SEMITONES = [0..11]` — all 12 semitones.
pub const ROOT_SEMITONES: [i32; 12] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/// Roman-numeral → (scale-degree, is-major) for natural minor.
/// JS quality derivation: uppercase = major, lowercase = minor, `b` prefix
/// flattens the degree. dark_techno progressions use i/VI/III/VII/iv/v/bVI/bVII.
pub fn parse_numeral(numeral: &str) -> (i32, bool) {
    let mut flat = false;
    let mut body = numeral;
    if let Some(rest) = body.strip_prefix('b') {
        flat = true;
        body = rest;
    }
    let (degree, is_major) = match body {
        "i" => (0, false),
        "I" => (0, true),
        "ii" => (1, false),
        "II" => (1, true),
        "iii" => (2, false),
        "III" => (2, true),
        "iv" => (3, false),
        "IV" => (3, true),
        "v" => (4, false),
        "V" => (4, true),
        "vi" => (5, false),
        "VI" => (5, true),
        "vii" => (6, false),
        "VII" => (6, true),
        _ => (0, false),
    };
    // degree → scale semitone, `flat` subtracts 1
    let semitone = MINOR_SCALE[degree as usize % 7] + if flat { -1 } else { 0 };
    (semitone.rem_euclid(12), is_major)
}

/// Triad intervals — JS `_triadIntervals(quality)`.
/// Major: [0, 4, 7]. Minor: [0, 3, 7].
pub fn triad_intervals(is_major: bool) -> [i32; 3] {
    if is_major {
        [0, 4, 7]
    } else {
        [0, 3, 7]
    }
}

pub struct HarmonyEngine {
    root_semitone: i32,
    progression: Vec<(i32, bool)>, // (semitone, is_major) per chord
    chord_index: usize,
    beats_in_chord: u32,
    beats_per_chord: u32,
    current_root: i32,
    current_is_major: bool,
}

impl HarmonyEngine {
    pub fn init_run(palette: &Palette, rng: &mut Mulberry32) -> Self {
        // Pick root: JS `rootNote = null` → random semitone via song RNG.
        let root_idx = (rng.next_f64() * 12.0) as usize;
        let root_semitone = ROOT_SEMITONES[root_idx.min(11)];

        // Pick a progression set (first default is fine for Phase 1 parity;
        // JS weights by phase — Phase 2a ports that).
        let prog_set = &palette.progressions[0];

        // Flatten form → concrete chord list. Each form char selects A/B/C.
        let mut progression = Vec::new();
        for &letter in &prog_set.form {
            let section = match letter {
                'A' => &prog_set.section_a,
                'B' => &prog_set.section_b,
                'C' => &prog_set.section_c,
                _ => &prog_set.section_a,
            };
            for numeral in section {
                progression.push(parse_numeral(numeral));
            }
        }

        let first = progression.first().copied().unwrap_or((0, false));

        Self {
            root_semitone,
            progression,
            chord_index: 0,
            beats_in_chord: 0,
            beats_per_chord: palette.beats_per_chord,
            current_root: first.0,
            current_is_major: first.1,
        }
    }

    /// Per-beat hook — JS `HarmonyEngine.advanceBeat`.
    pub fn advance_beat(&mut self) {
        self.beats_in_chord += 1;
        if self.beats_in_chord >= self.beats_per_chord {
            self.beats_in_chord = 0;
            self.chord_index = (self.chord_index + 1) % self.progression.len();
            let (r, m) = self.progression[self.chord_index];
            self.current_root = r;
            self.current_is_major = m;
        }
    }

    /// JS `HarmonyEngine.getChordTones(octave)`.
    /// `octave` is treated the same way: baseMidi = (octave+1)*12 + chordRoot.
    pub fn chord_tones(&self, octave: i32) -> [i32; 3] {
        let chord_root_abs = (self.root_semitone + self.current_root).rem_euclid(12);
        let base_midi = (octave + 1) * 12 + chord_root_abs;
        let iv = triad_intervals(self.current_is_major);
        [base_midi + iv[0], base_midi + iv[1], base_midi + iv[2]]
    }

    /// Root MIDI note for the current chord at the given octave — used by
    /// WalkingBass for Tier 0 "root only" playback.
    pub fn root_midi(&self, octave: i32) -> i32 {
        let chord_root_abs = (self.root_semitone + self.current_root).rem_euclid(12);
        (octave + 1) * 12 + chord_root_abs
    }

    /// Fifth MIDI note — used by WalkingBass Tier 1 alternation.
    pub fn fifth_midi(&self, octave: i32) -> i32 {
        self.root_midi(octave) + 7
    }

    pub fn current_chord_symbol(&self) -> (i32, bool) {
        (self.current_root, self.current_is_major)
    }
}

/// MIDI → frequency (Hz). JS `midiToFreq(midi)` at `harmony.js:78`.
pub fn midi_to_freq(midi: i32) -> f32 {
    440.0 * 2f32.powf((midi as f32 - 69.0) / 12.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn midi_a4_is_440() {
        assert!((midi_to_freq(69) - 440.0).abs() < 1e-3);
    }

    #[test]
    fn midi_c4_is_middle_c() {
        assert!((midi_to_freq(60) - 261.625_55).abs() < 1e-2);
    }

    #[test]
    fn numeral_i_is_minor_degree_0() {
        assert_eq!(parse_numeral("i"), (0, false));
    }

    #[test]
    fn numeral_capital_vi_is_major_degree_5() {
        // In natural minor, VI is scale-degree 5 = semitone 8 (minor 6th),
        // major quality.
        assert_eq!(parse_numeral("VI"), (8, true));
    }

    #[test]
    fn numeral_flat_six_is_lowered() {
        assert_eq!(parse_numeral("bVI").0, 7);
    }

    #[test]
    fn progression_walks() {
        let pal = crate::palette::dark_techno();
        let mut rng = Mulberry32::new(12345);
        let mut he = HarmonyEngine::init_run(&pal, &mut rng);
        let first = he.current_chord_symbol();
        // Step `beats_per_chord` times → next chord.
        for _ in 0..pal.beats_per_chord {
            he.advance_beat();
        }
        let second = he.current_chord_symbol();
        assert_ne!(first, second, "progression did not advance");
    }
}
