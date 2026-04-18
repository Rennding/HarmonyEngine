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

use crate::config::{self, master, Phase};
use crate::harmony::HarmonyEngine;
use crate::palette::Palette;
use crate::plan::{Plan, PlanPublisher};
use crate::rng::Mulberry32;
use crate::sequencer::{Sequencer, TrackGains};
use crate::synth::{soft_clip, BrickwallLimiter, PeakCompressor};
use crate::tension::TensionMap;

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
    total_samples: u64, // absolute sample index since run-start
    dc: f64,
    phase: Phase,
    tension: TensionMap,
    target_track_gains: TrackGains,
    compressor: PeakCompressor,
    limiter: BrickwallLimiter,
    /// Smoothing coefficient applied per audio sample to track-gain lerp.
    /// At 48 kHz this gives a ~250 ms ramp toward target.
    gain_smooth: f32,
    /// RT-safe plan publisher — Phase 2b-1 (#81). Conductor stamps a fresh
    /// plan on every beat (`on_beat`) and on immediate-publish events
    /// (palette swap, forced phase). Voice workers haven't yet been
    /// rewired to read it for audio output — `render_sample` still
    /// composes inline — but workers / tests can observe the generation
    /// bump to exercise the flush protocol.
    plan_publisher: PlanPublisher,
}

impl Conductor {
    pub fn new(sample_rate: f32, seed: i32) -> Self {
        Self::with_palette(sample_rate, seed, crate::palette::dark_techno())
    }

    pub fn with_palette_name(sample_rate: f32, seed: i32, name: &str) -> Self {
        let palette = crate::palette::palette_by_name(name)
            .unwrap_or_else(crate::palette::dark_techno);
        Self::with_palette(sample_rate, seed, palette)
    }

    pub fn with_palette(sample_rate: f32, seed: i32, palette: Palette) -> Self {
        let mut song_rng = Mulberry32::new(seed);

        // JS `G.bpm = pal.bpmRange[0] + floor(rng() * (range[1]-range[0]+1))`
        let (lo, hi) = palette.bpm_range;
        let bpm_roll = (song_rng.next_f64() * (hi - lo + 1) as f64) as u32;
        let bpm = (lo + bpm_roll) as f32;

        let harmony = HarmonyEngine::init_run(&palette, &mut song_rng);
        let tension = TensionMap::generate(&mut song_rng, palette.tension);
        let sequencer = Sequencer::new(sample_rate, &palette, seed, bpm);

        let samples_per_beat = sample_rate as f64 * 60.0 / bpm as f64;
        let samples_per_16th = samples_per_beat / 4.0;

        let compressor = PeakCompressor::new(
            sample_rate,
            master::COMP_THRESHOLD,
            master::COMP_RATIO,
            master::COMP_KNEE,
            master::COMP_ATTACK,
            master::COMP_RELEASE,
        );
        let limiter = BrickwallLimiter::new(
            sample_rate,
            master::LIM_THRESHOLD,
            master::LIM_RATIO,
            master::LIM_ATTACK,
            master::LIM_RELEASE,
        );
        // 250 ms ramp at sample rate.
        let gain_smooth = 1.0 - (-1.0 / (0.250 * sample_rate)).exp();

        let initial_plan = Plan::initial(palette.name, bpm, samples_per_16th);
        let plan_publisher = PlanPublisher::new(initial_plan);

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
            total_samples: 0,
            dc: 0.0,
            phase: Phase::Pulse,
            tension,
            target_track_gains: TrackGains::for_phase(Phase::Pulse),
            compressor,
            limiter,
            gain_smooth,
            plan_publisher,
        }
    }

    /// Handle to the plan publisher so voice workers / tests can subscribe
    /// to generation bumps without racing the audio callback.
    pub fn plan_publisher(&self) -> PlanPublisher {
        self.plan_publisher.clone()
    }

    /// Current plan generation — convenience for diagnostic consumers.
    pub fn plan_generation(&self) -> u64 {
        self.plan_publisher.current_generation()
    }

    /// Publish a fresh plan out-of-band — palette swap, forced phase,
    /// tension-spike path. Bumps generation so voice workers flush stale
    /// lookahead within the next callback. Returns the new generation.
    pub fn force_publish_plan(&self) -> u64 {
        self.plan_publisher.publish(self.build_plan())
    }

    fn build_plan(&self) -> Plan {
        let mut plan = Plan::initial(self.palette.name, self.bpm, self.samples_per_16th);
        plan.beat_index = self.beat_count as u64;
        plan.beat_time_samples = self.total_samples;
        plan.phase = self.phase;
        plan.dc = self.dc;
        plan.pad_voice_count = self.phase.pad_voices();
        plan
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

    /// Render one audio sample — advances the scheduler, mixes the
    /// sequencer output through the master compressor + soft-clip + limiter,
    /// and smooths per-track gain coefficients toward their phase targets.
    #[inline]
    pub fn render_sample(&mut self) -> f32 {
        // Smooth per-sample track-gain ramp.
        let alpha = self.gain_smooth;
        let target = self.target_track_gains;
        self.sequencer.track_gains.lerp_toward(&target, alpha);

        self.sample_counter += 1.0;
        self.total_samples = self.total_samples.wrapping_add(1);
        if self.sample_counter >= self.samples_per_16th {
            self.sample_counter -= self.samples_per_16th;
            self.on_16th();
        }
        let raw = self.sequencer.render();
        // Master chain: peak compressor → tanh soft-clip → brick-wall limiter →
        // master gain. Phase 2a layers in the multi-band EQ shelves + reverb +
        // delay buses from `audio.js:374–432`.
        let comped = self.compressor.process(raw);
        let clipped = soft_clip(comped);
        let limited = self.limiter.process(clipped);
        limited * master::MASTER_GAIN
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
        // DC update — natural curve plus TensionMap modulation (SPEC_011).
        let cycle_beat = self.beat_count as f64;
        let base_dc = (cycle_beat / config::DC_SCALE).powf(config::DC_EXP);
        let t = self.tension.offset_for(self.beat_count, base_dc);
        self.dc = if t.freeze {
            // Plateau: hold frozen DC, then ease back to base over freeze_lerp.
            t.frozen_dc + (base_dc - t.frozen_dc) * t.freeze_lerp
        } else {
            (base_dc + t.offset).max(0.0)
        };
        let prev_phase = self.phase;
        self.phase = Phase::from_dc(self.dc);
        if self.phase != prev_phase {
            self.target_track_gains = TrackGains::for_phase(self.phase);
            self.sequencer.on_phase_change(self.phase);
        }
        self.sequencer.on_beat(&self.harmony);

        // Phase 2b-1 (#81): publish a fresh plan so voice workers tag
        // their next-beat events with the new generation. The audio path
        // itself is unchanged — Sequencer continues to synthesise inline —
        // but the publish gives tests / future worker threads a live
        // generation counter to flush against.
        self.plan_publisher.publish(self.build_plan());
    }

    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }

    pub fn dc(&self) -> f64 {
        self.dc
    }
}
