//! VoicingEngine — first Rust implementation of SPEC_040 §3/§5/§6.
//!
//! Sits between `HarmonyEngine` (chord symbols + progression) and the
//! `ChordTrack` / `PadTrack` synth front-ends. Given a chord symbol +
//! palette + phase + last melody note, returns the specific MIDI notes
//! to play — accounting for per-palette voicing style, phase-driven
//! extensions, register constraints, parsimonious voice leading, and
//! chord-melody collision avoidance.
//!
//! Status: feature-gated behind `config::flags::voicing_engine()`.
//! Default off → ChordTrack/PadTrack continue to call
//! `HarmonyEngine::voiced_chord_tones` and golden parity vs #81 holds.
//! When the flag is on, both consumers route through `VoicingEngine`
//! and the per-palette `voicing_profile()` table drives the realisation.
//!
//! What's intentionally NOT here yet: the §3.5 #11 / natural-11th rule
//! is encoded but only the noir_jazz path exercises it; the voice
//! leading uses a simple greedy "minimise total semitone movement"
//! pass (good enough for #82 acceptance — full Hungarian-style
//! global solver is a Phase 3 polish item if Aram QA flags it).

use crate::config::Phase;
use crate::palette::{CollisionMode, Palette, VoicingProfile, VoicingStyle};

/// Maximum voices a single chord can return. Matches `MAX_CHORD_TONES`
/// in `voice_event.rs` so `ChordStab.tones` can swallow the result
/// without truncation.
pub const MAX_VOICES: usize = 8;

/// Resolve an extension interval (7/9/11/13) to a semitone offset
/// from the chord root, depending on chord quality. Mirrors SPEC_040
/// §3.5. The natural-11th rule is enforced by the caller (§3.5 ¹) —
/// for major-quality chords reaching natural 11, the engine substitutes
/// #11 (18 st) automatically before returning.
fn extension_semitones(extension: u8, is_major: bool) -> i32 {
    match extension {
        7 => {
            if is_major {
                11 // major 7th
            } else {
                10 // minor 7th
            }
        }
        9 => 14,
        11 => {
            if is_major {
                18 // #11 — avoids clash with major 3rd (SPEC_040 §3.5 ¹)
            } else {
                17 // perfect 11th
            }
        }
        13 => 21,
        _ => 0,
    }
}

/// Look up the extension whitelist for a phase. Returns at most 4 (the
/// SPEC_040 §3.3 schema only ever lists 7/9/11/13).
fn extensions_for(profile: &VoicingProfile, phase: Phase) -> &'static [u8] {
    match phase {
        Phase::Pulse => profile.extensions_pulse,
        Phase::Swell => profile.extensions_swell,
        Phase::Surge => profile.extensions_surge,
        Phase::Storm => profile.extensions_storm,
        Phase::Maelstrom => profile.extensions_maelstrom,
    }
}

/// Build the raw voicing under the palette's style. Returns interval
/// offsets relative to the chord root in MIDI semitones (no octave
/// applied yet — caller adds chord-root + register).
///
/// The style enum is the §3.2 vocabulary; `extensions` is the
/// already-resolved set of semitone offsets (so `power` simply ignores
/// 3rds + extensions, `shell` keeps 3 + 7, etc.). The output is a
/// short stack-allocated array — the longest variant (drop2 with a
/// 13th = 5 voices) fits in 8.
fn build_style(
    style: VoicingStyle,
    is_major: bool,
    extensions: &[i32],
    phase: Phase,
) -> ([i32; MAX_VOICES], usize) {
    let third: i32 = if is_major { 4 } else { 3 };
    let mut buf = [0_i32; MAX_VOICES];
    let mut n: usize;

    match style {
        VoicingStyle::Power => {
            // Root + perfect 5th. No 3rd. Octave doubling appears at
            // Storm+ per SPEC_040 §3.6 step 3 (Power-specific rule —
            // independent of the palette's extension whitelist, which
            // is empty for Power palettes anyway).
            buf[0] = 0;
            buf[1] = 7;
            if matches!(phase, Phase::Storm | Phase::Maelstrom) {
                buf[2] = 12;
                n = 3;
            } else {
                n = 2;
            }
            let _ = extensions; // explicit: extensions ignored for power
        }
        VoicingStyle::Close => {
            // Root + 3rd + 5th, then any extensions stacked above
            // (within an octave-from-root window to stay "close").
            buf[0] = 0;
            buf[1] = third;
            buf[2] = 7;
            n = 3;
            for &ext in extensions {
                if n >= MAX_VOICES {
                    break;
                }
                buf[n] = ext;
                n += 1;
            }
        }
        VoicingStyle::Drop2 => {
            // Stack root + 3rd + 5th + extensions, then drop the
            // second-from-top by an octave. Classic jazz keyboard
            // voicing: smooth spread with rich top end.
            buf[0] = 0;
            buf[1] = third;
            buf[2] = 7;
            n = 3;
            for &ext in extensions {
                if n >= MAX_VOICES {
                    break;
                }
                buf[n] = ext;
                n += 1;
            }
            if n >= 3 {
                buf[n - 2] -= 12;
            }
        }
        VoicingStyle::Open => {
            // Root low; 3rd + 5th spread up an octave; extensions
            // higher still. Synthwave-style cinematic spread.
            buf[0] = 0;
            buf[1] = 12 + third;
            buf[2] = 12 + 7;
            n = 3;
            for (i, &ext) in extensions.iter().enumerate() {
                if n >= MAX_VOICES {
                    break;
                }
                // Stagger extensions by 12 above the spread to keep
                // them airy.
                buf[n] = ext + 12 * (i as i32);
                n += 1;
            }
        }
        VoicingStyle::Shell => {
            // Root + 3rd + 7th only (no 5th). Skeletal jazz. Always
            // include a 7th — even at Pulse/Swell when the extension
            // whitelist is empty — falling back to the natural seventh
            // derived from chord quality.
            buf[0] = 0;
            buf[1] = third;
            let seventh = if is_major { 11 } else { 10 };
            buf[2] = seventh;
            n = 3;
            for &ext in extensions {
                if ext == seventh {
                    continue; // already added
                }
                if n >= MAX_VOICES {
                    break;
                }
                buf[n] = ext;
                n += 1;
            }
        }
        VoicingStyle::Cluster => {
            // Pack notes within a minor 3rd at the register midpoint.
            // For ambient_dread we want quiet harmonic murk: root +
            // root+1 + root+3 (approx minor 3rd cluster).
            buf[0] = 0;
            buf[1] = 1;
            buf[2] = 3;
            n = 3;
        }
        VoicingStyle::Spread => {
            // Root low, skip an octave, place extensions high.
            // Suspended/airy character.
            buf[0] = 0;
            buf[1] = 12 + 7; // 5th, octave up
            n = 2;
            for (i, &ext) in extensions.iter().enumerate() {
                if n >= MAX_VOICES {
                    break;
                }
                buf[n] = 12 + ext + 12 * (i as i32);
                n += 1;
            }
        }
    }

    (buf, n)
}

/// Greedy parsimonious voice leading — for each output voice, prefer the
/// octave displacement (±12 / 0 / ∓12) that minimises total movement
/// from the previous voicing. Strength = blend factor: 0 means we don't
/// adjust at all, 1 means we always pick the closest octave.
///
/// Not the global Hungarian-style solver SPEC_040 §3.6 step 5 ideally
/// describes; for #82 acceptance the greedy pass is enough — common
/// tones are retained via the octave search and big leaps are damped.
fn voice_lead(
    voiced: &mut [i32],
    n: usize,
    prev: Option<&[i32]>,
    strength: f32,
) {
    let prev = match prev {
        Some(p) if !p.is_empty() && strength > 0.0 => p,
        _ => return,
    };
    for v in voiced.iter_mut().take(n) {
        let candidate_base = *v;
        // Find the prev voice with the smallest distance to this PC.
        let mut best_target = candidate_base;
        let mut best_dist = i32::MAX;
        for &p in prev {
            let p_pc = p.rem_euclid(12);
            // Try the candidate at three octaves around prev.
            for delta in [-12, 0, 12] {
                let cand = candidate_base + delta;
                let dist = (cand - p).abs() + if (cand.rem_euclid(12)) == p_pc { 0 } else { 2 };
                if dist < best_dist {
                    best_dist = dist;
                    best_target = cand;
                }
            }
        }
        // Blend by strength.
        if strength >= 1.0 {
            *v = best_target;
        } else if strength > 0.0 {
            // Move halfway, snapped to nearest semitone.
            let delta = best_target - candidate_base;
            let blended = candidate_base + ((delta as f32) * strength).round() as i32;
            *v = blended;
        }
    }
}

/// SPEC_040 §5 post-pass — break parallel perfect 5ths / 8ves between
/// the previous voicing and the just-computed one. The greedy voice-
/// lead in [`voice_lead`] is "parsimonious" but doesn't reason about
/// inter-voice intervals, so on chromatic step-wise root motion it can
/// produce uniform parallel motion. This pass scans every voice pair
/// (i, j); if both prev and next voicings form a P5/P8 between the
/// pair AND both voices move in the same direction, push voice j up
/// an octave to break the parallel. Falls back to -12 if +12 exceeds
/// the register ceiling.
fn break_parallel_motion(
    voiced: &mut [i32],
    n: usize,
    prev: &[i32],
    floor_midi: i32,
    ceiling_midi: i32,
) {
    if prev.len() < 2 || n < 2 {
        return;
    }
    let limit = prev.len().min(n);
    // Each voice can be displaced at most once per call. This prevents
    // the "+12 / -12 oscillation" where the upper voice ping-pongs and
    // the parallel reappears every other sweep.
    let mut moved = [false; MAX_VOICES];
    for i in 0..limit {
        for j in (i + 1)..limit {
            let prev_iv = (prev[j] - prev[i]).rem_euclid(12);
            let next_iv = (voiced[j] - voiced[i]).rem_euclid(12);
            let perfect_pair = (prev_iv == 7 && next_iv == 7)
                || (prev_iv == 0 && next_iv == 0);
            if !perfect_pair {
                continue;
            }
            if prev[i] == voiced[i] || prev[j] == voiced[j] {
                continue; // oblique motion — already not parallel
            }
            let dir_i = (voiced[i] - prev[i]).signum();
            let dir_j = (voiced[j] - prev[j]).signum();
            if dir_i != dir_j || dir_i == 0 {
                continue; // contrary motion — fine
            }
            // Parallel — try moving upper voice (j) by an octave; if it
            // can't legally move and hasn't been moved yet, try lower
            // voice (i). Skip voices already moved.
            let try_move = |idx: usize, voiced: &mut [i32], moved: &mut [bool; MAX_VOICES]| -> bool {
                if moved[idx] {
                    return false;
                }
                if voiced[idx] + 12 <= ceiling_midi {
                    voiced[idx] += 12;
                    moved[idx] = true;
                    true
                } else if voiced[idx] - 12 >= floor_midi {
                    voiced[idx] -= 12;
                    moved[idx] = true;
                    true
                } else {
                    false
                }
            };
            if !try_move(j, voiced, &mut moved) {
                try_move(i, voiced, &mut moved);
            }
        }
    }
}

/// Enforce register / critical-band rules per SPEC_040 §6.4.
///   octave 1–2: bass only — chord notes get pushed up to register_floor.
///   octave 3:   max `max_notes_oct3` notes — extras float up to oct 4.
///   floor/ceiling: clamp into the palette window.
fn enforce_register(notes: &mut [i32], n: usize, profile: &VoicingProfile) {
    let floor = profile.register_floor * 12;
    let ceiling = profile.register_ceiling * 12 + 11;
    let oct3_lo = 36; // C2 = 24, C3 = 36 → octave-3 band [36..48]
    let oct3_hi = 47;

    // Initial clamp.
    for v in notes.iter_mut().take(n) {
        while *v < floor {
            *v += 12;
        }
        while *v > ceiling {
            *v -= 12;
        }
    }

    // Critical-band enforcement on octave 3.
    let max_oct3 = profile.max_notes_oct3 as usize;
    let mut oct3_count = notes
        .iter()
        .take(n)
        .filter(|&&v| (oct3_lo..=oct3_hi).contains(&v))
        .count();
    if oct3_count > max_oct3 {
        // Bump the highest octave-3 entries up by 12 until we're under cap.
        for v in notes.iter_mut().take(n).rev() {
            if oct3_count <= max_oct3 {
                break;
            }
            if (oct3_lo..=oct3_hi).contains(v) {
                *v += 12;
                oct3_count -= 1;
            }
        }
    }
}

/// Apply collision-avoidance per SPEC_040 §6.2.
/// `avoid` mode: drop the chord voice that matches the melody pitch
/// class within the same octave. `split` mode: clamp every chord note
/// to ≤ MIDI 71 (B4). `none` mode: passthrough.
fn enforce_collision(
    notes: &mut [i32; MAX_VOICES],
    n: &mut usize,
    profile: &VoicingProfile,
    melody_midi: Option<i32>,
) {
    match profile.collision {
        CollisionMode::None => {}
        CollisionMode::Split => {
            for v in notes.iter_mut().take(*n) {
                while *v > 71 {
                    *v -= 12;
                }
            }
        }
        CollisionMode::Avoid => {
            let m = match melody_midi {
                Some(v) => v,
                None => return,
            };
            let target_pc = m.rem_euclid(12);
            let target_oct = (m / 12) - 1; // MIDI octave (C4 = 60 → octave 4)
            // Compact in-place: drop matching entries, keep order.
            let mut write = 0;
            for read in 0..*n {
                let v = notes[read];
                let pc = v.rem_euclid(12);
                let oct = (v / 12) - 1;
                if pc == target_pc && oct == target_oct {
                    continue; // skip
                }
                notes[write] = v;
                write += 1;
            }
            *n = write;
        }
    }
}

/// Result of a `voice()` call. Voices are absolute MIDI note numbers in
/// the order the synth should fire them. `count` ≤ MAX_VOICES.
#[derive(Clone, Copy, Debug)]
pub struct Voicing {
    pub notes: [i32; MAX_VOICES],
    pub count: usize,
}

impl Voicing {
    pub fn as_slice(&self) -> &[i32] {
        &self.notes[..self.count]
    }
}

/// Voice a chord through the palette's `voicing_profile`. The result is
/// the absolute MIDI note set for ChordTrack/PadTrack to fire. Pass the
/// previous voicing (when available) to engage parsimonious voice
/// leading; pass the melody's last MIDI note for collision avoidance.
pub fn voice(
    palette: &Palette,
    chord_root_pc: i32,
    is_major: bool,
    phase: Phase,
    octave: i32,
    melody_midi: Option<i32>,
    prev_voicing: Option<&[i32]>,
) -> Voicing {
    let profile = &palette.voicing;
    let exts: Vec<i32> = extensions_for(profile, phase)
        .iter()
        .map(|&e| extension_semitones(e, is_major))
        .collect();
    let (intervals, count) = build_style(profile.style, is_major, &exts, phase);

    // Convert to absolute MIDI: (octave+1)*12 + root + interval.
    let chord_root_abs = chord_root_pc.rem_euclid(12);
    let base_midi = (octave + 1) * 12 + chord_root_abs;
    let mut absolute = [0_i32; MAX_VOICES];
    for i in 0..count {
        absolute[i] = base_midi + intervals[i];
    }

    let mut n = count;
    voice_lead(&mut absolute, n, prev_voicing, profile.voice_lead_strength);
    enforce_register(&mut absolute, n, profile);
    if let Some(prev) = prev_voicing {
        let floor_midi = profile.register_floor * 12;
        let ceiling_midi = profile.register_ceiling * 12 + 11;
        break_parallel_motion(&mut absolute, n, prev, floor_midi, ceiling_midi);
    }
    enforce_collision(&mut absolute, &mut n, profile, melody_midi);

    Voicing {
        notes: absolute,
        count: n,
    }
}

/// Detect parallel perfect 5ths (or 8ves) between two consecutive
/// voicings — used by the voicing_rules test (#82 acceptance #7).
/// Returns true if any voice pair moves from a P5/P8 to another P5/P8
/// with the same pitch-class direction. Voicings are absolute MIDI.
pub fn has_parallel_fifths_or_octaves(prev: &[i32], next: &[i32]) -> bool {
    if prev.len() < 2 || next.len() < 2 {
        return false;
    }
    let limit = prev.len().min(next.len());
    for i in 0..limit {
        for j in (i + 1)..limit {
            let prev_iv = (prev[j] - prev[i]).rem_euclid(12);
            let next_iv = (next[j] - next[i]).rem_euclid(12);
            // 7 = P5, 0 = P8 (or unison) — both are "perfect" in voice
            // leading parlance.
            if (prev_iv == 7 && next_iv == 7) || (prev_iv == 0 && next_iv == 0) {
                // Confirm it's parallel: both voices moved (no oblique).
                if prev[i] != next[i] && prev[j] != next[j] {
                    let dir_i = (next[i] - prev[i]).signum();
                    let dir_j = (next[j] - prev[j]).signum();
                    if dir_i == dir_j && dir_i != 0 {
                        return true;
                    }
                }
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::{dark_techno, lo_fi_chill, noir_jazz};

    #[test]
    fn power_voicing_omits_third() {
        let pal = dark_techno();
        let v = voice(&pal, 0, false, Phase::Storm, 3, None, None);
        let pcs: Vec<i32> = v.as_slice().iter().map(|n| n.rem_euclid(12)).collect();
        assert!(pcs.contains(&0), "missing root");
        assert!(pcs.contains(&7), "missing 5th");
        assert!(!pcs.contains(&3), "power chord should not include minor 3rd");
        assert!(!pcs.contains(&4), "power chord should not include major 3rd");
    }

    #[test]
    fn drop2_jazz_voicing_includes_seventh_at_storm() {
        let pal = noir_jazz();
        let v = voice(&pal, 0, false, Phase::Storm, 4, None, None);
        let pcs: Vec<i32> = v.as_slice().iter().map(|n| n.rem_euclid(12)).collect();
        assert!(pcs.contains(&10), "noir_jazz Storm should include minor 7th (10)");
    }

    #[test]
    fn lo_fi_spread_includes_ninth_at_storm() {
        let pal = lo_fi_chill();
        let v = voice(&pal, 0, false, Phase::Storm, 4, None, None);
        let pcs: Vec<i32> = v.as_slice().iter().map(|n| n.rem_euclid(12)).collect();
        assert!(pcs.contains(&2), "lo_fi_chill Storm should include 9 (pc 2)");
    }

    #[test]
    fn collision_avoid_drops_doubled_pitch_class() {
        let pal = lo_fi_chill();
        // Suppose melody is on root pitch in same octave as chord root → drop it.
        let melody = (4 + 1) * 12; // C4 root
        let v = voice(&pal, 0, false, Phase::Storm, 4, Some(melody), None);
        let any_match = v
            .as_slice()
            .iter()
            .any(|&n| n.rem_euclid(12) == 0 && (n / 12) - 1 == 4);
        assert!(!any_match, "collision_mode=avoid should remove the doubled root at melody octave");
    }

    #[test]
    fn collision_split_caps_chord_at_b4() {
        let pal = dark_techno();
        // dark_techno = collision::Split; ensure all notes ≤ 71.
        let v = voice(&pal, 0, false, Phase::Storm, 4, None, None);
        for &n in v.as_slice() {
            assert!(n <= 71, "split mode should clamp chord notes ≤ B4 (got {n})");
        }
    }

    #[test]
    fn parallel_fifths_detector_flags_obvious_case() {
        // Two perfect 5ths moving up by a step in the same direction.
        let prev = [60, 67]; // C, G
        let next = [62, 69]; // D, A
        assert!(has_parallel_fifths_or_octaves(&prev, &next));
    }

    #[test]
    fn parallel_fifths_detector_passes_oblique_motion() {
        let prev = [60, 67]; // C, G
        let next = [60, 69]; // C, A — top voice moves, bottom doesn't
        assert!(!has_parallel_fifths_or_octaves(&prev, &next));
    }

    #[test]
    fn extension_minor_seventh_for_minor_chord() {
        // i (minor) + ext 7 → 10 semitones.
        assert_eq!(extension_semitones(7, false), 10);
        // I (major) + ext 7 → 11 semitones.
        assert_eq!(extension_semitones(7, true), 11);
    }

    #[test]
    fn natural_eleventh_substituted_with_sharp_eleven_on_major() {
        // Major 11 → 18 (#11). Minor 11 → 17 (perfect 11).
        assert_eq!(extension_semitones(11, true), 18);
        assert_eq!(extension_semitones(11, false), 17);
    }
}
