//! PadTrack — sustained 3-osc-unison chord pad
//! (port of `src/sequencer.js:1018–1200`).
//!
//! For dark_techno (wave=triangle, octave 4, attack 0.8s, release 1.2s,
//! detune ±12 cents) the pad layers a center oscillator with two detuned
//! satellites per voice. Voices retrigger when the harmony's chord-root
//! changes; otherwise the existing voices sustain.
//!
//! Phase 1b simplification: single-table render (the `pad` wavetable is
//! the audible-fingerprint match for triangle); detune is applied as a
//! frequency offset in cents at note-start. The "breathing" gain dip from
//! the JS version is omitted as a Phase 2a refinement.

use crate::config::{gain, Phase};
use crate::harmony::{midi_to_freq, HarmonyEngine};
use crate::palette::PadConfig;
use crate::synth::{BiquadLowpass, Envelope};
use crate::wavetables::Wavetable;

/// Up to 4 chord tones × 3 unison oscillators = 12 voices max.
const PAD_VOICES_MAX: usize = 16;

const LPF_CUTOFF: f32 = 800.0;
const LPF_Q: f32 = 0.7;

struct PadVoice {
    active: bool,
    phase: f32,
    freq_hz: f32,
    env: Envelope,
    filter: BiquadLowpass,
    gain: f32,
}

impl PadVoice {
    fn new(sample_rate: f32) -> Self {
        Self {
            active: false,
            phase: 0.0,
            freq_hz: 0.0,
            env: Envelope::new(sample_rate),
            filter: BiquadLowpass::new(sample_rate, LPF_CUTOFF, LPF_Q),
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

pub struct PadTrack {
    cfg: PadConfig,
    voices: Vec<PadVoice>,
    sample_rate: f32,
    last_chord_root: i32,
    last_chord_quality: bool,
    current_phase: Phase,
    initialised: bool,
}

impl PadTrack {
    pub fn new(sample_rate: f32, cfg: PadConfig) -> Self {
        Self {
            cfg,
            voices: (0..PAD_VOICES_MAX).map(|_| PadVoice::new(sample_rate)).collect(),
            sample_rate,
            last_chord_root: i32::MIN,
            last_chord_quality: false,
            current_phase: Phase::Pulse,
            initialised: false,
        }
    }

    pub fn on_phase_change(&mut self, phase: Phase) {
        self.current_phase = phase;
    }

    /// Per-beat hook — checks if the chord changed and re-triggers voices.
    /// Pad is gated by the per-phase floor (`floor_pad`) plus a permissive
    /// "swell+" gate so it builds in early as a quiet bed before storm
    /// makes it floor.
    pub fn on_beat(&mut self, he: &HarmonyEngine) {
        // Pad is too quiet for pulse — match JS: enabled at swell+.
        if matches!(self.current_phase, Phase::Pulse) {
            return;
        }
        let (root, quality) = he.current_chord_symbol();
        if self.initialised && root == self.last_chord_root && quality == self.last_chord_quality {
            return;
        }
        self.last_chord_root = root;
        self.last_chord_quality = quality;
        self.initialised = true;

        // Fade out the existing voices — each will release through its own envelope.
        for v in &mut self.voices {
            if v.active {
                v.env.release_now();
            }
        }

        // Allocate fresh voices.
        let voice_count = self.current_phase.pad_voices() as usize;
        let tones = he.voiced_chord_tones(self.cfg.octave, voice_count);
        let voice_gain = gain::PAD;

        for (i, tone) in tones.iter().enumerate() {
            let base_freq = midi_to_freq(*tone);
            // 3-osc unison: center + ±detune (cents → multiplier).
            let detune_mult_up = 2f32.powf(self.cfg.detune_cents / 1200.0);
            let detune_mult_dn = 2f32.powf(-self.cfg.detune_cents / 1200.0);
            // Upper voices fade slightly so the root sits forward.
            let vel_scale = if i == 0 { 1.0 } else { 0.85 };
            self.start_voice(base_freq, voice_gain * vel_scale);
            self.start_voice(base_freq * detune_mult_up, voice_gain * vel_scale * 0.7);
            self.start_voice(base_freq * detune_mult_dn, voice_gain * vel_scale * 0.7);
        }
    }

    fn start_voice(&mut self, freq_hz: f32, voice_gain: f32) {
        let sr = self.sample_rate;
        let cfg = self.cfg;
        if let Some(v) = self.voices.iter_mut().find(|v| !v.active) {
            v.active = true;
            v.phase = 0.0;
            v.freq_hz = freq_hz;
            v.gain = voice_gain;
            v.filter = BiquadLowpass::new(sr, LPF_CUTOFF, LPF_Q);
            v.env.attack = cfg.attack;
            v.env.hold = 0.0;
            v.env.decay = 0.10;
            v.env.sustain_level = 0.9; // long sustain bed
            v.env.release = cfg.release;
            v.env.trigger(1.0);
        }
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
