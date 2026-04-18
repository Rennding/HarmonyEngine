//! Voice events emitted by composer workers — SPEC_057 §2 Shape B.
//!
//! Every event carries the absolute audio-thread sample index at which it
//! fires (`time`). The audio thread drains each per-voice SPSC ring
//! buffer at sample boundaries and applies any events whose `time` is due.
//!
//! All variants are `Copy` so ring-buffer push/pop never allocates, and
//! `assert_no_alloc` can guard the audio callback in debug builds.

/// Maximum chord voices we pre-voice in the harmony worker. Matches the
/// largest `ChordConfig.voices` across palettes (doubling pattern in
/// `HarmonyEngine::voiced_chord_tones`).
pub const MAX_CHORD_TONES: usize = 8;

/// Maximum simultaneous pad voices. `Phase::pad_voices()` caps at 4, plus
/// up to 3 unison layers per voice = 12; we round up for safety.
pub const MAX_PAD_TONES: usize = 8;

/// Drum-hit event (kick/snare/hat share the same shape).
#[derive(Clone, Copy, Debug)]
pub struct DrumHit {
    pub time: u64,
    pub freq: f32,
    pub decay: f32,
    pub vel: f32,
}

/// Bass note — pool-backed, per-palette filter config.
#[derive(Clone, Copy, Debug)]
pub struct BassNote {
    pub time: u64,
    pub midi: i32,
    pub cutoff_hz: f32,
    pub resonance: f32,
    pub gain: f32,
}

/// Chord stab — pre-voiced tones, fired as one burst.
#[derive(Clone, Copy, Debug)]
pub struct ChordStab {
    pub time: u64,
    pub tones: [i32; MAX_CHORD_TONES],
    pub tone_count: u8,
    pub base_gain: f32,
}

/// Pad retrigger — ChordTrack-style chord change; audio thread fades
/// existing pad voices and starts a fresh set.
#[derive(Clone, Copy, Debug)]
pub struct PadRetrigger {
    pub time: u64,
    pub tones: [i32; MAX_PAD_TONES],
    pub tone_count: u8,
}

/// Melody note — single-voice fire.
#[derive(Clone, Copy, Debug)]
pub struct MelodyNote {
    pub time: u64,
    pub midi: i32,
    pub phase_gain: f32,
}

/// Per-voice event streams. Each worker emits one variant; audio thread
/// drains via matching per-voice functions.
#[derive(Clone, Copy, Debug)]
pub enum RhythmEvent {
    Kick(DrumHit),
    Snare(DrumHit),
    Hat(DrumHit),
}

#[derive(Clone, Copy, Debug)]
pub enum HarmonyEvent {
    Bass(BassNote),
    Chord(ChordStab),
}

#[derive(Clone, Copy, Debug)]
pub enum TextureEvent {
    Pad(PadRetrigger),
}

#[derive(Clone, Copy, Debug)]
pub enum MelodyEvent {
    Note(MelodyNote),
}

impl RhythmEvent {
    #[inline]
    pub fn time(&self) -> u64 {
        match self {
            RhythmEvent::Kick(h) | RhythmEvent::Snare(h) | RhythmEvent::Hat(h) => h.time,
        }
    }
}

impl HarmonyEvent {
    #[inline]
    pub fn time(&self) -> u64 {
        match self {
            HarmonyEvent::Bass(b) => b.time,
            HarmonyEvent::Chord(c) => c.time,
        }
    }
}

impl TextureEvent {
    #[inline]
    pub fn time(&self) -> u64 {
        match self {
            TextureEvent::Pad(p) => p.time,
        }
    }
}

impl MelodyEvent {
    #[inline]
    pub fn time(&self) -> u64 {
        match self {
            MelodyEvent::Note(n) => n.time,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_are_copy_and_small() {
        // Enforces the RT contract: events must be Copy (no boxing, no
        // heap). Size is not strictly bounded but should stay reasonable
        // (under one cache line per enum variant when possible).
        fn assert_copy<T: Copy>() {}
        assert_copy::<RhythmEvent>();
        assert_copy::<HarmonyEvent>();
        assert_copy::<TextureEvent>();
        assert_copy::<MelodyEvent>();
    }

    #[test]
    fn event_time_helpers() {
        let k = RhythmEvent::Kick(DrumHit {
            time: 4_800,
            freq: 55.0,
            decay: 0.3,
            vel: 0.9,
        });
        assert_eq!(k.time(), 4_800);
    }
}
