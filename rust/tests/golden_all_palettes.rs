//! Phase 2a-2 per-palette construction + determinism smoke test.
//!
//! For each of the 10 palettes (dark_techno, synthwave, glitch, ambient_dread,
//! lo_fi_chill, chiptune, noir_jazz, industrial, vaporwave, breakbeat) this:
//!   1. Constructs a Conductor with seed 12345 at 48 kHz.
//!   2. Renders 1 second of audio (48 000 samples).
//!   3. Checks samples are finite and within [-1.0, 1.0] (limiter output).
//!   4. Hashes the sample stream deterministically — a second run at the
//!      same seed must produce byte-identical bits (per SPEC_057 §4 AC#1).
//!
//! This is not a parity test against JS — full JS parity requires the Phase
//! 2b VoicingEngine + harmonic rhythm work. It is a regression guard so any
//! future refactor that disturbs palette construction or per-sample determinism
//! fails loudly in CI.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use harmonyengine::conductor::Conductor;
use harmonyengine::palette::{all_palettes, palette_by_name};

const SEED: i32 = 12345;
const SAMPLE_RATE: f32 = 48_000.0;
const NUM_SAMPLES: usize = 48_000; // 1 second

fn render_hash(palette_name: &str) -> u64 {
    let palette = palette_by_name(palette_name).expect("palette exists");
    let mut conductor = Conductor::with_palette(SAMPLE_RATE, SEED, palette);
    let mut hasher = DefaultHasher::new();
    for _ in 0..NUM_SAMPLES {
        let s = conductor.render_sample();
        assert!(s.is_finite(), "{palette_name}: non-finite sample");
        assert!(
            (-1.01..=1.01).contains(&s),
            "{palette_name}: sample out of range: {s}"
        );
        s.to_bits().hash(&mut hasher);
    }
    hasher.finish()
}

#[test]
fn all_ten_palettes_construct() {
    let names: Vec<&'static str> = all_palettes().iter().map(|p| p.name).collect();
    assert_eq!(
        names,
        vec![
            "dark_techno",
            "synthwave",
            "glitch",
            "ambient_dread",
            "lo_fi_chill",
            "chiptune",
            "noir_jazz",
            "industrial",
            "vaporwave",
            "breakbeat",
        ],
        "palette order must match JS PALETTES[0..9]"
    );
}

#[test]
fn all_palettes_render_finite_and_deterministic() {
    for palette in all_palettes() {
        let name = palette.name;
        let h1 = render_hash(name);
        let h2 = render_hash(name);
        assert_eq!(
            h1, h2,
            "{name}: non-deterministic render (same seed produced different bits)"
        );
    }
}

#[test]
fn palette_by_name_unknown_is_none() {
    assert!(palette_by_name("does_not_exist").is_none());
}

#[test]
fn palette_by_name_roundtrips_all_ten() {
    for palette in all_palettes() {
        let name = palette.name;
        let fetched = palette_by_name(name).expect("by_name returns Some");
        assert_eq!(fetched.name, name);
    }
}
