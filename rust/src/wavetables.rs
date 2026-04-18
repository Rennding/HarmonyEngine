//! Wavetable recipe builders — port of `src/wavetables.js`.
//!
//! Web Audio's `PeriodicWave` interprets `{real, imag}` arrays as a DC offset
//! plus Fourier `a_n cos + b_n sin` coefficients. The JS code only populates
//! `imag[n]` (sine series), so each recipe renders as:
//!
//! `s(phi) = Σ imag[n] * sin(n*phi)`
//!
//! We precompute each recipe into a sample table (one cycle) and play it
//! back via linear-interpolated table lookup in `synth::Oscillator`.
//!
//! Phase 1 ships `dark_techno` recipes only (kick/bass/snare/perc/pad/
//! voice/melody/perk). Other palettes port in Phase 2a.

pub const TABLE_LEN: usize = 1024;

#[derive(Clone)]
pub struct Wavetable {
    pub samples: Vec<f32>,
}

impl Wavetable {
    /// JS `_harmonics(partials)` — `partials = [[n, amp], …]`.
    pub fn from_partials(partials: &[(u32, f32)]) -> Self {
        let mut samples = vec![0.0f32; TABLE_LEN];
        for &(n, amp) in partials {
            if n == 0 {
                continue;
            }
            for (i, s) in samples.iter_mut().enumerate() {
                let phi = (i as f32 / TABLE_LEN as f32) * std::f32::consts::TAU;
                *s += amp * (n as f32 * phi).sin();
            }
        }
        // Web Audio normalises PeriodicWave by default → peak-normalise here.
        let peak = samples.iter().fold(0.0f32, |acc, &v| acc.max(v.abs()));
        if peak > 1e-9 {
            for s in &mut samples {
                *s /= peak;
            }
        }
        Self { samples }
    }

    /// JS `_thickSaw(nPartials, brightnessExp)` — all harmonics with
    /// `1/n^exp` rolloff.
    pub fn thick_saw(n_partials: u32, brightness_exp: f32) -> Self {
        let partials: Vec<(u32, f32)> = (1..=n_partials)
            .map(|n| (n, (1.0f32 / n as f32).powf(brightness_exp)))
            .collect();
        Self::from_partials(&partials)
    }

    /// JS `_hollow(nPartials, rolloff)` — odd harmonics only.
    pub fn hollow(n_partials: u32, rolloff: f32) -> Self {
        let partials: Vec<(u32, f32)> = (1..=n_partials)
            .step_by(2)
            .map(|n| (n, (1.0f32 / n as f32).powf(rolloff)))
            .collect();
        Self::from_partials(&partials)
    }

    /// JS `_organ({harmonicN: amp})`.
    pub fn organ(drawbars: &[(u32, f32)]) -> Self {
        Self::from_partials(drawbars)
    }

    /// JS `_pulse(duty, nPartials)` — Fourier series for a duty-cycle pulse.
    pub fn pulse(duty: f32, n_partials: u32) -> Self {
        let mut partials = Vec::new();
        for k in 1..=n_partials {
            let kf = k as f32;
            let amp = (2.0 / (kf * std::f32::consts::PI))
                * (kf * std::f32::consts::PI * duty).sin();
            if amp.abs() > 0.001 {
                partials.push((k, amp.abs()));
            }
        }
        Self::from_partials(&partials)
    }

    /// Sample at phase `phi` in `[0, 1)` with linear interpolation.
    #[inline]
    pub fn sample(&self, phi: f32) -> f32 {
        let x = phi * TABLE_LEN as f32;
        let i = x.floor() as usize % TABLE_LEN;
        let j = (i + 1) % TABLE_LEN;
        let f = x - x.floor();
        self.samples[i] * (1.0 - f) + self.samples[j] * f
    }
}

/// Built set of recipes for `dark_techno` — JS `RECIPES.dark_techno` at
/// `wavetables.js:84–93`.
pub struct DarkTechnoWavetables {
    pub kick: Wavetable,
    pub bass: Wavetable,
    pub snare: Wavetable,
    pub perc: Wavetable,
    pub pad: Wavetable,
    pub voice: Wavetable,
    pub melody: Wavetable,
}

impl DarkTechnoWavetables {
    pub fn build() -> Self {
        Self {
            kick: Wavetable::from_partials(&[(1, 1.0), (2, 0.5), (3, 0.1)]),
            bass: Wavetable::thick_saw(24, 0.85),
            snare: Wavetable::from_partials(&[
                (1, 0.3),
                (3, 0.5),
                (5, 0.7),
                (7, 0.9),
                (9, 0.6),
                (11, 0.4),
            ]),
            perc: Wavetable::from_partials(&[(1, 0.8), (4, 0.6), (7, 0.4), (11, 0.3)]),
            pad: Wavetable::hollow(16, 1.2),
            voice: Wavetable::thick_saw(12, 0.9),
            melody: Wavetable::from_partials(&[(1, 1.0), (3, 0.7), (5, 0.4)]),
        }
    }
}
