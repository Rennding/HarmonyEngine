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

/// Per-palette wavetable set — one entry per audible role. JS reference:
/// `RECIPES[paletteName]` at `wavetables.js:82–206`. Phase 2a-2 adds the
/// nine non-dark_techno palettes. `chord` is synthesised explicitly so the
/// ChordTrack stab/comp/arp paths have a distinct square-ish tone per palette.
pub struct PaletteWavetables {
    pub kick: Wavetable,
    pub bass: Wavetable,
    pub snare: Wavetable,
    pub perc: Wavetable,
    pub pad: Wavetable,
    pub voice: Wavetable,
    pub melody: Wavetable,
    pub chord: Wavetable,
}

impl PaletteWavetables {
    /// Dispatch on palette name — matches `RECIPES[paletteName]` in JS.
    /// Falls back to `dark_techno` for unknown names so the audio path never
    /// dead-ends on a typo.
    pub fn for_palette(name: &str) -> Self {
        match name {
            "dark_techno" => Self::dark_techno(),
            "synthwave" => Self::synthwave(),
            "glitch" => Self::glitch(),
            "ambient_dread" => Self::ambient_dread(),
            "lo_fi_chill" => Self::lo_fi_chill(),
            "chiptune" => Self::chiptune(),
            "noir_jazz" => Self::noir_jazz(),
            "industrial" => Self::industrial(),
            "vaporwave" => Self::vaporwave(),
            "breakbeat" => Self::breakbeat(),
            _ => Self::dark_techno(),
        }
    }

    /// JS `RECIPES.dark_techno` (`wavetables.js:84`).
    pub fn dark_techno() -> Self {
        Self {
            kick: Wavetable::from_partials(&[(1, 1.0), (2, 0.5), (3, 0.1)]),
            bass: Wavetable::thick_saw(24, 0.85),
            snare: Wavetable::from_partials(&[
                (1, 0.3), (3, 0.5), (5, 0.7), (7, 0.9), (9, 0.6), (11, 0.4),
            ]),
            perc: Wavetable::from_partials(&[(1, 0.8), (4, 0.6), (7, 0.4), (11, 0.3)]),
            pad: Wavetable::hollow(16, 1.2),
            voice: Wavetable::thick_saw(12, 0.9),
            melody: Wavetable::from_partials(&[(1, 1.0), (3, 0.7), (5, 0.4)]),
            chord: Wavetable::pulse(0.5, 32),
        }
    }

    /// JS `RECIPES.synthwave` (`wavetables.js:96`).
    pub fn synthwave() -> Self {
        Self {
            kick: Wavetable::from_partials(&[(1, 1.0), (2, 0.3)]),
            bass: Wavetable::thick_saw(20, 1.0),
            snare: Wavetable::from_partials(&[
                (1, 0.2), (2, 0.4), (4, 0.6), (6, 0.5), (8, 0.3),
            ]),
            perc: Wavetable::organ(&[(1, 0.9), (3, 0.5), (5, 0.3)]),
            pad: Wavetable::thick_saw(12, 1.4),
            voice: Wavetable::hollow(10, 0.8),
            melody: Wavetable::thick_saw(8, 1.0),
            chord: Wavetable::pulse(0.5, 24),
        }
    }

    /// JS `RECIPES.glitch` (`wavetables.js:108`).
    pub fn glitch() -> Self {
        Self {
            kick: Wavetable::from_partials(&[(1, 1.0), (2, 0.7), (4, 0.3), (8, 0.15)]),
            bass: Wavetable::hollow(20, 0.7),
            snare: Wavetable::from_partials(&[
                (1, 0.2), (3, 0.3), (5, 0.5), (7, 0.7), (9, 0.8), (13, 0.6), (17, 0.4),
            ]),
            perc: Wavetable::from_partials(&[(1, 0.5), (5, 0.8), (9, 0.6), (13, 0.7)]),
            pad: Wavetable::from_partials(&[(1, 0.6), (2, 0.3), (5, 0.5), (7, 0.4), (11, 0.3)]),
            voice: Wavetable::thick_saw(16, 0.7),
            melody: Wavetable::from_partials(&[(1, 1.0), (2, 0.15), (6, 0.2)]),
            chord: Wavetable::pulse(0.5, 32),
        }
    }

    /// JS `RECIPES.ambient_dread` (`wavetables.js:120`).
    pub fn ambient_dread() -> Self {
        Self {
            kick: Wavetable::from_partials(&[(1, 1.0), (2, 0.15)]),
            bass: Wavetable::from_partials(&[(1, 1.0), (2, 0.2), (3, 0.05)]),
            snare: Wavetable::from_partials(&[
                (1, 0.1), (2, 0.2), (5, 0.4), (7, 0.3), (11, 0.2),
            ]),
            perc: Wavetable::organ(&[(1, 0.7), (2, 0.3), (4, 0.2)]),
            pad: Wavetable::from_partials(&[(1, 1.0), (2, 0.4), (3, 0.15), (5, 0.08)]),
            voice: Wavetable::from_partials(&[(1, 1.0), (3, 0.2), (5, 0.05)]),
            melody: Wavetable::from_partials(&[(1, 1.0), (3, 0.08)]),
            chord: Wavetable::from_partials(&[(1, 1.0), (3, 0.08)]),
        }
    }

    /// JS `RECIPES.lo_fi_chill` (`wavetables.js:132`).
    pub fn lo_fi_chill() -> Self {
        // JS lo_fi_chill.pad uses a non-integer partial (4.54) — skipped in
        // the integer Fourier series; the sine+2 approximation is audibly
        // close given lo_fi's dark voicing.
        Self {
            kick: Wavetable::from_partials(&[(1, 1.0), (2, 0.25)]),
            bass: Wavetable::from_partials(&[(1, 1.0), (2, 0.3), (3, 0.08)]),
            snare: Wavetable::from_partials(&[
                (1, 0.15), (2, 0.25), (4, 0.35), (6, 0.25), (8, 0.15),
            ]),
            perc: Wavetable::organ(&[(1, 0.6), (3, 0.3), (5, 0.15)]),
            pad: Wavetable::from_partials(&[(1, 1.0), (2, 0.4), (3, 0.15)]),
            voice: Wavetable::from_partials(&[(1, 1.0), (2, 0.1)]),
            melody: Wavetable::from_partials(&[(1, 1.0), (2, 0.4), (3, 0.15), (5, 0.08)]),
            chord: Wavetable::from_partials(&[(1, 1.0), (2, 0.4), (3, 0.15)]),
        }
    }

    /// JS `RECIPES.chiptune` (`wavetables.js:144`).
    pub fn chiptune() -> Self {
        Self {
            kick: Wavetable::from_partials(&[(1, 1.0), (2, 0.15)]),
            bass: Wavetable::pulse(0.25, 24),
            snare: Wavetable::pulse(0.5, 16),
            perc: Wavetable::pulse(0.125, 20),
            pad: Wavetable::pulse(0.5, 12),
            voice: Wavetable::pulse(0.125, 16),
            melody: Wavetable::pulse(0.125, 20),
            chord: Wavetable::pulse(0.5, 12),
        }
    }

    /// JS `RECIPES.noir_jazz` (`wavetables.js:156`) — #56 60s-detective overhaul.
    /// `melody` aliases to `melody_violin` per the JS default.
    pub fn noir_jazz() -> Self {
        Self {
            kick: Wavetable::from_partials(&[(1, 1.0), (2, 0.12)]),
            bass: Wavetable::from_partials(&[
                (1, 1.0), (2, 0.18), (3, 0.40), (5, 0.18), (7, 0.08),
            ]),
            snare: Wavetable::from_partials(&[
                (1, 0.1), (2, 0.2), (3, 0.3), (5, 0.4), (7, 0.2),
            ]),
            perc: Wavetable::from_partials(&[(1, 0.5), (5, 0.3), (8, 0.15)]),
            pad: Wavetable::from_partials(&[(1, 1.0), (5, 0.2), (11, 0.05)]),
            voice: Wavetable::from_partials(&[(1, 1.0), (2, 0.15), (3, 0.05)]),
            melody: Wavetable::from_partials(&[
                (1, 1.0), (2, 0.55), (3, 0.35), (4, 0.22), (5, 0.12), (6, 0.06), (7, 0.03),
            ]),
            chord: Wavetable::from_partials(&[(1, 1.0), (2, 0.55), (3, 0.35), (5, 0.18)]),
        }
    }

    /// JS `RECIPES.industrial` (`wavetables.js:172`).
    pub fn industrial() -> Self {
        Self {
            kick: Wavetable::from_partials(&[(1, 1.0), (2, 0.7), (3, 0.4), (5, 0.2)]),
            bass: Wavetable::thick_saw(28, 0.6),
            snare: Wavetable::from_partials(&[
                (1, 0.3), (2, 0.5), (4, 0.7), (6, 0.8), (8, 0.6), (12, 0.4),
            ]),
            perc: Wavetable::from_partials(&[
                (1, 0.4), (3, 0.6), (7, 0.8), (11, 0.5), (15, 0.3),
            ]),
            pad: Wavetable::thick_saw(16, 0.8),
            voice: Wavetable::thick_saw(20, 0.7),
            melody: Wavetable::hollow(12, 0.7),
            chord: Wavetable::thick_saw(16, 0.7),
        }
    }

    /// JS `RECIPES.vaporwave` (`wavetables.js:184`).
    pub fn vaporwave() -> Self {
        Self {
            kick: Wavetable::from_partials(&[(1, 1.0), (2, 0.2)]),
            bass: Wavetable::from_partials(&[(1, 1.0), (2, 0.35), (3, 0.1)]),
            snare: Wavetable::from_partials(&[
                (1, 0.15), (2, 0.3), (4, 0.4), (6, 0.3), (8, 0.15),
            ]),
            perc: Wavetable::organ(&[(1, 0.5), (3, 0.25), (5, 0.12)]),
            pad: Wavetable::thick_saw(20, 1.6),
            voice: Wavetable::from_partials(&[(1, 1.0), (2, 0.15), (3, 0.05)]),
            melody: Wavetable::from_partials(&[(1, 1.0), (3, 0.3), (5, 0.15)]),
            chord: Wavetable::thick_saw(20, 1.6),
        }
    }

    /// JS `RECIPES.breakbeat` (`wavetables.js:196`).
    pub fn breakbeat() -> Self {
        Self {
            kick: Wavetable::from_partials(&[(1, 1.0), (2, 0.6), (3, 0.25), (4, 0.1)]),
            bass: Wavetable::thick_saw(24, 0.7),
            snare: Wavetable::from_partials(&[
                (1, 0.25), (3, 0.45), (5, 0.6), (7, 0.5), (9, 0.35), (13, 0.2),
            ]),
            perc: Wavetable::from_partials(&[(1, 0.5), (4, 0.7), (7, 0.5), (11, 0.3)]),
            pad: Wavetable::thick_saw(14, 0.9),
            voice: Wavetable::thick_saw(16, 0.8),
            melody: Wavetable::thick_saw(10, 0.8),
            chord: Wavetable::thick_saw(10, 0.8),
        }
    }
}

/// Phase 1 alias — kept so existing `DarkTechnoWavetables::build()` callers
/// from the Phase 1 commits keep working while Phase 2a-2 rolls out.
pub type DarkTechnoWavetables = PaletteWavetables;

impl DarkTechnoWavetables {
    pub fn build() -> Self {
        Self::dark_techno()
    }
}
