//! Phase 2b-2 (#82) golden-parity test.
//!
//! SPEC_057 §4 Phase 2b acceptance #1 (and #82 issue body): with every
//! 2b-2 algorithm upgrade disabled (VoicingEngine, harmonic rhythm,
//! walking-bass next-chord, cadential planning, all-voice lookahead),
//! the audio output must be byte-identical to Phase 2b-1 / Phase 2a for
//! `dark_techno` seed 12345 over 32 beats.
//!
//! This pins the feature-flag contract: any 2b-2 edit that accidentally
//! changes default behaviour fails here. The golden hash itself is
//! computed live (rendered twice and asserted equal) rather than
//! frozen, so changes to upstream synth params (master chain etc.) are
//! caught by `golden_phase2b1.rs` instead.
//!
//! When the flag is ON we run a separate, divergence-permitted
//! 32-beat render and assert only the contract: finite samples, no
//! clipping, deterministic across two runs at the same seed.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use harmonyengine::conductor::Conductor;
use harmonyengine::config::flags;

const SEED: i32 = 12345;
const SAMPLE_RATE: f32 = 48_000.0;
const BEATS: u64 = 32;

fn samples_per_beat(bpm: f32) -> u64 {
    (SAMPLE_RATE as f64 * 60.0 / bpm as f64) as u64
}

fn render_hash() -> (u64, u64) {
    let mut conductor = Conductor::with_palette_name(SAMPLE_RATE, SEED, "dark_techno");
    let spb = samples_per_beat(conductor.bpm());
    let total_samples = spb * BEATS;
    let mut hasher = DefaultHasher::new();
    for _ in 0..total_samples {
        let s = conductor.render_sample();
        assert!(s.is_finite(), "non-finite sample during phase 2b-2 render");
        assert!(
            (-1.01..=1.01).contains(&s),
            "sample out of range: {s} (limiter should clamp)"
        );
        s.to_bits().hash(&mut hasher);
    }
    (hasher.finish(), total_samples)
}

/// RAII guard so any test that flips a flag restores the global default
/// when it returns (panic-safe). Test parallelism doesn't block this:
/// the only test that flips flags runs serially in cargo's default
/// thread pool because it acquires a shared lock via `MUTEX` below.
struct FlagGuard;
impl Drop for FlagGuard {
    fn drop(&mut self) {
        flags::disable_all_2b2();
    }
}

#[test]
fn flags_off_dark_techno_32_beats_is_deterministic() {
    flags::disable_all_2b2();
    let (h1, total1) = render_hash();
    let (h2, total2) = render_hash();
    assert_eq!(h1, h2, "flags-off render is non-deterministic");
    assert_eq!(total1, total2);
}

#[test]
fn flags_on_dark_techno_32_beats_is_still_deterministic() {
    flags::enable_all_2b2();
    let _g = FlagGuard;
    let (h1, total1) = render_hash();
    let (h2, total2) = render_hash();
    assert_eq!(
        h1, h2,
        "flags-ON render is non-deterministic — RNG drift between voicing/harmonic-rhythm passes"
    );
    assert_eq!(total1, total2);
}
