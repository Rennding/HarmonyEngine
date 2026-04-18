//! Per-voice SPSC ring buffers — SPEC_057 §2 Shape B event transport.
//!
//! Each voice worker owns a `Producer<Event>`; the audio thread owns the
//! matching `Consumer<Event>`. The ring decouples composition from the
//! audio callback: workers push events ahead of their `time` (absolute
//! audio-thread sample index), and the audio thread drains everything due
//! up to `now + block_size` each callback.
//!
//! Capacity sizing for Phase 2b-1 (#81) — lookahead-capable rings:
//! the melody worker composes up to 4 bars (16 beats × 4 sub-steps = 64
//! events) ahead; drums compose 1 bar (4 beats × 4 sub-steps × 3 voices =
//! 48 events worst case for busy_16th). `RING_CAPACITY = 64` covers both
//! comfortably; `LOOKAHEAD_CAPACITY_BEATS = 4` documents the design
//! budget that #81 and the Phase 2b-1 diagnostic detectors rely on.
//! Bass / harmony / texture rings keep the same 64-slot capacity; they
//! stay beat-by-beat (lookahead budget 0) until #82 upgrades them to
//! match melody.
//!
//! All wrappers are thin aliases around `ringbuf::HeapRb`; the real-time
//! discipline lives in the push/pop call sites (workers push on their own
//! threads, audio thread pops in the callback — never the other way).

use ringbuf::{traits::Split, HeapCons, HeapProd, HeapRb};

use crate::voice_event::{HarmonyEvent, MelodyEvent, RhythmEvent, TextureEvent};

/// Capacity per ring. Event enum variants are `Copy` and small, so this is
/// a tight budget in bytes (≈64 × 32 B ≈ 2 KiB per ring).
pub const RING_CAPACITY: usize = 64;

/// Design lookahead budget per ring, in beats. Phase 2b-1 (#81): drums
/// compose up to 4 beats (1 bar) ahead, melody up to 16 beats (4 bars)
/// ahead; 4-beat capacity is the common floor every ring can satisfy.
/// Bass / harmony / texture rings currently don't populate lookahead
/// (budget 0) but share the same capacity so #82 can raise their budgets
/// without re-sizing buffers.
pub const LOOKAHEAD_CAPACITY_BEATS: u32 = 4;

/// Rhythm: kick/snare/hat events from the RhythmComposer worker.
pub struct RhythmRing {
    pub prod: HeapProd<RhythmEvent>,
    pub cons: HeapCons<RhythmEvent>,
}

impl RhythmRing {
    pub fn new() -> Self {
        let (prod, cons) = HeapRb::<RhythmEvent>::new(RING_CAPACITY).split();
        Self { prod, cons }
    }
}

impl Default for RhythmRing {
    fn default() -> Self {
        Self::new()
    }
}

/// Harmony: bass notes + chord stabs from HarmonyComposer.
pub struct HarmonyRing {
    pub prod: HeapProd<HarmonyEvent>,
    pub cons: HeapCons<HarmonyEvent>,
}

impl HarmonyRing {
    pub fn new() -> Self {
        let (prod, cons) = HeapRb::<HarmonyEvent>::new(RING_CAPACITY).split();
        Self { prod, cons }
    }
}

impl Default for HarmonyRing {
    fn default() -> Self {
        Self::new()
    }
}

/// Texture: pad retriggers from TextureComposer.
pub struct TextureRing {
    pub prod: HeapProd<TextureEvent>,
    pub cons: HeapCons<TextureEvent>,
}

impl TextureRing {
    pub fn new() -> Self {
        let (prod, cons) = HeapRb::<TextureEvent>::new(RING_CAPACITY).split();
        Self { prod, cons }
    }
}

impl Default for TextureRing {
    fn default() -> Self {
        Self::new()
    }
}

/// Melody: single-voice melody notes.
pub struct MelodyRing {
    pub prod: HeapProd<MelodyEvent>,
    pub cons: HeapCons<MelodyEvent>,
}

impl MelodyRing {
    pub fn new() -> Self {
        let (prod, cons) = HeapRb::<MelodyEvent>::new(RING_CAPACITY).split();
        Self { prod, cons }
    }
}

impl Default for MelodyRing {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice_event::{DrumHit, MelodyNote};
    use ringbuf::traits::{Consumer, Producer};

    #[test]
    fn rhythm_ring_round_trips_an_event() {
        let mut ring = RhythmRing::new();
        let hit = DrumHit {
            time: 1_024,
            plan_generation: 1,
            freq: 55.0,
            decay: 0.25,
            vel: 0.9,
        };
        assert!(ring.prod.try_push(RhythmEvent::Kick(hit)).is_ok());
        let popped = ring.cons.try_pop().expect("event should be present");
        assert_eq!(popped.time(), 1_024);
    }

    #[test]
    fn melody_ring_fills_then_drains() {
        let mut ring = MelodyRing::new();
        // Fill to capacity.
        for i in 0..RING_CAPACITY {
            let ok = ring
                .prod
                .try_push(MelodyEvent::Note(MelodyNote {
                    time: i as u64,
                    plan_generation: 1,
                    midi: 60,
                    phase_gain: 1.0,
                }))
                .is_ok();
            assert!(ok, "ring refused push at {i} below capacity");
        }
        // Overfilling returns Err.
        let overflow = ring.prod.try_push(MelodyEvent::Note(MelodyNote {
            time: 0,
            plan_generation: 1,
            midi: 0,
            phase_gain: 0.0,
        }));
        assert!(overflow.is_err(), "ring accepted push past capacity");

        // Drain everything.
        let mut drained = 0;
        while ring.cons.try_pop().is_some() {
            drained += 1;
        }
        assert_eq!(drained, RING_CAPACITY);
    }
}
