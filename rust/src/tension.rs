//! TensionMap — port of `src/state.js:18–160` (SPEC_011).
//!
//! Generates a deterministic event list at run start from the song RNG.
//! Each event modifies the per-beat DC offset:
//!
//! - **plateau** — freeze DC at its entry value for `duration` beats, then
//!   ease back to the natural curve over `easeOut` beats.
//! - **spike** — additive bump in DC; ramps in over `easeIn`, holds, ramps
//!   out over `easeOut`.
//! - **retreat** — additive *negative* offset (DC drops temporarily); same
//!   ease-in / hold / ease-out shape.
//!
//! `getOffset(beat)` returns the live offset (or a freeze instruction) for
//! the given cycleBeat. Spike magnitudes are capped to ≤ 1 phase skip per
//! `_capSpike` so the curve never jumps two phases in one event.

use crate::config::tension as T;
use crate::palette::TensionParams;
use crate::rng::Mulberry32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventKind {
    Plateau,
    Spike,
    Retreat,
}

#[derive(Clone, Copy, Debug)]
pub struct TensionEvent {
    pub kind: EventKind,
    pub start_beat: u32,
    pub duration: u32,
    pub ease_in: u32,
    pub ease_out: u32,
    /// Spike: positive DC bump. Retreat: negative bump (signed).
    /// Plateau: 0 (frozen DC stamped at entry).
    pub magnitude: f64,
    /// Plateau-only: DC value at entry, captured the first time the event
    /// fires. Other event kinds leave this 0.
    frozen_dc: f64,
    frozen: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct TensionOutput {
    pub freeze: bool,
    pub frozen_dc: f64,
    pub freeze_lerp: f64, // 0 = full freeze, 1 = full release back to baseDC
    pub offset: f64,
}

pub struct TensionMap {
    events: Vec<TensionEvent>,
    params: TensionParams,
}

impl TensionMap {
    pub fn generate(rng: &mut Mulberry32, params: TensionParams) -> Self {
        let mut events = Vec::new();
        let mut beat = T::GRACE_BEATS;
        let mut last_event_end: u32 = 0;

        while beat < T::MAX_BEATS {
            // Window size pick.
            let win_span = (T::WINDOW_MAX - T::WINDOW_MIN + 1) as f64;
            let window_size = T::WINDOW_MIN + (rng.next_f64() * win_span) as u32;
            let mid_beat = beat + window_size / 2;

            // Density gate — `event_density` of windows trigger.
            if rng.next_f64() > params.event_density as f64 {
                beat += window_size;
                continue;
            }

            // Spacing gate — never spawn within `GAP_MIN` beats of last event.
            if mid_beat < last_event_end + T::GAP_MIN {
                beat += window_size;
                continue;
            }

            // Event-type roll.
            let roll = rng.next_f64();
            if roll < T::CUMUL_NONE {
                beat += window_size;
                continue;
            }
            let kind = if roll < T::CUMUL_PLATEAU {
                EventKind::Plateau
            } else if roll < T::CUMUL_SPIKE {
                EventKind::Spike
            } else {
                EventKind::Retreat
            };

            // Duration + easing.
            let (dur, ease_in, ease_out, magnitude) = match kind {
                EventKind::Plateau => {
                    let span = (T::PLATEAU_MAX - T::PLATEAU_MIN + 1) as f64;
                    let d = T::PLATEAU_MIN + (rng.next_f64() * span) as u32;
                    (d, 0, T::PLATEAU_EASE_OUT, 0.0)
                }
                EventKind::Spike => {
                    let span = (T::SPIKE_MAX - T::SPIKE_MIN + 1) as f64;
                    let d = T::SPIKE_MIN + (rng.next_f64() * span) as u32;
                    let mag = T::SPIKE_BASE_GAP * params.spike_height as f64;
                    (d, T::SPIKE_EASE_IN, T::SPIKE_EASE_OUT, mag)
                }
                EventKind::Retreat => {
                    let span = (T::RETREAT_MAX - T::RETREAT_MIN + 1) as f64;
                    let d = T::RETREAT_MIN + (rng.next_f64() * span) as u32;
                    // Magnitude depends on estimated DC at this beat.
                    let est_dc =
                        ((mid_beat as f64) / crate::config::DC_SCALE).powf(crate::config::DC_EXP);
                    let mag = -(params.retreat_depth as f64) * est_dc.max(0.1);
                    (d, T::RETREAT_EASE_IN, T::RETREAT_EASE_OUT, mag)
                }
            };

            events.push(TensionEvent {
                kind,
                start_beat: mid_beat,
                duration: dur,
                ease_in,
                ease_out,
                magnitude,
                frozen_dc: 0.0,
                frozen: false,
            });
            last_event_end = mid_beat + dur;
            beat += window_size;
        }

        Self { events, params }
    }

    /// Empty map — used in tests / when tension is disabled.
    pub fn empty() -> Self {
        Self {
            events: Vec::new(),
            params: TensionParams {
                event_density: 0.0,
                retreat_depth: 0.0,
                spike_height: 0.0,
                plateau_bias: 0.0,
            },
        }
    }

    pub fn event_count(&self) -> usize {
        self.events.len()
    }

    /// Per-beat lookup. `base_dc` is the natural-curve DC at this beat (used
    /// to stamp plateau freeze on first hit, and to drive ease-out blends).
    pub fn offset_for(&mut self, beat: u32, base_dc: f64) -> TensionOutput {
        for ev in self.events.iter_mut() {
            // Window spans [start_beat, start_beat + duration + ease_out).
            let total_span = ev.duration + ev.ease_out;
            if beat < ev.start_beat || beat >= ev.start_beat + total_span {
                continue;
            }
            let local = beat - ev.start_beat;

            match ev.kind {
                EventKind::Plateau => {
                    if !ev.frozen {
                        ev.frozen = true;
                        ev.frozen_dc = base_dc;
                    }
                    if local < ev.duration {
                        return TensionOutput {
                            freeze: true,
                            frozen_dc: ev.frozen_dc,
                            freeze_lerp: 0.0,
                            offset: 0.0,
                        };
                    }
                    // Ease-out: lerp factor 0→1 across ease_out beats.
                    let into_ease = (local - ev.duration) as f64;
                    let lerp = (into_ease / ev.ease_out.max(1) as f64).clamp(0.0, 1.0);
                    return TensionOutput {
                        freeze: true,
                        frozen_dc: ev.frozen_dc,
                        freeze_lerp: lerp,
                        offset: 0.0,
                    };
                }
                EventKind::Spike | EventKind::Retreat => {
                    // Triangular/trapezoidal envelope: ramp up over ease_in,
                    // hold over middle, ramp down over ease_out.
                    let t = local as f64;
                    let core = ev.duration as f64;
                    let env = if t < ev.ease_in as f64 {
                        t / ev.ease_in.max(1) as f64
                    } else if t > core - ev.ease_out as f64 {
                        let into_out = t - (core - ev.ease_out as f64);
                        (1.0 - into_out / ev.ease_out.max(1) as f64).clamp(0.0, 1.0)
                    } else {
                        1.0
                    };
                    let raw = ev.magnitude * env;
                    let capped = cap_spike(base_dc, raw);
                    return TensionOutput {
                        freeze: false,
                        frozen_dc: 0.0,
                        freeze_lerp: 0.0,
                        offset: capped,
                    };
                }
            }
        }
        TensionOutput {
            freeze: false,
            frozen_dc: 0.0,
            freeze_lerp: 0.0,
            offset: 0.0,
        }
    }

    pub fn params(&self) -> &TensionParams {
        &self.params
    }
}

/// JS `_capSpike` — never let an offset push DC across more than one phase
/// gap (`SPIKE_BASE_GAP = 0.30`).
fn cap_spike(base_dc: f64, offset: f64) -> f64 {
    let cap = T::SPIKE_BASE_GAP;
    if offset > cap {
        cap
    } else if offset < -cap {
        -cap
    } else {
        let _ = base_dc;
        offset
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::TensionParams;
    use crate::rng::Mulberry32;

    #[test]
    fn empty_map_is_silent() {
        let mut m = TensionMap::empty();
        let o = m.offset_for(50, 0.5);
        assert!(!o.freeze);
        assert_eq!(o.offset, 0.0);
    }

    #[test]
    fn dark_techno_generates_events() {
        let mut rng = Mulberry32::new(12345);
        let m = TensionMap::generate(
            &mut rng,
            TensionParams {
                event_density: 0.6,
                retreat_depth: 0.10,
                spike_height: 0.25,
                plateau_bias: 0.0,
            },
        );
        // Across 800 beats with 60% density and 32–64-beat windows we expect
        // a healthy handful of events.
        assert!(
            m.event_count() >= 3,
            "tension map produced too few events: {}",
            m.event_count()
        );
    }

    #[test]
    fn spike_is_capped() {
        // A nominal spike of 0.5 should not exceed phase-gap 0.30.
        let v = cap_spike(0.0, 0.5);
        assert!(v <= 0.30 + 1e-9);
    }
}
