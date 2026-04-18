//! DSP primitives — oscillator, biquad filter, AHDSR envelope, noise, limiter.
//!
//! JS reference: `audio.js` node graph (OscillatorNode, BiquadFilterNode,
//! GainNode, DynamicsCompressorNode). Rust equivalent runs each primitive
//! as an explicit state machine updated per sample.
//!
//! All blocks are `f32` mono — stereo routing lives at the mixer level.

use crate::wavetables::Wavetable;

/// Wavetable oscillator. Tracks phase in `[0, 1)`.
pub struct Oscillator<'a> {
    pub freq_hz: f32,
    phase: f32,
    sample_rate: f32,
    table: &'a Wavetable,
}

impl<'a> Oscillator<'a> {
    pub fn new(table: &'a Wavetable, sample_rate: f32, freq_hz: f32) -> Self {
        Self {
            freq_hz,
            phase: 0.0,
            sample_rate,
            table,
        }
    }

    pub fn set_freq(&mut self, freq_hz: f32) {
        self.freq_hz = freq_hz;
    }

    #[inline]
    pub fn next_sample(&mut self) -> f32 {
        let s = self.table.sample(self.phase);
        self.phase += self.freq_hz / self.sample_rate;
        while self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        s
    }
}

/// RBJ biquad — lowpass only for Phase 1 (the single shape dark_techno needs
/// for bass/chord filter sweeps). Coefficients recomputed on cutoff change.
pub struct BiquadLowpass {
    sample_rate: f32,
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl BiquadLowpass {
    pub fn new(sample_rate: f32, cutoff_hz: f32, q: f32) -> Self {
        let mut f = Self {
            sample_rate,
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        };
        f.set_params(cutoff_hz, q);
        f
    }

    pub fn set_params(&mut self, cutoff_hz: f32, q: f32) {
        let cutoff = cutoff_hz.clamp(20.0, self.sample_rate * 0.45);
        let w0 = std::f32::consts::TAU * cutoff / self.sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q.max(0.1));

        let b0 = (1.0 - cos_w0) / 2.0;
        let b1 = 1.0 - cos_w0;
        let b2 = (1.0 - cos_w0) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha;

        self.b0 = b0 / a0;
        self.b1 = b1 / a0;
        self.b2 = b2 / a0;
        self.a1 = a1 / a0;
        self.a2 = a2 / a0;
    }

    #[inline]
    pub fn process(&mut self, x: f32) -> f32 {
        let y =
            self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1
                - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

/// AHDSR envelope (attack-hold-decay-sustain-release) — JS melody/chord
/// palettes use the full shape; drums use attack=0, sustain=0, decay only.
#[derive(Clone, Copy, PartialEq)]
enum EnvStage {
    Idle,
    Attack,
    Hold,
    Decay,
    Sustain,
    Release,
}

pub struct Envelope {
    stage: EnvStage,
    level: f32,
    pub attack: f32,
    pub hold: f32,
    pub decay: f32,
    pub sustain_level: f32,
    pub release: f32,
    stage_t: f32,
    peak: f32,
    sample_rate: f32,
}

impl Envelope {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            stage: EnvStage::Idle,
            level: 0.0,
            attack: 0.01,
            hold: 0.0,
            decay: 0.1,
            sustain_level: 0.0,
            release: 0.05,
            stage_t: 0.0,
            peak: 1.0,
            sample_rate,
        }
    }

    pub fn trigger(&mut self, peak: f32) {
        self.stage = EnvStage::Attack;
        self.stage_t = 0.0;
        self.peak = peak;
    }

    pub fn release_now(&mut self) {
        self.stage = EnvStage::Release;
        self.stage_t = 0.0;
        self.peak = self.level; // release from current level
    }

    pub fn is_active(&self) -> bool {
        self.stage != EnvStage::Idle
    }

    #[inline]
    pub fn next_sample(&mut self) -> f32 {
        let dt = 1.0 / self.sample_rate;
        match self.stage {
            EnvStage::Idle => {
                self.level = 0.0;
            }
            EnvStage::Attack => {
                self.stage_t += dt;
                if self.attack <= 0.0 || self.stage_t >= self.attack {
                    self.level = self.peak;
                    self.stage = if self.hold > 0.0 {
                        EnvStage::Hold
                    } else {
                        EnvStage::Decay
                    };
                    self.stage_t = 0.0;
                } else {
                    self.level = self.peak * (self.stage_t / self.attack);
                }
            }
            EnvStage::Hold => {
                self.stage_t += dt;
                self.level = self.peak;
                if self.stage_t >= self.hold {
                    self.stage = EnvStage::Decay;
                    self.stage_t = 0.0;
                }
            }
            EnvStage::Decay => {
                self.stage_t += dt;
                let target = self.peak * self.sustain_level;
                if self.decay <= 0.0 || self.stage_t >= self.decay {
                    self.level = target;
                    if self.sustain_level <= 0.0 {
                        self.stage = EnvStage::Idle;
                    } else {
                        self.stage = EnvStage::Sustain;
                    }
                } else {
                    let t = self.stage_t / self.decay;
                    self.level = self.peak + (target - self.peak) * t;
                }
            }
            EnvStage::Sustain => {
                self.level = self.peak * self.sustain_level;
            }
            EnvStage::Release => {
                self.stage_t += dt;
                if self.release <= 0.0 || self.stage_t >= self.release {
                    self.level = 0.0;
                    self.stage = EnvStage::Idle;
                } else {
                    let t = self.stage_t / self.release;
                    self.level = self.peak * (1.0 - t);
                }
            }
        }
        self.level
    }
}

/// XorShift32 noise — RT-safe PRNG for snare/hat white-noise sources.
pub struct NoiseGen {
    state: u32,
}

impl NoiseGen {
    pub fn new(seed: u32) -> Self {
        Self {
            state: seed.max(1),
        }
    }

    #[inline]
    pub fn next_sample(&mut self) -> f32 {
        let mut s = self.state;
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        self.state = s;
        (s as f32 / u32::MAX as f32) * 2.0 - 1.0
    }
}

/// Soft-clip limiter — tanh saturator replacing `DynamicsCompressorNode`.
/// This is a simple stand-in for Phase 1; the full multi-stage JS master
/// chain (compressor → soft-clip → EQ → limiter) ports in Phase 2a.
#[inline]
pub fn soft_clip(x: f32) -> f32 {
    x.tanh()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wavetables::Wavetable;

    #[test]
    fn oscillator_produces_output() {
        let wt = Wavetable::from_partials(&[(1, 1.0)]);
        let mut osc = Oscillator::new(&wt, 48_000.0, 440.0);
        let mut energy = 0.0;
        for _ in 0..4800 {
            let s = osc.next_sample();
            energy += s * s;
        }
        assert!(energy > 10.0, "silent oscillator: energy {energy}");
    }

    #[test]
    fn biquad_passes_dc_when_cutoff_high() {
        let mut f = BiquadLowpass::new(48_000.0, 20_000.0, 0.707);
        // Steady DC input → near-DC output after settle.
        let mut out = 0.0;
        for _ in 0..2000 {
            out = f.process(1.0);
        }
        assert!((out - 1.0).abs() < 0.05, "DC pass fail: {out}");
    }

    #[test]
    fn biquad_attenuates_above_cutoff() {
        let mut f = BiquadLowpass::new(48_000.0, 200.0, 0.707);
        // Feed a 5 kHz sine; measure attenuation.
        let wt = Wavetable::from_partials(&[(1, 1.0)]);
        let mut osc = Oscillator::new(&wt, 48_000.0, 5000.0);
        let mut raw_energy = 0.0;
        let mut filt_energy = 0.0;
        for _ in 0..4800 {
            let s = osc.next_sample();
            raw_energy += s * s;
            let y = f.process(s);
            filt_energy += y * y;
        }
        assert!(filt_energy * 50.0 < raw_energy, "no attenuation");
    }

    #[test]
    fn envelope_returns_to_idle() {
        let mut env = Envelope::new(48_000.0);
        env.attack = 0.001;
        env.decay = 0.001;
        env.sustain_level = 0.0;
        env.release = 0.001;
        env.trigger(1.0);
        for _ in 0..1000 {
            env.next_sample();
        }
        assert!(!env.is_active(), "envelope did not end");
    }
}
