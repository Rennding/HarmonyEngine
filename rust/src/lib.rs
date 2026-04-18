//! HarmonyEngine Rust Phase 1 — parity port for `dark_techno` palette.
//!
//! See /home/user/HarmonyEngine/specs/SPEC_057_RUST_MIGRATION.md §4 Phase 1.
//! JS reference lives in `../src/*.js`.

pub mod audio;
pub mod conductor;
pub mod config;
pub mod harmony;
pub mod palette;
pub mod rng;
pub mod sequencer;
pub mod synth;
pub mod voice_pool;
pub mod wavetables;

pub use conductor::Conductor;
pub use palette::Palette;
pub use rng::Mulberry32;
