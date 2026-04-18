//! Conductor `Plan` struct + RT-safe publisher — SPEC_057 §2 Shape B.
//!
//! Each beat the Conductor thread computes harmony / phase / DC / tension
//! / voicing values and publishes a fresh `Plan` via an atomic pointer
//! swap. Voice worker threads load the plan, compose their next beat of
//! events, and push them to per-voice SPSC ring buffers.
//!
//! The spec calls for `basedrop` pointer swap; `arc-swap` provides the same
//! RT-safe load-path semantic (hazard-pointer-style) with a simpler API and
//! no explicit `Collector` to manage. Switch to basedrop in Phase 2b if the
//! audio thread needs deferred-drop guarantees we don't currently provide
//! (Plan is read by workers — not the audio thread — so this is moot today).

use std::sync::Arc;

use arc_swap::ArcSwap;

use crate::config::Phase;

/// Snapshot of conductor state published each beat. Read-mostly — workers
/// clone the inner `Arc` (ref-count bump only) when they need to compose.
#[derive(Clone, Debug)]
pub struct Plan {
    /// Monotonic beat counter (starts at 0).
    pub beat_index: u64,
    /// Sample index (audio-thread clock) at this beat's downbeat.
    pub beat_time_samples: u64,
    /// Sub-division: samples per 16th step. Workers compute per-16th event
    /// timestamps as `beat_time_samples + i * samples_per_16th`.
    pub samples_per_16th: f64,
    /// Current macro phase. Workers gate entry (e.g. chord track waits for
    /// `swell`, pad waits for `swell`+).
    pub phase: Phase,
    /// Difficulty coefficient. Carried for diagnostic + future density work.
    pub dc: f64,
    /// Palette identity string — purely informational for this slice; #69
    /// adds a palette handle so workers can switch palettes live.
    pub palette_name: &'static str,
    /// Current chord root (0..11 semitone offset from key root).
    pub chord_root: i32,
    /// `true` for major triads, `false` for minor.
    pub chord_is_major: bool,
    /// Key root (tonic semitone, 0..11). Constant per run for now.
    pub key_root_semitone: i32,
    /// Number of pad voices this phase should sustain.
    pub pad_voice_count: u32,
    /// Beats in current chord (0..`beats_per_chord`) — pad-track
    /// change-detector reads this.
    pub beats_in_chord: u32,
    /// Current BPM. Set once at run-start; Phase 2a-1 keeps it fixed.
    pub bpm: f32,
    /// Section identity mask (A/B/C). Unused in 2a-1, reserved for 2b
    /// VoicingEngine section-aware decisions.
    pub section_mask: u32,
}

impl Plan {
    pub fn initial(palette_name: &'static str, bpm: f32, samples_per_16th: f64) -> Self {
        Self {
            beat_index: 0,
            beat_time_samples: 0,
            samples_per_16th,
            phase: Phase::Pulse,
            dc: 0.0,
            palette_name,
            chord_root: 0,
            chord_is_major: false,
            key_root_semitone: 0,
            pad_voice_count: Phase::Pulse.pad_voices(),
            beats_in_chord: 0,
            bpm,
            section_mask: 0,
        }
    }
}

/// RT-safe shared handle to the latest `Plan`.
///
/// - Writer (Conductor thread): `store(new_plan)` — one allocation per beat
///   for the new `Arc<Plan>`, free'd when no reader still holds the prior.
/// - Readers (voice worker threads): `load()` returns a `Guard` that
///   derefs to `&Plan`; zero allocations on the hot path.
///
/// The audio thread never touches this — events flow via ring buffers.
#[derive(Clone)]
pub struct PlanPublisher {
    inner: Arc<ArcSwap<Plan>>,
}

impl PlanPublisher {
    pub fn new(initial: Plan) -> Self {
        Self {
            inner: Arc::new(ArcSwap::from_pointee(initial)),
        }
    }

    /// Publish a new plan. Called exactly once per beat from the Conductor
    /// thread. Previous `Arc<Plan>` is reclaimed once no reader holds it.
    pub fn publish(&self, plan: Plan) {
        self.inner.store(Arc::new(plan));
    }

    /// Load the latest plan. RT-safe (hazard-pointer-style). Returns a
    /// guard — `&*guard` is `&Plan`.
    pub fn load(&self) -> arc_swap::Guard<Arc<Plan>> {
        self.inner.load()
    }

    /// Convenience: clone the `Arc<Plan>` (bumps refcount). Used when a
    /// worker needs to keep a plan reference longer than the guard's
    /// lifetime (e.g. across a loop that reads many fields).
    pub fn snapshot(&self) -> Arc<Plan> {
        self.inner.load_full()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publish_then_load_returns_new() {
        let pub_ = PlanPublisher::new(Plan::initial("dark_techno", 130.0, 92.307_69));
        let p0 = pub_.snapshot();
        assert_eq!(p0.beat_index, 0);

        let mut next = (*p0).clone();
        next.beat_index = 42;
        next.phase = Phase::Storm;
        pub_.publish(next);

        let p1 = pub_.snapshot();
        assert_eq!(p1.beat_index, 42);
        assert_eq!(p1.phase, Phase::Storm);
    }

    #[test]
    fn load_is_rt_safe_pattern() {
        let pub_ = PlanPublisher::new(Plan::initial("dark_techno", 130.0, 92.307_69));
        // Simulate a worker reading the plan many times.
        for _ in 0..10_000 {
            let g = pub_.load();
            assert_eq!(g.palette_name, "dark_techno");
        }
    }
}
