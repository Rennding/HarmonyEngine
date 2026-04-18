//! ChordTrack — rhythmic chord stabs (port of `src/sequencer.js:2002–2168`).
//!
//! For dark_techno (style=`stab`, pattern=`four_stab`) this fires multi-voice
//! square stabs on every quarter-note. Voicing comes from
//! `HarmonyEngine.voiced_chord_tones`, envelope from `palette.chord`.
//! Phase 1b skips comp/arp variants and the ghost-note RNG branch since
//! dark_techno is a pure stab style.

use crate::config::{flags, gain, Phase};
use crate::harmony::{midi_to_freq, HarmonyEngine};
use crate::palette::{ChordConfig, ChordStyle, Palette};
use crate::synth::{BiquadLowpass, Envelope};
use crate::voicing_engine;
use crate::wavetables::Wavetable;

/// Per-quarter velocities for the JS `four_stab` pattern (steps 0/4/8/12).
const FOUR_STAB_VELOCITIES: [f32; 4] = [0.85, 0.75, 0.80, 0.75];

const CHORD_VOICES: usize = 8;

struct ChordVoice {
    active: bool,
    phase: f32,
    freq_hz: f32,
    env: Envelope,
    filter: BiquadLowpass,
    gain: f32,
}

impl ChordVoice {
    fn new(sample_rate: f32) -> Self {
        Self {
            active: false,
            phase: 0.0,
            freq_hz: 0.0,
            env: Envelope::new(sample_rate),
            filter: BiquadLowpass::new(sample_rate, 1600.0, 2.0),
            gain: 0.0,
        }
    }

    #[inline]
    fn render(&mut self, table: &Wavetable, sample_rate: f32) -> f32 {
        if !self.active {
            return 0.0;
        }
        let s = table.sample(self.phase);
        self.phase += self.freq_hz / sample_rate;
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

pub struct ChordTrack {
    cfg: ChordConfig,
    voices: Vec<ChordVoice>,
    sample_rate: f32,
    /// Phase entry gate — silences the track until phase reaches `entry_phase`.
    entry_phase_idx: usize,
    current_phase_idx: usize,
    current_phase: Phase,
    /// Previous voicing — fed into VoicingEngine voice-leading. Empty
    /// at run-start. Only used when `flags::voicing_engine()` is on.
    prev_voicing: Vec<i32>,
}

impl ChordTrack {
    pub fn new(sample_rate: f32, cfg: ChordConfig) -> Self {
        Self {
            cfg,
            voices: (0..CHORD_VOICES).map(|_| ChordVoice::new(sample_rate)).collect(),
            sample_rate,
            entry_phase_idx: phase_index(cfg.entry_phase),
            current_phase_idx: 0,
            current_phase: Phase::Pulse,
            prev_voicing: Vec::with_capacity(8),
        }
    }

    pub fn on_phase_change(&mut self, phase: Phase) {
        self.current_phase_idx = phase_index(phase);
        self.current_phase = phase;
    }

    fn muted(&self) -> bool {
        self.current_phase_idx < self.entry_phase_idx
            || matches!(self.cfg.style, ChordStyle::None)
    }

    /// Per-16th-step trigger. Fires stabs at JS `four_stab` boundaries
    /// (steps 0, 4, 8, 12).
    ///
    /// When `flags::voicing_engine()` is on, route chord voicing through
    /// `VoicingEngine` (per-palette style + extensions + register +
    /// collision). Off → fall back to `HarmonyEngine::voiced_chord_tones`
    /// — preserves byte-identical golden parity vs #81.
    pub fn tick_16th(
        &mut self,
        step_in_bar: usize,
        he: &HarmonyEngine,
        palette: &Palette,
        melody_last_midi: Option<i32>,
    ) {
        if self.muted() {
            return;
        }
        let velocity = match step_in_bar {
            0 => FOUR_STAB_VELOCITIES[0],
            4 => FOUR_STAB_VELOCITIES[1],
            8 => FOUR_STAB_VELOCITIES[2],
            12 => FOUR_STAB_VELOCITIES[3],
            _ => return,
        };
        let base_gain = gain::CHORD * self.cfg.gain_scalar * velocity;

        if flags::voicing_engine() {
            let (chord_root, is_major) = he.current_chord_symbol();
            let chord_root_pc =
                (he.root_semitone() + chord_root).rem_euclid(12);
            let prev = if self.prev_voicing.is_empty() {
                None
            } else {
                Some(self.prev_voicing.as_slice())
            };
            let voicing = voicing_engine::voice(
                palette,
                chord_root_pc,
                is_major,
                self.current_phase,
                self.cfg.octave,
                melody_last_midi,
                prev,
            );
            // Cap at the palette's `voices` budget (still meaningful for
            // dense styles like drop2 noir_jazz at Maelstrom).
            let max = (self.cfg.voices as usize).min(voicing.count);
            for &tone in voicing.notes[..max].iter() {
                self.fire_voice(tone, base_gain);
            }
            // Cache for next-tick voice leading.
            self.prev_voicing.clear();
            self.prev_voicing.extend_from_slice(&voicing.notes[..max]);
        } else {
            let tones = he.voiced_chord_tones(self.cfg.octave, self.cfg.voices as usize);
            for tone in tones {
                self.fire_voice(tone, base_gain);
            }
        }
    }

    fn fire_voice(&mut self, midi: i32, base_gain: f32) {
        let sr = self.sample_rate;
        let cfg = self.cfg;
        if let Some(v) = self.voices.iter_mut().find(|v| !v.active) {
            v.active = true;
            v.phase = 0.0;
            v.freq_hz = midi_to_freq(midi);
            v.gain = base_gain;
            v.filter = BiquadLowpass::new(sr, cfg.lpf_cutoff, cfg.lpf_resonance);
            v.env.attack = cfg.attack;
            v.env.hold = 0.0;
            v.env.decay = cfg.decay;
            v.env.sustain_level = cfg.sustain_level;
            v.env.release = cfg.release;
            v.env.trigger(1.0);
        }
        // Pool exhaustion: silent fallback (matches JS behaviour).
    }

    pub fn render(&mut self, table: &Wavetable) -> f32 {
        let sr = self.sample_rate;
        let mut sum = 0.0;
        for v in &mut self.voices {
            sum += v.render(table, sr);
        }
        sum
    }

    pub fn active_count(&self) -> usize {
        self.voices.iter().filter(|v| v.active).count()
    }
}

fn phase_index(p: Phase) -> usize {
    Phase::ALL.iter().position(|&x| x == p).unwrap_or(0)
}
