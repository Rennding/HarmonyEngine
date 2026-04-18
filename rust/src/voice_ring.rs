//! Per-voice SPSC ring buffers — SPEC_057 §2 Shape B event transport.
//!
//! Each voice worker owns a `Producer<Event>`; the audio thread owns the
//! matching `Consumer<Event>`. The ring decouples composition from the
//! audio callback: workers push events ahead of their `time` (absolute
//! audio-thread sample index), and the audio thread drains everything due
//! up to `now + block_size` each callback.
//!
//! Capacities are sized for the worst case: up to one event per 16th note
//! times a generous lookahead window (2 beats of 16ths = 8, × 4 voices of
//! worst-case ChordStab bursts = 32). 64 gives headroom for bursty runs
//! without re-allocation.
//!
//! All wrappers are thin aliases around `ringbuf::HeapRb`; the real-time
//! discipline lives in the push/pop call sites (workers push on their own
//! threads, audio thread pops in the callback — never the other way).

use ringbuf::{traits::Split, HeapCons, HeapProd, HeapRb};

use crate::voice_event::{HarmonyEvent, MelodyEvent, RhythmEvent, TextureEvent};

/// Capacity per ring. Event enum variants are `Copy` and small, so this is
/// a tight budget in bytes (≈64 × 32 B ≈ 2 KiB per ring).
pub const RING_CAPACITY: usize = 64;

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
                    midi: 60,
                    phase_gain: 1.0,
                }))
                .is_ok();
            assert!(ok, "ring refused push at {i} below capacity");
        }
        // Overfilling returns Err.
        let overflow = ring.prod.try_push(MelodyEvent::Note(MelodyNote {
            time: 0,
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
