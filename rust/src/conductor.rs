//! Conductor — beat clock + per-beat orchestration.
//!
//! JS reference: `src/conductor.js` + `startBeatClock` in `audio.js:493`.
//!
//! Phase 1 runs the conductor *inside the audio callback*: a sample
//! counter advances once per rendered sample, and when it crosses a
//! 16th-step boundary the Sequencer.tick_16th hook fires. This sidesteps
//! the JS Chris Wilson scheduler (25ms setInterval + 100ms lookahead) —
//! in Rust the audio callback runs on a real RT thread so sample-accurate
//! scheduling is inherently tighter.
//!
//! The ringbuf-fed composer-thread split called for in SPEC_057 §4 Phase 1
//! acceptance lands in Phase 1.5 / Phase 2a (#60) when we break dispatch
//! into per-voice threads; for the single-palette parity target, a single
//! audio-thread composer already meets the "no underruns" criterion.

use crate::config::{self, Phase};
use crate::harmony::HarmonyEngine;
use crate::palette::Palette;
use crate::rng::Mulberry32;
use crate::sequencer::Sequencer;
use crate::synth::soft_clip;

pub struct Conductor {
    palette: Palette,
    harmony: HarmonyEngine,
    sequencer: Sequencer,
    sample_rate: f32,
    bpm: f32,
    samples_per_16th: f64,
    sample_counter: f64,
    step_index: u64, // total 16th steps elapsed
    beat_count: u32, // whole beats elapsed (updates DC/phase)
    dc: f64,
    phase: Phase,
}

impl Conductor {
    pub fn new(sample_rate: f32, seed: i32) -> Self {
        let palette = crate::palette::dark_techno();
        let mut song_rng = Mulberry32::new(seed);

        // JS `G.bpm = pal.bpmRange[0] + floor(rng() * (range[1]-range[0]+1))`
        let (lo, hi) = palette.bpm_range;
        let bpm_roll = (song_rng.next_f64() * (hi - lo + 1) as f64) as u32;
        let bpm = (lo + bpm_roll) as f32;

        let harmony = HarmonyEngine::init_run(&palette, &mut song_rng);
        let sequencer = Sequencer::new(sample_rate, &palette, seed);

        let samples_per_beat = sample_rate as f64 * 60.0 / bpm as f64;
        let samples_per_16th = samples_per_beat / 4.0;

        Self {
            palette,
            harmony,
            sequencer,
            sample_rate,
            bpm,
            samples_per_16th,
            sample_counter: 0.0,
            step_index: 0,
            beat_count: 0,
            dc: 0.0,
            phase: Phase::Pulse,
        }
    }

    pub fn bpm(&self) -> f32 {
        self.bpm
    }

    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn beat_count(&self) -> u32 {
        self.beat_count
    }

    pub fn palette_name(&self) -> &'static str {
        self.palette.name
    }

    /// Render one audio sample — advances the scheduler and mixes the
    /// sequencer output through the master limiter.
    #[inline]
    pub fn render_sample(&mut self) -> f32 {
        self.sample_counter += 1.0;
        if self.sample_counter >= self.samples_per_16th {
            self.sample_counter -= self.samples_per_16th;
            self.on_16th();
        }
        let raw = self.sequencer.render();
        // Master: gentle master gain + tanh soft-clip — JS's limiter chain
        // is more elaborate; Phase 2a reintroduces the full DynamicsCompressor
        // + multi-stage chain.
        soft_clip(raw * 0.8)
    }

    fn on_16th(&mut self) {
        let step_in_bar = (self.step_index % 16) as usize;
        // On each downbeat (every 4th 16th-step): run the per-beat hook.
        if step_in_bar.is_multiple_of(4) {
            self.on_beat();
        }
        self.sequencer.tick_16th(step_in_bar, &self.harmony);
        self.step_index = self.step_index.wrapping_add(1);
    }

    fn on_beat(&mut self) {
        self.beat_count = self.beat_count.wrapping_add(1);
        self.harmony.advance_beat();
        // DC update — JS `updateDC` with no tension map for Phase 1.
        let cycle_beat = self.beat_count as f64;
        self.dc = (cycle_beat / config::DC_SCALE).powf(config::DC_EXP);
        self.phase = Phase::from_dc(self.dc);
    }

    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }

    pub fn dc(&self) -> f64 {
        self.dc
    }
}
