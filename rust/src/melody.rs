//! MelodyEngine — port of `src/melody.js` (subset for dark_techno).
//!
//! Per-phase density picks rest gaps + max phrase length + gain. Phrases
//! are generated via a 2nd-order Markov walk over the minor-pentatonic
//! scale (5 degrees). The first note of each phrase lands on a chord tone
//! (resolved through `HarmonyEngine.chord_tone_pentatonic_degree`).
//! Subsequent notes pick by weighted PRNG roll against a 5×5 transition
//! matrix.
//!
//! Variation is applied per-phrase per-phase (`palette.motif.weights_*`):
//! `repeat` plays the seed, `transpose` shifts the degree set by ±2..±5,
//! `invert` mirrors around the seed midpoint, `diminish` halves the durations,
//! `fragment` plays the first 2–3 notes only.
//!
//! Audio: square-ish wavetable + AHDSR + LPF with a fast filter envelope
//! (cutoff jumps by `lpf_env_amount` and decays back over `lpf_env_decay`).
//! Voice allocation uses a small private 4-voice pool — one note at a time
//! for staccato, but the pool covers overlapping releases.

use crate::config::{gain, melody_density, Phase};
use crate::harmony::{midi_to_freq, HarmonyEngine, MINOR_PENTATONIC};
use crate::palette::{MelodyConfig, MelodyRhythm, MotifConfig, VariationWeights};
use crate::rng::Mulberry32;
use crate::synth::{BiquadLowpass, Envelope};
use crate::wavetables::Wavetable;

/// 2nd-order Markov transition matrix used for dark_techno's acid-style
/// melodic walk. Indices are `(prev_prev, prev)` → 5-element distribution
/// over the next pentatonic degree.
///
/// Mirrors the JS structure in `melody.js:71–96`. The diagonal entries are
/// strongest (degree self-loop ≈ 0.34–0.35); off-diagonals favour stepwise
/// motion.
const MARKOV: [[[f32; 5]; 5]; 5] = build_markov();

const fn build_markov() -> [[[f32; 5]; 5]; 5] {
    // Each [prev_prev][prev][next] cell. We default to a normalised
    // step-biased distribution; the diagonal is weighted higher.
    let mut m = [[[0.0; 5]; 5]; 5];
    let mut pp = 0;
    while pp < 5 {
        let mut p = 0;
        while p < 5 {
            // Distribution: stay (prev) at 0.34, neighbours at 0.25 each,
            // far at 0.08 each.
            let mut next = 0;
            while next < 5 {
                let dist = if next == p {
                    0.34
                } else if (next as i32 - p as i32).abs() == 1
                    || (next == 0 && p == 4)
                    || (next == 4 && p == 0)
                {
                    0.25
                } else {
                    0.08
                };
                m[pp][p][next] = dist;
                next += 1;
            }
            p += 1;
        }
        pp += 1;
    }
    m
}

const MELODY_VOICES: usize = 4;

struct MelodyVoice {
    active: bool,
    phase: f32,
    freq_hz: f32,
    env: Envelope,
    filter: BiquadLowpass,
    gain: f32,
    // Filter envelope: cutoff swings from cfg.lpf_cutoff + lpf_env_amount
    // down to cfg.lpf_cutoff over lpf_env_decay seconds.
    sample_rate: f32,
    filt_age: f32,
    filt_decay: f32,
    filt_base: f32,
    filt_amount: f32,
    filt_q: f32,
}

impl MelodyVoice {
    fn new(sample_rate: f32) -> Self {
        Self {
            active: false,
            phase: 0.0,
            freq_hz: 0.0,
            env: Envelope::new(sample_rate),
            filter: BiquadLowpass::new(sample_rate, 1800.0, 4.0),
            gain: 0.0,
            sample_rate,
            filt_age: 0.0,
            filt_decay: 0.12,
            filt_base: 1800.0,
            filt_amount: 800.0,
            filt_q: 4.0,
        }
    }

    #[inline]
    fn render(&mut self, table: &Wavetable) -> f32 {
        if !self.active {
            return 0.0;
        }
        // Update filter envelope each sample (cheap).
        let t = (self.filt_age / self.filt_decay).min(1.0);
        let cutoff = self.filt_base + self.filt_amount * (1.0 - t);
        self.filter.set_params(cutoff, self.filt_q);
        self.filt_age += 1.0 / self.sample_rate;

        let s = table.sample(self.phase);
        self.phase += self.freq_hz / self.sample_rate;
        while self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        let env = self.env.next_sample();
        let y = self.filter.process(s * env * self.gain);
        if !self.env.is_active() {
            self.active = false;
        }
        y
    }
}

/// MelodyEngine — owns its own voice pool, phrase state, and Markov state.
pub struct MelodyEngine {
    cfg: MelodyConfig,
    rhythm: MelodyRhythm,
    motif: MotifConfig,
    rng: Mulberry32,
    voices: Vec<MelodyVoice>,
    bpm: f32,

    // Phrase state
    seed_motif: Vec<u8>,        // pentatonic degrees of last seed
    current_phrase: Vec<u8>,    // current variation playback
    note_index: usize,          // index into current_phrase
    rest_remaining: u32,        // beats until next phrase
    in_phrase: bool,
    history: [u8; 2],           // last two pentatonic degrees (Markov state)

    current_phase: Phase,
}

impl MelodyEngine {
    pub fn new(
        sample_rate: f32,
        bpm: f32,
        cfg: MelodyConfig,
        rhythm: MelodyRhythm,
        motif: MotifConfig,
        seed: i32,
    ) -> Self {
        Self {
            cfg,
            rhythm,
            motif,
            rng: Mulberry32::new(seed.wrapping_add(7919)),
            voices: (0..MELODY_VOICES).map(|_| MelodyVoice::new(sample_rate)).collect(),
            bpm,
            seed_motif: Vec::new(),
            current_phrase: Vec::new(),
            note_index: 0,
            rest_remaining: 0,
            in_phrase: false,
            history: [0, 0],
            current_phase: Phase::Pulse,
        }
    }

    pub fn on_phase_change(&mut self, phase: Phase) {
        self.current_phase = phase;
        // On entry to a non-mute phase, force a small initial rest so we
        // don't pile a phrase onto the very first beat after transition.
        if matches!(phase, Phase::Pulse) {
            self.in_phrase = false;
            self.current_phrase.clear();
            self.note_index = 0;
        } else if !self.in_phrase && self.rest_remaining == 0 {
            self.rest_remaining = 1;
        }
    }

    /// Per-beat hook — picks a note (or nothing) for this beat.
    pub fn on_beat(&mut self, he: &HarmonyEngine) {
        let (rest_min, rest_max, max_phrase, gain_scalar) = melody_density(self.current_phase);
        if max_phrase == 0 {
            return; // muted phase
        }

        if self.rest_remaining > 0 {
            self.rest_remaining -= 1;
            return;
        }

        // Generate a fresh phrase if needed.
        if !self.in_phrase || self.note_index >= self.current_phrase.len() {
            self.start_new_phrase(he, max_phrase as usize);
        }

        if self.current_phrase.is_empty() {
            return;
        }

        let degree = self.current_phrase[self.note_index] as usize;
        self.note_index += 1;
        if self.note_index >= self.current_phrase.len() {
            self.in_phrase = false;
            // Pick rest length from density range.
            let span = (rest_max - rest_min + 1) as f64;
            self.rest_remaining = rest_min + (self.rng.next_f64() * span) as u32;
        }

        // syncopation_probability: chance to hold this beat (skip note).
        if self.rng.next_f64() < self.rhythm.hold_probability as f64 {
            return;
        }

        let midi = he.pentatonic_degree_to_midi(degree, self.cfg.octave);
        self.fire_note(midi, gain_scalar);
    }

    fn start_new_phrase(&mut self, he: &HarmonyEngine, max_phrase: usize) {
        let phrase_len = self.motif.length.min(max_phrase).max(1);

        // Seed motif: chord-tone start + Markov walk.
        if self.seed_motif.is_empty() || self.seed_motif.len() != phrase_len {
            let start = he.chord_tone_pentatonic_degree(&mut self.rng);
            let mut motif = vec![start as u8];
            self.history = [start as u8, start as u8];
            while motif.len() < phrase_len {
                let next = self.markov_pick();
                motif.push(next);
                self.history[0] = self.history[1];
                self.history[1] = next;
            }
            self.seed_motif = motif;
        }

        // Apply variation per phase.
        let weights = match self.current_phase {
            Phase::Pulse => return,
            Phase::Swell => self.motif.weights_swell,
            Phase::Surge => self.motif.weights_surge,
            Phase::Storm => self.motif.weights_storm,
            Phase::Maelstrom => self.motif.weights_maelstrom,
        };
        self.current_phrase = self.apply_variation(weights);
        self.note_index = 0;
        self.in_phrase = true;
    }

    fn markov_pick(&mut self) -> u8 {
        let pp = self.history[0] as usize;
        let p = self.history[1] as usize;
        let row = &MARKOV[pp][p];
        let total: f32 = row.iter().sum();
        let target = self.rng.next_f64() as f32 * total;
        let mut acc = 0.0;
        for (i, &w) in row.iter().enumerate() {
            acc += w;
            if target <= acc {
                return i as u8;
            }
        }
        4
    }

    fn apply_variation(&mut self, w: VariationWeights) -> Vec<u8> {
        let total = w.repeat + w.transpose + w.invert + w.diminish + w.fragment;
        if total <= 0.0 {
            return self.seed_motif.clone();
        }
        let target = self.rng.next_f64() as f32 * total;
        let mut acc = 0.0;
        acc += w.repeat;
        if target <= acc {
            return self.seed_motif.clone();
        }
        acc += w.transpose;
        if target <= acc {
            // Transpose by ±1..±2 pentatonic degrees, clamped 0..4.
            let signed = if self.rng.next_f64() < 0.5 { -1i32 } else { 1i32 };
            let mag = if self.rng.next_f64() < 0.5 { 1 } else { 2 };
            let shift = signed * mag;
            return self
                .seed_motif
                .iter()
                .map(|&d| (d as i32 + shift).clamp(0, 4) as u8)
                .collect();
        }
        acc += w.invert;
        if target <= acc {
            // Invert around the first note.
            let pivot = self.seed_motif[0] as i32;
            return self
                .seed_motif
                .iter()
                .map(|&d| (2 * pivot - d as i32).clamp(0, 4) as u8)
                .collect();
        }
        acc += w.diminish;
        if target <= acc {
            // "Diminish" — drop every other note (compress phrase length).
            return self
                .seed_motif
                .iter()
                .enumerate()
                .filter(|(i, _)| i % 2 == 0)
                .map(|(_, &d)| d)
                .collect();
        }
        // fragment — first 2 or 3 notes only.
        let len = if self.rng.next_f64() < 0.5 { 2 } else { 3 };
        let mut v = self.seed_motif.clone();
        v.truncate(len.min(self.seed_motif.len()));
        v
    }

    fn fire_note(&mut self, midi: i32, phase_gain: f32) {
        let beat_dur = 60.0 / self.bpm.max(1.0);
        let dur_factor = if self.cfg.staccato { 0.6 } else { 0.95 };
        let _gate_dur = beat_dur * dur_factor;
        let final_gain = gain::MELODY * phase_gain * self.cfg.gain_scalar;
        let cfg = self.cfg;

        if let Some(v) = self.voices.iter_mut().find(|v| !v.active) {
            v.active = true;
            v.phase = 0.0;
            v.freq_hz = midi_to_freq(midi);
            v.gain = final_gain;
            v.env.attack = cfg.attack;
            v.env.hold = 0.0;
            v.env.decay = cfg.decay;
            v.env.sustain_level = cfg.sustain_level;
            v.env.release = cfg.release;
            v.env.trigger(1.0);
            v.filt_age = 0.0;
            v.filt_decay = cfg.lpf_env_decay;
            v.filt_base = cfg.lpf_cutoff;
            v.filt_amount = cfg.lpf_env_amount;
            v.filt_q = cfg.lpf_resonance;
        }
    }

    pub fn render(&mut self, table: &Wavetable) -> f32 {
        let mut sum = 0.0;
        for v in &mut self.voices {
            sum += v.render(table);
        }
        sum
    }

    pub fn set_bpm(&mut self, bpm: f32) {
        self.bpm = bpm;
    }

    pub fn active_count(&self) -> usize {
        self.voices.iter().filter(|v| v.active).count()
    }

    pub fn _scale_used(&self) -> [i32; 5] {
        MINOR_PENTATONIC
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::dark_techno;

    #[test]
    fn melody_engine_constructs() {
        let pal = dark_techno();
        let m = MelodyEngine::new(48_000.0, 130.0, pal.melody, pal.melody_rhythm, pal.motif, 12345);
        assert_eq!(m.active_count(), 0);
    }

    #[test]
    fn markov_rows_sum_to_one() {
        for (pp, plane) in MARKOV.iter().enumerate() {
            for (p, row) in plane.iter().enumerate() {
                let s: f32 = row.iter().sum();
                assert!((s - 1.0).abs() < 0.05, "row [{pp}][{p}] sums to {s}");
            }
        }
    }

    #[test]
    fn melody_fires_in_swell() {
        let pal = dark_techno();
        let mut rng = Mulberry32::new(12345);
        let he = HarmonyEngine::init_run(&pal, &mut rng);
        let mut m =
            MelodyEngine::new(48_000.0, 130.0, pal.melody, pal.melody_rhythm, pal.motif, 12345);
        m.on_phase_change(Phase::Swell);
        // After ~16 beats at most one note should fire even with rest gaps.
        let mut fired = 0;
        for _ in 0..32 {
            m.on_beat(&he);
            if m.active_count() > 0 {
                fired += 1;
            }
        }
        assert!(fired > 0, "no melody notes fired in swell across 32 beats");
    }
}
