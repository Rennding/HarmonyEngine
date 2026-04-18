//! Voice pool — 16-voice allocator.
//!
//! JS reference: `src/voice_pool.js`. Phase 1 uses the pool for pitched
//! voices (bass, chord stabs, melody, pad). Drums render as transient
//! one-shots inside `sequencer::DrumRenderer` and don't need a pool slot.
//!
//! This Phase 1 implementation is a simple allocator — no SFX spawn path,
//! no streak detune, no ambient_dread octave drop. Those hooks port alongside
//! the SFX system in Phase 2a.

use crate::synth::{BiquadLowpass, Envelope};
use crate::wavetables::Wavetable;

pub const POOL_SIZE: usize = 16;

pub struct Voice {
    pub active: bool,
    pub phase: f32,
    pub freq_hz: f32,
    pub env: Envelope,
    pub filter: BiquadLowpass,
    pub gain: f32,
}

impl Voice {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            active: false,
            phase: 0.0,
            freq_hz: 440.0,
            env: Envelope::new(sample_rate),
            filter: BiquadLowpass::new(sample_rate, 20_000.0, 0.707),
            gain: 0.0,
        }
    }

    /// Render one sample. The table is looked up from the shared wavetable
    /// set by the sequencer at note-on (pool slots don't own their own WT).
    pub fn render(&mut self, table: &Wavetable, sample_rate: f32) -> f32 {
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

pub struct VoicePool {
    voices: Vec<Voice>,
    sample_rate: f32,
}

impl VoicePool {
    pub fn new(sample_rate: f32) -> Self {
        let voices = (0..POOL_SIZE).map(|_| Voice::new(sample_rate)).collect();
        Self {
            voices,
            sample_rate,
        }
    }

    pub fn allocate(&mut self) -> Option<&mut Voice> {
        self.voices.iter_mut().find(|v| !v.active)
    }

    pub fn active_count(&self) -> usize {
        self.voices.iter().filter(|v| v.active).count()
    }

    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }

    /// Render and sum all active voices against the given wavetable
    /// (Phase 1 ports only use one wavetable class per render batch).
    pub fn render_sum(&mut self, table: &Wavetable) -> f32 {
        let sr = self.sample_rate;
        let mut sum = 0.0;
        for v in &mut self.voices {
            sum += v.render(table, sr);
        }
        sum
    }
}

/// Convenience wrapper: mix one voice onto a per-sample accumulator when
/// each active voice may use a different wavetable (chord stabs + bass).
pub fn render_voice(v: &mut Voice, table: &Wavetable, sample_rate: f32) -> f32 {
    v.render(table, sample_rate)
}

/// Parameters for `start_voice`. Grouped into a struct so the helper
/// stays under the clippy argument-count threshold and so Phase 2a can
/// extend the palette without breaking callers.
#[derive(Clone, Copy)]
pub struct NoteParams {
    pub freq_hz: f32,
    pub cutoff_hz: f32,
    pub q: f32,
    pub gain: f32,
    pub attack: f32,
    pub decay: f32,
    pub sustain_level: f32,
    pub release: f32,
}

/// Find any free voice and kick it with the supplied note parameters.
/// Returns `false` when the pool is exhausted (JS "silent fallback").
pub fn start_voice(pool: &mut VoicePool, p: NoteParams) -> bool {
    let sr = pool.sample_rate();
    if let Some(v) = pool.allocate() {
        v.active = true;
        v.phase = 0.0;
        v.freq_hz = p.freq_hz;
        v.gain = p.gain;
        v.filter = BiquadLowpass::new(sr, p.cutoff_hz, p.q);
        v.env.attack = p.attack;
        v.env.hold = 0.0;
        v.env.decay = p.decay;
        v.env.sustain_level = p.sustain_level;
        v.env.release = p.release;
        v.env.trigger(1.0);
        true
    } else {
        false
    }
}

