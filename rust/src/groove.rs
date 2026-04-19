//! Swing / humanize / ghost-probability scaling — port of `src/groove.js`.
//!
//! SPEC_018 §1 — phase scaling table:
//!   Pulse:     humanize ×1.0, swing ×1.0,  prob ×0.5
//!   Swell:     humanize ×1.2, swing ×1.0,  prob ×1.0
//!   Surge:     humanize ×1.0, swing ×1.3,  prob ×1.3
//!   Storm:     humanize ×0.5, swing ×1.0,  prob ×1.5
//!   Maelstrom: humanize ×2.0, swing ×1.5,  prob ×2.0 (ghost prob clamped to 0.8)
//!
//! Consumers:
//!   * `Sequencer::tick_16th` calls [`GrooveEngine::timing_offset`] when
//!     converting step index → absolute audio-sample schedule.
//!   * `MelodyEngine::on_beat` calls [`GrooveEngine::should_fire`] for ghost
//!     notes (steps with `prob < 1.0`).
//!
//! The RNG is threaded in from the caller so every swing + humanize roll
//! pulls from the song-seeded Mulberry32 (matching the JS `_songRng` path).

use crate::config::Phase;
use crate::palette::{GrooveConfig, Palette};
use crate::rng::Mulberry32;

/// Maximum ghost-note probability after phase scaling (SPEC_018 §1).
const PROB_CLAMP: f32 = 0.8;

#[derive(Clone, Copy, Debug)]
pub struct GrooveEngine {
    swing_base: f32,
    humanize_base_ms: f32,
    swing_mult: f32,
    humanize_mult: f32,
    prob_mult: f32,
}

impl Default for GrooveEngine {
    fn default() -> Self {
        Self {
            swing_base: 0.0,
            humanize_base_ms: 5.0,
            swing_mult: 1.0,
            humanize_mult: 1.0,
            prob_mult: 0.5,
        }
    }
}

impl GrooveEngine {
    pub fn new() -> Self {
        Self::default()
    }

    /// JS `GrooveEngine.initRun(palette)` — pull swing/humanize from the
    /// palette and reset phase multipliers to Pulse defaults.
    pub fn init_run(&mut self, palette: &Palette) {
        let g: GrooveConfig = palette.groove;
        self.swing_base = g.swing;
        self.humanize_base_ms = g.humanize_ms;
        self.swing_mult = 1.0;
        self.humanize_mult = 1.0;
        self.prob_mult = 0.5;
    }

    /// JS `GrooveEngine.onPhaseChange(newPhase)` — update multipliers from
    /// the phase scaling table.
    pub fn on_phase_change(&mut self, phase: Phase) {
        let (sw, hu, pr) = phase_mults(phase);
        self.swing_mult = sw;
        self.humanize_mult = hu;
        self.prob_mult = pr;
    }

    /// JS `GrooveEngine.getTimingOffset(stepIndex, subDurSecs)` — returns a
    /// timing shift (seconds) for the given 16th-note step.
    ///
    /// * Odd steps are delayed by `swing_base * swing_mult * sub_dur * 0.5`.
    /// * Every step receives a `±humanize_ms * humanize_mult` jitter.
    pub fn timing_offset(
        &self,
        step_index: u32,
        sub_dur_secs: f64,
        rng: &mut Mulberry32,
    ) -> f64 {
        let mut offset = 0.0_f64;

        if step_index % 2 == 1 {
            let swing = (self.swing_base * self.swing_mult) as f64;
            offset += swing * sub_dur_secs * 0.5;
        }

        let humanize_ms = (self.humanize_base_ms * self.humanize_mult) as f64;
        let humanize_sec = (rng.next_f64() * 2.0 - 1.0) * humanize_ms / 1000.0;
        offset += humanize_sec;

        offset
    }

    /// JS `GrooveEngine.shouldFire(step)`.
    ///
    /// * `active = false` → never fires.
    /// * `prob = None` (field absent in JS) → always fires.
    /// * `prob >= 1.0` → deterministic.
    /// * Otherwise scales by `prob_mult`, clamps to 0.8, and rolls.
    pub fn should_fire(
        &self,
        active: bool,
        prob: Option<f32>,
        rng: &mut Mulberry32,
    ) -> bool {
        if !active {
            return false;
        }
        let p = match prob {
            None => return true,
            Some(p) if p >= 1.0 => return true,
            Some(p) => p,
        };
        let scaled = (p * self.prob_mult).min(PROB_CLAMP);
        (rng.next_f64() as f32) < scaled
    }

    pub fn swing_base(&self) -> f32 {
        self.swing_base
    }
    pub fn humanize_base_ms(&self) -> f32 {
        self.humanize_base_ms
    }
    pub fn prob_mult(&self) -> f32 {
        self.prob_mult
    }

    pub fn set_swing_base(&mut self, v: f32) {
        self.swing_base = v.clamp(0.0, 1.0);
    }
    pub fn set_humanize_ms(&mut self, v: f32) {
        self.humanize_base_ms = v.clamp(0.0, 50.0);
    }
}

fn phase_mults(phase: Phase) -> (f32, f32, f32) {
    match phase {
        Phase::Pulse => (1.0, 1.0, 0.5),
        Phase::Swell => (1.0, 1.2, 1.0),
        Phase::Surge => (1.3, 1.0, 1.3),
        Phase::Storm => (1.0, 0.5, 1.5),
        Phase::Maelstrom => (1.5, 2.0, 2.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::palette_by_name;

    fn engine() -> GrooveEngine {
        let mut g = GrooveEngine::new();
        let p = palette_by_name("dark_techno").expect("dark_techno palette");
        g.init_run(&p);
        g
    }

    #[test]
    fn init_pulls_palette_groove() {
        let e = engine();
        // dark_techno groove = (0.0, 3.0)
        assert!((e.swing_base - 0.0).abs() < 1e-6);
        assert!((e.humanize_base_ms - 3.0).abs() < 1e-6);
        assert!((e.prob_mult - 0.5).abs() < 1e-6);
    }

    #[test]
    fn phase_mults_match_spec() {
        let mut e = engine();
        e.on_phase_change(Phase::Maelstrom);
        assert!((e.swing_mult - 1.5).abs() < 1e-6);
        assert!((e.humanize_mult - 2.0).abs() < 1e-6);
        assert!((e.prob_mult - 2.0).abs() < 1e-6);
    }

    #[test]
    fn even_steps_get_no_swing() {
        // Zero humanize so only swing contributes.
        let mut e = engine();
        e.swing_base = 0.2;
        e.humanize_base_ms = 0.0;
        e.on_phase_change(Phase::Surge); // swing_mult = 1.3
        let mut rng = Mulberry32::new(1);
        let sub_dur = 0.125_f64; // 16th @ 120 BPM
        let off_even = e.timing_offset(0, sub_dur, &mut rng);
        assert!(off_even.abs() < 1e-12, "even step got swing: {off_even}");
    }

    #[test]
    fn odd_steps_delayed_by_swing_formula() {
        let mut e = engine();
        e.swing_base = 0.2;
        e.humanize_base_ms = 0.0;
        e.on_phase_change(Phase::Surge); // swing_mult = 1.3
        let mut rng = Mulberry32::new(1);
        let sub_dur = 0.125_f64;
        let expected = 0.2_f64 * 1.3 * sub_dur * 0.5;
        let got = e.timing_offset(1, sub_dur, &mut rng);
        assert!(
            (got - expected).abs() < 1e-9,
            "swing offset wrong: got {got}, expected {expected}"
        );
    }

    #[test]
    fn humanize_within_bounds() {
        let mut e = engine();
        e.swing_base = 0.0;
        e.humanize_base_ms = 10.0;
        e.on_phase_change(Phase::Maelstrom); // hum_mult = 2.0 → ±20ms window
        let mut rng = Mulberry32::new(7);
        let max_abs = 20.0_f64 / 1000.0 + 1e-9;
        for s in 0..256_u32 {
            let o = e.timing_offset(s, 0.1, &mut rng);
            assert!(
                o.abs() < max_abs,
                "humanize out of bounds at {s}: {o} vs ±{max_abs}"
            );
        }
    }

    #[test]
    fn should_fire_inactive_never() {
        let e = engine();
        let mut rng = Mulberry32::new(1);
        for _ in 0..100 {
            assert!(!e.should_fire(false, Some(1.0), &mut rng));
        }
    }

    #[test]
    fn should_fire_missing_prob_always() {
        let e = engine();
        let mut rng = Mulberry32::new(1);
        for _ in 0..100 {
            assert!(e.should_fire(true, None, &mut rng));
        }
    }

    #[test]
    fn should_fire_full_prob_always() {
        let e = engine();
        let mut rng = Mulberry32::new(1);
        for _ in 0..100 {
            assert!(e.should_fire(true, Some(1.0), &mut rng));
        }
    }

    #[test]
    fn should_fire_clamped_at_0_8() {
        // prob=1.0 * prob_mult=2.0 (Maelstrom) = 2.0 → clamps to 0.8.
        // With 8000 rolls, hit rate should land near 0.8 and never exceed
        // 0.85 (which it would at 2.0).
        let mut e = engine();
        e.on_phase_change(Phase::Maelstrom);
        let mut rng = Mulberry32::new(123);
        let mut hits = 0;
        let n = 8000;
        for _ in 0..n {
            // Use prob=0.5 so post-mult=1.0 then clamps to 0.8.
            if e.should_fire(true, Some(0.5), &mut rng) {
                hits += 1;
            }
        }
        let rate = hits as f64 / n as f64;
        assert!(
            (rate - 0.8).abs() < 0.03,
            "fire rate {rate} not near clamp 0.8"
        );
    }
}
