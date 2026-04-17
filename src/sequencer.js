// ========== SEQUENCER — DRUMS + BASS ==========

// ---- Euclidean rhythm generator ----
// Distributes `hits` hits across `steps` steps as evenly as possible.
// Bresenham-style: cheap integer math, accurate distribution.
// euclidean(4,8) → [1,0,1,0,1,0,1,0]  euclidean(5,8) → [1,0,1,0,1,1,0,1]
function euclidean(hits, steps) {
  if (hits <= 0) return new Array(steps).fill(0);
  if (hits >= steps) return new Array(steps).fill(1);
  var pattern = [];
  var prev = -1;
  for (var i = 0; i < steps; i++) {
    var curr = Math.floor(i * hits / steps);
    pattern.push(curr !== prev ? 1 : 0);
    prev = curr;
  }
  return pattern;
}

// ---- Pattern library ----
// All patterns: 16 steps at 16th-note resolution = 1 bar of 4/4
//   step 0,4,8,12  = quarter-note beats (downbeats)
//   step 2,6,10,14 = 8th-note offbeats
// Steps: { active: bool, vel: 0–1, pitchOffset?: semitones (bass only) }
function _buildPattern(name) {
  function fromBits(bits, vel) {
    vel = (vel !== undefined) ? vel : 1.0;
    return bits.map(function(b) { return b ? { active: true, vel: vel } : { active: false }; });
  }

  switch (name) {

    // ----- Drum patterns -----

    case 'four_on_floor':
      // Kick on every quarter note (steps 0,4,8,12). Ghosts on 2,6,10,13.
      return [
        { active: true,  vel: 0.9,  prob: 1.0  },  // 0: downbeat
        { active: false },
        { active: true,  vel: 0.3,  prob: 0.15 },  // 2: ghost kick
        { active: false },
        { active: true,  vel: 0.9,  prob: 1.0  },  // 4: downbeat
        { active: false },
        { active: true,  vel: 0.25, prob: 0.2  },  // 6: ghost kick
        { active: false },
        { active: true,  vel: 0.9,  prob: 1.0  },  // 8: downbeat
        { active: false },
        { active: true,  vel: 0.3,  prob: 0.1  },  // 10: ghost kick (rare)
        { active: false },
        { active: true,  vel: 0.9,  prob: 1.0  },  // 12: downbeat
        { active: true,  vel: 0.2,  prob: 0.25 },  // 13: pickup ghost
        { active: false },
        { active: false },
      ];

    case 'backbeat': {
      // Snare on beats 2 and 4 (steps 4 and 12). Ghost snare on 2, 6, 10, 14.
      return [
        { active: false },
        { active: false },
        { active: true,  vel: 0.2,  prob: 0.2  },  // 2: ghost snare
        { active: false },
        { active: true,  vel: 0.9,  prob: 1.0  },  // 4: beat 2 snare
        { active: false },
        { active: true,  vel: 0.15, prob: 0.15 },  // 6: ghost snare
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.2,  prob: 0.25 },  // 10: ghost snare
        { active: false },
        { active: true,  vel: 0.85, prob: 1.0  },  // 12: beat 4 snare
        { active: false },
        { active: true,  vel: 0.15, prob: 0.1  },  // 14: pickup ghost
        { active: false },
      ];
    }

    case 'offbeat_8th':
      // Hat on 8th-note offbeats (steps 2,6,10,14). Ghost 16th fills on 1,5,9,13.
      return [
        { active: false },
        { active: true,  vel: 0.2,  prob: 0.2  },  // 1: ghost 16th
        { active: true,  vel: 0.55, prob: 1.0  },  // 2: offbeat
        { active: false },
        { active: false },
        { active: true,  vel: 0.2,  prob: 0.15 },  // 5: ghost 16th
        { active: true,  vel: 0.55, prob: 1.0  },  // 6: offbeat
        { active: false },
        { active: false },
        { active: true,  vel: 0.2,  prob: 0.2  },  // 9: ghost 16th
        { active: true,  vel: 0.55, prob: 1.0  },  // 10: offbeat
        { active: false },
        { active: false },
        { active: true,  vel: 0.2,  prob: 0.15 },  // 13: ghost 16th
        { active: true,  vel: 0.55, prob: 1.0  },  // 14: offbeat
        { active: false },
      ];

    case 'straight_8th': {
      // Hat on every 8th note (steps 0,2,4,6,8,10,12,14), accent on downbeats.
      // Odd 16th steps are ghost fills — slightly probabilistic.
      return [
        { active: true,  vel: 0.7,  prob: 1.0  },  // 0: accented downbeat
        { active: true,  vel: 0.2,  prob: 0.25 },  // 1: ghost 16th
        { active: true,  vel: 0.5,  prob: 1.0  },  // 2: 8th
        { active: true,  vel: 0.2,  prob: 0.2  },  // 3: ghost 16th
        { active: true,  vel: 0.7,  prob: 1.0  },  // 4: accented downbeat
        { active: true,  vel: 0.2,  prob: 0.25 },  // 5: ghost 16th
        { active: true,  vel: 0.5,  prob: 1.0  },  // 6: 8th
        { active: true,  vel: 0.2,  prob: 0.2  },  // 7: ghost 16th
        { active: true,  vel: 0.7,  prob: 1.0  },  // 8: accented downbeat
        { active: true,  vel: 0.2,  prob: 0.25 },  // 9: ghost 16th
        { active: true,  vel: 0.5,  prob: 1.0  },  // 10: 8th
        { active: true,  vel: 0.2,  prob: 0.2  },  // 11: ghost 16th
        { active: true,  vel: 0.7,  prob: 1.0  },  // 12: accented downbeat
        { active: true,  vel: 0.2,  prob: 0.25 },  // 13: ghost 16th
        { active: true,  vel: 0.5,  prob: 1.0  },  // 14: 8th
        { active: true,  vel: 0.2,  prob: 0.2  },  // 15: ghost 16th
      ];
    }

    case 'euclidean_5_8': {
      // 5 hits in 8, looped to 16 steps. Active steps always fire (prob 1.0).
      var e5 = euclidean(5, 8);
      var bits5 = [];
      for (var i5 = 0; i5 < 16; i5++) bits5.push(e5[i5 % 8]);
      return bits5.map(function(b) {
        return b ? { active: true, vel: 0.65, prob: 1.0 } : { active: false };
      });
    }

    case 'euclidean_3_8': {
      // 3 hits in 8, looped to 16 steps. Active steps always fire (prob 1.0).
      var e3 = euclidean(3, 8);
      var bits3 = [];
      for (var i3 = 0; i3 < 16; i3++) bits3.push(e3[i3 % 8]);
      return bits3.map(function(b) {
        return b ? { active: true, vel: 0.6, prob: 1.0 } : { active: false };
      });
    }

    // ----- Glitch drum patterns -----

    case 'glitch_kick': {
      // Irregular, stuttered kick. Main hits prob 1.0, secondary prob 0.6 for variation.
      return [
        { active: true,  vel: 0.85, prob: 1.0 },   // 0
        { active: true,  vel: 0.6,  prob: 0.6 },   // 1: secondary
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.85, prob: 1.0 },   // 6
        { active: false },
        { active: true,  vel: 0.85, prob: 1.0 },   // 8
        { active: false },
        { active: false },
        { active: true,  vel: 0.7,  prob: 0.7 },   // 11: accent variation
        { active: false },
        { active: false },
        { active: false },
        { active: false },
      ];
    }

    case 'glitch_snare': {
      // Off-grid snare hits. Main hits prob 1.0, ornaments probabilistic.
      return [
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.9,  prob: 1.0  },  // 3: main
        { active: false },
        { active: true,  vel: 0.7,  prob: 0.7  },  // 5: secondary
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.5,  prob: 1.0  },  // 10: main
        { active: false },
        { active: true,  vel: 0.7,  prob: 1.0  },  // 12: main
        { active: false },
        { active: false },
        { active: true,  vel: 0.6,  prob: 0.5  },  // 15: variation
      ];
    }

    case 'glitch_hat': {
      // Rapid 16th hats with random gaps. Low-vel steps are probabilistic ghosts.
      return [
        { active: true,  vel: 0.45, prob: 1.0  },  // 0
        { active: true,  vel: 0.3,  prob: 0.7  },  // 1: ghost
        { active: true,  vel: 0.45, prob: 1.0  },  // 2
        { active: false },
        { active: true,  vel: 0.45, prob: 1.0  },  // 4
        { active: false },
        { active: true,  vel: 0.45, prob: 1.0  },  // 6
        { active: true,  vel: 0.3,  prob: 0.6  },  // 7: ghost
        { active: false },
        { active: true,  vel: 0.45, prob: 1.0  },  // 9
        { active: true,  vel: 0.3,  prob: 0.7  },  // 10: ghost
        { active: false },
        { active: true,  vel: 0.45, prob: 1.0  },  // 12
        { active: true,  vel: 0.3,  prob: 0.6  },  // 13: ghost
        { active: false },
        { active: true,  vel: 0.45, prob: 0.8  },  // 15: variation
      ];
    }

    case 'euclidean_7_16':
      // 7 hits in 16 — complex polyrhythmic feel. All hits prob 1.0.
      return euclidean(7, 16).map(function(b) {
        return b ? { active: true, vel: 0.65, prob: 1.0 } : { active: false };
      });

    // ----- Ambient dread drum patterns -----

    case 'sparse_kick': {
      // One kick per bar, on the one — vast space. Rare ghost on beat 3.
      return [
        { active: true,  vel: 0.7,  prob: 1.0  },  // 0: the one
        { active: false }, { active: false }, { active: false },
        { active: false }, { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.3,  prob: 0.15 },  // 8: rare ghost kick
        { active: false }, { active: false }, { active: false },
        { active: false }, { active: false }, { active: false }, { active: false },
      ];
    }

    case 'ghost_snare': {
      // Single ghost snare on beat 3. Occasional beat-4 echo.
      return [
        { active: false }, { active: false }, { active: false }, { active: false },
        { active: false }, { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.4,  prob: 1.0  },  // 8: beat 3 ghost snare
        { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.2,  prob: 0.2  },  // 12: rare echo
        { active: false }, { active: false }, { active: false },
      ];
    }

    case 'slow_hat': {
      // Quarter-note hats, very quiet — ticking clock. Occasional 8th-note fill.
      return [
        { active: true,  vel: 0.25, prob: 1.0  },  // 0
        { active: false },
        { active: true,  vel: 0.15, prob: 0.15 },  // 2: rare 8th fill
        { active: false },
        { active: true,  vel: 0.25, prob: 1.0  },  // 4
        { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.25, prob: 1.0  },  // 8
        { active: false },
        { active: true,  vel: 0.15, prob: 0.1  },  // 10: rare 8th fill
        { active: false },
        { active: true,  vel: 0.25, prob: 1.0  },  // 12
        { active: false }, { active: false }, { active: false },
      ];
    }

    // ----- Glitch/ambient bass patterns -----

    case 'stutter_bass':
      // 16th-note stutter on root, then silence
      return [
        { active: true,  vel: 0.9,  pitchOffset: 0 },
        { active: true,  vel: 0.5,  pitchOffset: 0 },
        { active: false }, { active: false },
        { active: false }, { active: false },
        { active: true,  vel: 0.7,  pitchOffset: 7 },
        { active: false },
        { active: true,  vel: 0.8,  pitchOffset: 0 },
        { active: false }, { active: false }, { active: false },
        { active: false }, { active: false }, { active: false }, { active: false },
      ];

    case 'drone_root':
      // Single sustained root per bar — pad-like bass
      return [
        { active: true, vel: 0.6, pitchOffset: 0 },
        { active: false }, { active: false }, { active: false },
        { active: false }, { active: false }, { active: false }, { active: false },
        { active: false }, { active: false }, { active: false }, { active: false },
        { active: false }, { active: false }, { active: false }, { active: false },
      ];

    // ----- Bass patterns -----
    // pitchOffset = semitones from chord root (0=root, 7=fifth, 5=fourth, 12=octave)

    case 'root_pump':
      // Root note on every beat, tight palm-muted feel
      return [
        { active: true,  vel: 0.9,  pitchOffset: 0 },
        { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.85, pitchOffset: 0 },
        { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.9,  pitchOffset: 0 },
        { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.85, pitchOffset: 0 },
        { active: false }, { active: false }, { active: false },
      ];

    case 'octave_bounce':
      // Root → octave ghost → root → octave ghost (syncopated feel)
      return [
        { active: true,  vel: 0.9,  pitchOffset: 0  },  // beat 1 root
        { active: false }, { active: false },
        { active: true,  vel: 0.65, pitchOffset: 12 },  // octave anticipation
        { active: true,  vel: 0.85, pitchOffset: 0  },  // beat 2 root
        { active: false }, { active: false },
        { active: true,  vel: 0.65, pitchOffset: 12 },  // octave anticipation
        { active: true,  vel: 0.9,  pitchOffset: 0  },  // beat 3 root
        { active: false }, { active: false },
        { active: true,  vel: 0.65, pitchOffset: 12 },  // octave anticipation
        { active: true,  vel: 0.85, pitchOffset: 0  },  // beat 4 root
        { active: false }, { active: false }, { active: false },
      ];

    case 'fifth_walk':
      // Root → fifth → root → fourth (classic bass walk)
      return [
        { active: true,  vel: 0.9,  pitchOffset: 0 },   // beat 1: root
        { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.85, pitchOffset: 7 },   // beat 2: fifth
        { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.9,  pitchOffset: 0 },   // beat 3: root
        { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.85, pitchOffset: 5 },   // beat 4: fourth
        { active: false }, { active: false }, { active: false },
      ];

    // ----- Lo-fi_chill drum patterns (SPEC_019 §1.1) -----

    case 'lo_fi_kick': {
      // Boom-bap: kick on 1 and "and" of 2 (step 5). Rare ghost on beat 3.
      return [
        { active: true,  vel: 0.85, prob: 1.0  },  // 0: downbeat boom
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.75, prob: 1.0  },  // 5: "and" of 2 — signature boom-bap
        { active: false },
        { active: false },
        { active: true,  vel: 0.3,  prob: 0.2  },  // 8: rare ghost kick on beat 3
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
      ];
    }

    case 'lo_fi_snare': {
      // Snare on 2 and 4, ghost on "e" of 3 (step 9). Brushy, quiet.
      return [
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.7,  prob: 1.0  },  // 4: beat 2 snare
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.25, prob: 0.35 },  // 9: "e" of 3 ghost — lazy feel
        { active: false },
        { active: false },
        { active: true,  vel: 0.65, prob: 1.0  },  // 12: beat 4 snare
        { active: false },
        { active: false },
        { active: false },
      ];
    }

    case 'lo_fi_hat': {
      // Offbeat 8ths, alternating velocity (0.4/0.25) for lazy swing.
      return [
        { active: false },
        { active: false },
        { active: true,  vel: 0.4,  prob: 1.0  },  // 2: offbeat high
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.25, prob: 1.0  },  // 6: offbeat low
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.4,  prob: 1.0  },  // 10: offbeat high
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.25, prob: 1.0  },  // 14: offbeat low
        { active: false },
      ];
    }

    // ----- Chiptune drum patterns (SPEC_019 §1.3) -----

    case 'chiptune_snare': {
      // Short noise burst on 2 and 4. No ghosts — clean 8-bit snap.
      return [
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.85, prob: 1.0  },  // 4: beat 2 snap
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.85, prob: 1.0  },  // 12: beat 4 snap
        { active: false },
        { active: false },
        { active: false },
      ];
    }

    // ----- noir_jazz drum patterns (SPEC_019 §1.4) -----

    case 'jazz_kick': {
      // Sparse, supportive — kick on 1 and "and" of 3 only. Brush-like, soft.
      return [
        { active: true,  vel: 0.55, prob: 1.0  },  // 0: downbeat — soft
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.45, prob: 0.85 },  // 10: "and" of 3 — even softer, not always
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
      ];
    }

    case 'jazz_snare': {
      // Ghost notes everywhere, accent on 2 and 4, brush sweep on "and" of 1.
      return [
        { active: true,  vel: 0.15, prob: 0.30 },  // 0: rare ghost tap
        { active: false },
        { active: true,  vel: 0.25, prob: 0.50 },  // 2: "and" of 1 — brush sweep
        { active: false },
        { active: true,  vel: 0.65, prob: 1.0  },  // 4: beat 2 accent
        { active: true,  vel: 0.12, prob: 0.25 },  // 5: ghost
        { active: true,  vel: 0.15, prob: 0.30 },  // 6: ghost
        { active: false },
        { active: true,  vel: 0.12, prob: 0.20 },  // 8: ghost on beat 3
        { active: true,  vel: 0.10, prob: 0.15 },  // 9: ghost
        { active: true,  vel: 0.18, prob: 0.35 },  // 10: ghost
        { active: false },
        { active: true,  vel: 0.65, prob: 1.0  },  // 12: beat 4 accent
        { active: true,  vel: 0.12, prob: 0.20 },  // 13: ghost
        { active: true,  vel: 0.15, prob: 0.30 },  // 14: ghost
        { active: true,  vel: 0.10, prob: 0.15 },  // 15: ghost tail
      ];
    }

    case 'jazz_ride': {
      // Classic swing ride: 1, "and" of 2, 3, "and" of 4. Ride cymbal feel.
      return [
        { active: true,  vel: 0.60, prob: 1.0  },  // 0: beat 1 — bell accent
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.50, prob: 1.0  },  // 6: "and" of 2 — swing push
        { active: false },
        { active: true,  vel: 0.55, prob: 1.0  },  // 8: beat 3
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.45, prob: 1.0  },  // 14: "and" of 4 — swing push
        { active: false },
      ];
    }

    case 'jazz_walk': {
      // Walking bass: quarter notes, stepwise, chromatic approach on beat 4.
      // pitchOffset used by WalkingBass engine for note selection.
      return [
        { active: true,  vel: 0.80, pitchOffset: 0 },  // beat 1: root
        { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.70, pitchOffset: 3 },  // beat 2: minor third
        { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.75, pitchOffset: 5 },  // beat 3: fourth
        { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.70, pitchOffset: 7 },  // beat 4: fifth (approach)
        { active: false }, { active: false }, { active: false },
      ];
    }

    // ----- industrial drum patterns (SPEC_019 §1.2) -----

    case 'industrial_kick': {
      // Distorted 4/4 with double-kick on beat 3. Mechanical, aggressive.
      return [
        { active: true,  vel: 0.95, prob: 1.0  },  // 0: beat 1 — hard
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.90, prob: 1.0  },  // 4: beat 2 — hard
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.95, prob: 1.0  },  // 8: beat 3 — first hit
        { active: true,  vel: 0.80, prob: 1.0  },  // 9: beat 3 double — signature
        { active: false },
        { active: false },
        { active: true,  vel: 0.90, prob: 1.0  },  // 12: beat 4 — hard
        { active: false },
        { active: false },
        { active: false },
      ];
    }

    case 'industrial_snare': {
      // Accented on 2 and 4, flanged ghost on "and" of 4. Heavy, clang-like.
      return [
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.90, prob: 1.0  },  // 4: beat 2 — heavy accent
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.90, prob: 1.0  },  // 12: beat 4 — heavy accent
        { active: false },
        { active: true,  vel: 0.40, prob: 0.60 },  // 14: "and" of 4 — flanged ghost
        { active: false },
      ];
    }

    case 'industrial_hat': {
      // 16th notes, mechanical, uniform velocity — typewriter feel.
      return [
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
        { active: true,  vel: 0.35, prob: 1.0  },
      ];
    }

    // ----- vaporwave drum patterns (SPEC_019 §1.5) -----

    case 'vaporwave_kick': {
      // Half-time feel — kick on 1 and 3, laid-back. Long decay, boomy.
      return [
        { active: true,  vel: 0.65, prob: 1.0  },  // 0: beat 1 — soft boom
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.55, prob: 0.90 },  // 8: beat 3 — softer
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
      ];
    }

    // ----- breakbeat drum patterns (SPEC_019 §1.6) -----

    case 'break_kick': {
      // Syncopated, jungle-adjacent. Off-grid hits define the groove.
      return [
        { active: true,  vel: 0.90, prob: 1.0  },  // 0: downbeat
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.75, prob: 1.0  },  // 6: "and" of 2 — syncopated
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.80, prob: 1.0  },  // 12: beat 4
        { active: false },
        { active: false },
        { active: true,  vel: 0.70, prob: 0.85 },  // 15: pickup to next bar
      ];
    }

    case 'break_snare': {
      // Amen-adjacent: reversed emphasis, snare off the expected beats.
      return [
        { active: false },
        { active: false },
        { active: false },
        { active: false },
        { active: true,  vel: 0.85, prob: 1.0  },  // 4: beat 2 — accent
        { active: false },
        { active: false },
        { active: true,  vel: 0.65, prob: 0.80 },  // 7: "and" of 2+ — ghost
        { active: false },
        { active: false },
        { active: true,  vel: 0.70, prob: 0.90 },  // 10: "and" of 3 — syncopated
        { active: false },
        { active: true,  vel: 0.85, prob: 1.0  },  // 12: beat 4 — accent
        { active: false },
        { active: false },
        { active: false },
      ];
    }

    case 'break_hat': {
      // Fast chopping — rapid alternation with varied velocity.
      return [
        { active: true,  vel: 0.55, prob: 1.0  },
        { active: true,  vel: 0.40, prob: 1.0  },
        { active: false },
        { active: true,  vel: 0.45, prob: 1.0  },
        { active: true,  vel: 0.55, prob: 1.0  },
        { active: false },
        { active: true,  vel: 0.45, prob: 1.0  },
        { active: true,  vel: 0.40, prob: 1.0  },
        { active: true,  vel: 0.55, prob: 1.0  },
        { active: true,  vel: 0.40, prob: 1.0  },
        { active: false },
        { active: true,  vel: 0.45, prob: 1.0  },
        { active: true,  vel: 0.55, prob: 1.0  },
        { active: false },
        { active: true,  vel: 0.45, prob: 1.0  },
        { active: false },
      ];
    }

    // ===== FILL PATTERNS (SPEC_018 §2) =====
    // Used by FillSystem — replace normal drum pattern for 1 bar.
    // Steps: { active, vel } — prob not used in fills (always fire).

    // --- Kick fills ---
    case 'fill_kick_build':
      // Accelerating kicks into downbeat (tension builder)
      return fromBits([0,0,0,0, 0,0,0,0, 1,0,1,0, 1,1,1,1], 0.85);

    case 'fill_kick_drop':
      // Kick disappears for 1 bar — tension via absence
      return fromBits([0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 0.0);

    case 'fill_kick_synco':
      // Syncopated off-grid kicks
      return fromBits([1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,1,0], 0.8);

    case 'fill_kick_double':
      // Double-time kicks — pumping energy
      return fromBits([1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1], 0.8);

    // --- Snare fills ---
    case 'fill_snare_roll':
      // Classic 16th-note roll building into downbeat
      return fromBits([0,0,0,0, 0,0,0,0, 1,0,1,0, 1,1,1,1], 0.8);

    case 'fill_snare_flam':
      // Flam hits — double-hit feel via velocity contrast
      return [
        { active: false }, { active: false }, { active: false }, { active: false },
        { active: true,  vel: 0.9  },  // 4
        { active: false }, { active: false }, { active: false },
        { active: false }, { active: false },
        { active: true,  vel: 0.9  },  // 10
        { active: false },
        { active: true,  vel: 0.6  },  // 12: anticipation
        { active: true,  vel: 0.9  },  // 13: main
        { active: true,  vel: 0.9  },  // 14
        { active: true,  vel: 0.65 },  // 15: tail
      ];

    case 'fill_snare_shift':
      // Accent shift: beat-3 snare only — creates rhythmic surprise
      return fromBits([0,0,0,0, 0,0,0,0, 1,0,0,0, 1,0,0,0], 0.85);

    case 'fill_snare_mini':
      // Mini fill: last 4 steps only — subtle, every 16 beats
      return fromBits([0,0,0,0, 0,0,0,0, 0,0,0,0, 1,1,1,1], 0.75);

    // --- Hat fills ---
    case 'fill_hat_open_close':
      // Alternating open (high vel) / closed (low vel) pattern
      return [
        { active: true, vel: 0.7 }, { active: false }, { active: true, vel: 0.4 }, { active: false },
        { active: true, vel: 0.7 }, { active: false }, { active: true, vel: 0.4 }, { active: false },
        { active: true, vel: 0.7 }, { active: false }, { active: true, vel: 0.4 }, { active: false },
        { active: true, vel: 0.7 }, { active: false }, { active: true, vel: 0.4 }, { active: false },
      ];

    case 'fill_hat_roll':
      // Rapid 16th-note hat roll, all quiet
      return fromBits([1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], 0.3);

    case 'fill_hat_drop':
      // Hat silence — creates space for kick/snare
      return fromBits([0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], 0.0);

    case 'fill_hat_mini':
      // Mini hat fill: last 4 steps only
      return fromBits([0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,1,1], 0.55);

    default:
      // Fallback: root on every beat
      return fromBits([1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0]);
  }
}

// ---- Shared noise buffer ----
// Created once per AudioContext, reused by all noise sources (cheap BufferSource).
var _noiseBuffer = null;

function _getNoiseBuffer() {
  if (!_noiseBuffer && audioCtx) {
    var len = Math.floor(audioCtx.sampleRate * 0.5);
    _noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    var d = _noiseBuffer.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return _noiseBuffer;
}

// ---- Active palette name (set in Sequencer.initRun, used by synth fns for wavetable lookup) ----
var _activePaletteName = null;
var _activePalette = null;      // full palette object (SPEC_028: gainScalar, phaseFilter)

// ---- FM pair helper (SPEC_016) ----
// Creates a modulator→carrier pair.  Carrier output goes to the provided destination.
// Returns { carrier, modulator, modGain } for external scheduling.
function _createFMPair(carrierFreq, modRatio, modDepth, dest, t) {
  if (!audioCtx) return null;
  var carrier  = audioCtx.createOscillator();
  var mod      = audioCtx.createOscillator();
  var modGain  = audioCtx.createGain();
  var outGain  = audioCtx.createGain();

  mod.frequency.value = carrierFreq * modRatio;
  modGain.gain.value  = modDepth;

  mod.connect(modGain);
  modGain.connect(carrier.frequency);  // FM: mod → carrier freq
  carrier.connect(outGain);
  outGain.connect(dest);

  return { carrier: carrier, modulator: mod, modGain: modGain, outGain: outGain };
}

// ---- Drum synthesis ----

// --- Sidechain duck gain node (inserted between submixGain and _compressor/hpFilter) ---
// Created in initAudio patch; _synthKick triggers pump envelope on it.
var _sidechainGain = null;
var _sidechainAmount = 0.6; // default; overridden per palette in Sequencer.initRun

function _initSidechain() {
  if (!audioCtx || _sidechainGain) return;
  _sidechainGain = audioCtx.createGain();
  _sidechainGain.gain.value = 1.0;
}

function _pumpSidechain(t, amount) {
  if (!_sidechainGain) return;
  var duck = 1 - (amount || _sidechainAmount);
  _sidechainGain.gain.cancelScheduledValues(t);
  _sidechainGain.gain.setValueAtTime(1.0, t);
  _sidechainGain.gain.linearRampToValueAtTime(duck, t + 0.01);  // 10ms attack
  _sidechainGain.gain.linearRampToValueAtTime(1.0, t + 0.16);   // 150ms release
}

function _synthKick(t, vel, cfg) {
  if (!audioCtx) return;
  var dest = (typeof _trackGains !== 'undefined' && _trackGains.kick) ? _trackGains.kick : submixGain;
  if (!dest) return;
  var osc  = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(dest);

  // Use wavetable if available, otherwise fallback to sine
  var wt = (typeof Wavetables !== 'undefined' && _activePaletteName)
    ? Wavetables.get(_activePaletteName, 'kick') : null;
  if (wt) {
    osc.setPeriodicWave(wt);
  } else {
    osc.type = 'sine';
  }

  // Pitch envelope: punch at 2× freq, drop to sub
  osc.frequency.setValueAtTime(cfg.freq * 2.2, t);
  osc.frequency.exponentialRampToValueAtTime(cfg.freq * 0.65, t + cfg.decay);
  gain.gain.setValueAtTime(vel * CFG.GAIN.kick, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + cfg.decay + 0.05);
  osc.start(t);
  osc.stop(t + cfg.decay + 0.06);

  // Layer kick click transient — route to mixBus (bypasses kick LP200 EQ to preserve HF attack)
  var transientDest = (typeof _mixBus !== 'undefined' && _mixBus) ? _mixBus : dest;
  if (typeof _playTransient === 'function') _playTransient('kick_click', transientDest, t, vel * 0.4);

  // Trigger per-track sidechain pumps (SPEC_016 §5)
  if (typeof _pumpTrackSidechains === 'function') _pumpTrackSidechains(t);
  // Legacy global pump (backward compat)
  _pumpSidechain(t, _sidechainAmount);
}

function _synthSnare(t, vel, cfg) {
  if (!audioCtx) return;
  var dest = (typeof _trackGains !== 'undefined' && _trackGains.snare) ? _trackGains.snare : submixGain;
  if (!dest) return;
  var nb = _getNoiseBuffer();
  if (!nb) return;

  // Noise body: bandpass around snare freq
  var nSrc  = audioCtx.createBufferSource();
  nSrc.buffer = nb;
  var bp    = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = cfg.freq * 3;
  bp.Q.value = 1.2;
  var nGain = audioCtx.createGain();
  nSrc.connect(bp); bp.connect(nGain); nGain.connect(dest);
  nGain.gain.setValueAtTime(vel * CFG.GAIN.snare_noise, t);
  nGain.gain.exponentialRampToValueAtTime(0.0001, t + cfg.decay);
  nSrc.start(t); nSrc.stop(t + cfg.decay + 0.01);

  // Tonal snap — wavetable for palette-specific harmonic character
  var osc   = audioCtx.createOscillator();
  var oGain = audioCtx.createGain();
  osc.connect(oGain); oGain.connect(dest);
  var wt = (typeof Wavetables !== 'undefined' && _activePaletteName)
    ? Wavetables.get(_activePaletteName, 'snare') : null;
  if (wt) {
    osc.setPeriodicWave(wt);
  } else {
    osc.type = 'triangle';
  }
  osc.frequency.value = cfg.freq;
  oGain.gain.setValueAtTime(vel * CFG.GAIN.snare_tonal, t);
  oGain.gain.exponentialRampToValueAtTime(0.0001, t + cfg.decay * 0.4);
  osc.start(t); osc.stop(t + cfg.decay * 0.4 + 0.01);

  // Layer snare rattle transient (SPEC_016 §6)
  if (typeof _playTransient === 'function') _playTransient('snare_rattle', dest, t, vel * 0.35);
}

function _synthHat(t, vel, cfg) {
  if (!audioCtx) return;
  var dest = (typeof _trackGains !== 'undefined' && _trackGains.hat) ? _trackGains.hat : submixGain;
  if (!dest) return;
  var nb = _getNoiseBuffer();
  if (!nb) return;

  // Noise layer (primary hat body)
  var src  = audioCtx.createBufferSource();
  src.buffer = nb;
  var hp   = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = cfg.freq;
  var gain = audioCtx.createGain();
  src.connect(hp); hp.connect(gain); gain.connect(dest);
  gain.gain.setValueAtTime(vel * CFG.GAIN.hat, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + cfg.decay);
  src.start(t); src.stop(t + cfg.decay + 0.005);

  // Tonal shimmer layer — wavetable gives palette-specific metallic character
  var wt = (typeof Wavetables !== 'undefined' && _activePaletteName)
    ? Wavetables.get(_activePaletteName, 'perc') : null;
  if (wt) {
    var osc2  = audioCtx.createOscillator();
    var gain2 = audioCtx.createGain();
    osc2.setPeriodicWave(wt);
    osc2.frequency.value = cfg.freq * 0.8;
    osc2.connect(gain2);
    gain2.connect(dest);
    gain2.gain.setValueAtTime(vel * CFG.GAIN.hat * 0.25, t);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + cfg.decay * 0.6);
    osc2.start(t);
    osc2.stop(t + cfg.decay * 0.6 + 0.005);
  }

  // Layer hat body transient (SPEC_016 §6)
  if (typeof _playTransient === 'function') _playTransient('hat_body', dest, t, vel * 0.3);
}

// ---- Percussion synthesis (perc track — triangle/sine at palette freq) ----

function _synthPerc(t, vel, cfg) {
  if (!audioCtx) return;
  var dest = (typeof _trackGains !== 'undefined' && _trackGains.perc) ? _trackGains.perc : submixGain;
  if (!dest) return;
  var osc  = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(dest);

  // Wavetable for palette-specific percussion timbre
  var wt = (typeof Wavetables !== 'undefined' && _activePaletteName)
    ? Wavetables.get(_activePaletteName, 'perc') : null;
  if (wt) {
    osc.setPeriodicWave(wt);
  } else {
    osc.type = cfg.wave || 'triangle';
  }
  osc.frequency.value = cfg.freq;
  gain.gain.setValueAtTime(vel * CFG.GAIN.perc, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + (cfg.decay || 0.05));
  osc.start(t);
  osc.stop(t + (cfg.decay || 0.05) + 0.01);
}

// ---- Bass synthesis ----

function _synthBass(t, freq, vel, cutoff, resonance, wave) {
  if (!audioCtx) return;
  var dest = (typeof _trackGains !== 'undefined' && _trackGains.bass) ? _trackGains.bass : submixGain;
  if (!dest) return;
  var osc    = audioCtx.createOscillator();
  var filter = audioCtx.createBiquadFilter();
  var gain   = audioCtx.createGain();
  osc.connect(filter); filter.connect(gain); gain.connect(dest);

  // Wavetable for palette-specific bass timbre
  var wt = (typeof Wavetables !== 'undefined' && _activePaletteName)
    ? Wavetables.get(_activePaletteName, 'bass') : null;
  if (wt) {
    osc.setPeriodicWave(wt);
  } else {
    osc.type = wave || 'sawtooth';
  }
  osc.frequency.value = freq;

  // Filter envelope: open bright → close to cutoff (pluck-like)
  // Per-phase filter override (SPEC_028): tighter cutoff at Storm/Maelstrom
  var baseCutoff = cutoff;
  if (_activePalette && _activePalette.bass && _activePalette.bass.phaseFilter) {
    var phaseOverride = _activePalette.bass.phaseFilter[G.phase];
    if (typeof phaseOverride === 'number') baseCutoff = phaseOverride;
  }
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(baseCutoff * 4, t);
  filter.frequency.exponentialRampToValueAtTime(baseCutoff, t + 0.06);
  filter.Q.value = resonance;

  // Per-palette gain scalar (SPEC_028)
  var scalar = (_activePalette && _activePalette.bass && typeof _activePalette.bass.gainScalar === 'number')
    ? _activePalette.bass.gainScalar : 1.0;

  // Amplitude envelope: tight note (palm-muted feel)
  var noteDur = 0.22;
  gain.gain.setValueAtTime(vel * CFG.GAIN.bass * scalar, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
  osc.start(t); osc.stop(t + noteDur + 0.01);

  // FM modulation for dark_techno and glitch — adds harmonic movement
  if (_activePaletteName === 'dark_techno' || _activePaletteName === 'glitch') {
    var modRatio = _activePaletteName === 'glitch' ? 3.0 : 2.0;
    var modDepth = freq * 0.5;  // moderate FM depth
    var fm = _createFMPair(freq, modRatio, modDepth, filter, t);
    if (fm) {
      // FM depth envelope: bright attack → settle
      fm.modGain.gain.setValueAtTime(modDepth, t);
      fm.modGain.gain.exponentialRampToValueAtTime(modDepth * 0.1, t + noteDur * 0.7);
      fm.outGain.gain.value = 1.0;
      fm.carrier.frequency.value = freq;
      fm.carrier.start(t);
      fm.modulator.start(t);
      fm.carrier.stop(t + noteDur + 0.01);
      fm.modulator.stop(t + noteDur + 0.01);

      // Disconnect carrier from filter (we routed osc→filter already, FM adds to freq)
      // Actually FM pair connects carrier→outGain→filter, so we need to disconnect the
      // primary osc and use the FM carrier instead — but that changes the graph.
      // Simpler: keep both — primary osc provides body, FM carrier adds harmonics on top.
      fm.outGain.gain.setValueAtTime(vel * CFG.GAIN.bass * scalar * 0.3, t);
      fm.outGain.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
    }
  }
}

// ---- Pad synthesis (sustained chord bed) ----
// Plays current chord tones as a held, gently detuned wash.
// Re-voices on every chord change (called from tick when chord root moves).

var PadTrack = {
  _voices:   [],        // array of { osc, osc2, osc3, gain } — one per chord tone (3-osc unison)
  _palette:  null,      // palette.pad config
  _paletteName: null,   // for wavetable lookup (SPEC_016)
  _active:   false,
  _muted:    true,      // starts muted; StateMapper enables at intensity 20+
  _lastChordRoot: -1,   // detect chord changes
  _detuneOverride: 0,   // set by StateMapper at Maelstrom (doubles detune)
  _lpf:      null,      // shared low-pass filter — tames overtones so pad sits behind mix

  initRun: function(palette) {
    this.shutdown();
    this._palette = palette.pad;
    this._paletteName = palette.name || null;  // for wavetable lookup (SPEC_016)
    this._active  = true;
    this._muted   = true;
    this._lastChordRoot = -1;
    this._voices  = [];

    // Shared low-pass: cuts harsh overtones from sawtooth/triangle pads
    var padDest = (typeof _trackGains !== 'undefined' && _trackGains.pad) ? _trackGains.pad : submixGain;
    if (audioCtx && padDest) {
      this._lpf = audioCtx.createBiquadFilter();
      this._lpf.type = 'lowpass';
      this._lpf.frequency.value = 800;
      this._lpf.Q.value = 0.7;  // gentle rolloff, no resonance
      this._lpf.connect(padDest);
    }
  },

  // Called every beat from Sequencer.tick — only on step 0 (downbeat)
  tick: function(beatTime) {
    if (!this._active || !audioCtx || !submixGain || this._muted) return;
    if (!this._palette || typeof HarmonyEngine === 'undefined') return;

    var chord = HarmonyEngine.getCurrentChord();
    if (!chord) return;

    // Only re-voice when chord root changes
    if (chord.rootSemitone === this._lastChordRoot && this._voices.length > 0) return;
    this._lastChordRoot = chord.rootSemitone;

    // Fade out old voices
    this._fadeOutVoices(beatTime);

    // Build new voices: voiced tones with staggered entry + velocity variation
    var cfg   = this._palette;
    var tones = (typeof HarmonyEngine.getVoicedChordTones === 'function')
      ? HarmonyEngine.getVoicedChordTones(cfg.octave || 3)
      : HarmonyEngine.getChordTones(cfg.octave || 3);
    var t     = beatTime;
    var att   = cfg.attack || 0.8;
    var beatDur = 60 / (G.bpm || 120);

    // Wavetable for palette-specific pad timbre (SPEC_016)
    var wt = (typeof Wavetables !== 'undefined' && this._paletteName)
      ? Wavetables.get(this._paletteName, 'pad') : null;
    var detAmt = this._detuneOverride || cfg.detune || 12;

    // Stagger offset: each voice enters slightly later (up to 1/8 of beat)
    var staggerStep = Math.min(beatDur * 0.125, 0.04);

    for (var i = 0; i < tones.length; i++) {
      var freq = midiToFreq(tones[i]);
      var voiceTime = t + i * staggerStep;

      // Per-voice velocity variation: root louder, upper voices softer
      var velScale = (i === 0) ? 1.0 : (0.7 + (_songRng || Math.random)() * 0.2);
      var voiceGain = CFG.GAIN.pad * velScale;

      // 3-oscillator unison: center + detuned left + detuned right (SPEC_016)
      var osc  = audioCtx.createOscillator();
      var osc2 = audioCtx.createOscillator();
      var osc3 = audioCtx.createOscillator();

      if (wt) {
        osc.setPeriodicWave(wt);
        osc2.setPeriodicWave(wt);
        osc3.setPeriodicWave(wt);
      } else {
        osc.type  = cfg.wave || 'triangle';
        osc2.type = osc.type;
        osc3.type = osc.type;
      }

      osc.frequency.value  = freq;
      osc2.frequency.value = freq;
      osc3.frequency.value = freq;
      osc.detune.value  = 0;
      osc2.detune.value = detAmt;       // sharp
      osc3.detune.value = -detAmt;      // flat

      var gain = audioCtx.createGain();
      // Staggered attack: each voice fades in at its own offset
      gain.gain.setValueAtTime(0.0001, voiceTime);
      gain.gain.linearRampToValueAtTime(voiceGain, voiceTime + att);
      // Gentle swell: after reaching peak, slight volume dip then return
      // Creates breathing feel instead of static sustain
      var dip = voiceGain * 0.75;
      gain.gain.setValueAtTime(voiceGain, voiceTime + att);
      gain.gain.linearRampToValueAtTime(dip, voiceTime + att + beatDur * 0.5);
      gain.gain.linearRampToValueAtTime(voiceGain * 0.9, voiceTime + att + beatDur);

      osc.connect(gain);
      osc2.connect(gain);
      osc3.connect(gain);
      gain.connect(this._lpf || submixGain);
      osc.start(voiceTime);
      osc2.start(voiceTime);
      osc3.start(voiceTime);

      this._voices.push({ osc: osc, osc2: osc2, osc3: osc3, gain: gain });
    }
  },

  _fadeOutVoices: function(time) {
    var t   = time || (audioCtx ? audioCtx.currentTime : 0);
    var rel = (this._palette && this._palette.release) || 1.2;
    var stopAt = t + rel + 0.05;
    for (var i = 0; i < this._voices.length; i++) {
      var v = this._voices[i];
      if (v.gain) {
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), t);
        v.gain.gain.exponentialRampToValueAtTime(0.0001, t + rel);
      }
      if (v.osc)  {
        try { v.osc.stop(stopAt); } catch(e) {}
        try { v.osc.disconnect(); } catch(e) {}
      }
      if (v.osc2) {
        try { v.osc2.stop(stopAt); } catch(e) {}
        try { v.osc2.disconnect(); } catch(e) {}
      }
      if (v.osc3) {
        try { v.osc3.stop(stopAt); } catch(e) {}
        try { v.osc3.disconnect(); } catch(e) {}
      }
      if (v.gain) { try { v.gain.disconnect(); } catch(e) {} }
    }
    this._voices = [];
  },

  // Fade pad voices down during perk overlay, resume on unpause
  perkFade: function() {
    if (!audioCtx || this._voices.length === 0) return;
    var t = audioCtx.currentTime;
    for (var i = 0; i < this._voices.length; i++) {
      var v = this._voices[i];
      if (v.gain) {
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setTargetAtTime(0.0001, t, 0.15);
      }
    }
  },

  perkResume: function() {
    if (!audioCtx || this._voices.length === 0) return;
    var t = audioCtx.currentTime;
    for (var i = 0; i < this._voices.length; i++) {
      var v = this._voices[i];
      if (v.gain) {
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setTargetAtTime(CFG.GAIN.pad, t, 0.2);
      }
    }
  },

  shutdown: function() {
    if (audioCtx) this._fadeOutVoices();
    if (this._lpf) { try { this._lpf.disconnect(); } catch(e) {} this._lpf = null; }
    this._voices  = [];
    this._palette = null;
    this._active  = false;
    this._muted   = true;
    this._lastChordRoot = -1;
  },
};

// ArpTrack removed — was a DemoShooter panic-mode artifact, non-procedural, same pattern all palettes.

// ---- GrazeStreakTrack ----
// Ascending scale tones on each graze in a streak (Graze Streak perk, SPEC_012 §2.2, §6)
// Called from StateMapper.registerStreak(streak) each time streak increments.
// shimmer sustain node active while streak >= 5.

var GrazeStreakTrack = {
  _active:      false,
  _noteIdx:     0,       // cycles through scale notes (resets to 0 on streak reset)
  _palette:     null,
  _shimmerNode: null,    // OscillatorNode for sustained shimmer at streak >= 5
  _shimmerGain: null,    // GainNode for shimmer

  initRun: function(palette) {
    this._active   = true;
    this._noteIdx  = 0;
    this._palette  = palette;
    this._stopShimmer();
  },

  // Called on each graze event when Graze Streak perk is active.
  // streak: current streak AFTER incrementing (1 = first in streak)
  tick: function(streak) {
    if (!this._active || !audioCtx) return;
    var _gstDest = (typeof _trackGains !== 'undefined' && _trackGains.sfx) ? _trackGains.sfx : submixGain;
    if (!_gstDest) return;
    if (typeof HarmonyEngine === 'undefined') return;

    var scaleNotes = HarmonyEngine.getScaleNotes(5);
    if (!scaleNotes || scaleNotes.length === 0) return;

    // Play ascending note — each increment moves one scale step up, wraps at octave
    var midi = scaleNotes[this._noteIdx % scaleNotes.length];
    this._noteIdx++;

    var freq = midiToFreq(midi);
    var osc  = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_gstDest);

    osc.type = 'sine';
    osc.frequency.value = freq;

    var gain_val = CFG.GAIN.streak_tone;
    var dur = 0.18;
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(gain_val, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + dur + 0.01);

    // Shimmer sustain: activate at streak >= 5, deactivate below
    if (streak >= 5) {
      this._startShimmer(freq);
    } else {
      this._stopShimmer();
    }
  },

  // Descending gliss on streak reset
  onReset: function() {
    if (!this._active || !audioCtx) return;
    var _gstDest = (typeof _trackGains !== 'undefined' && _trackGains.sfx) ? _trackGains.sfx : submixGain;
    if (!_gstDest) return;
    this._stopShimmer();
    this._noteIdx = 0;

    // Only play gliss if there was an actual streak going
    if (typeof HarmonyEngine === 'undefined') return;
    var scaleNotes = HarmonyEngine.getScaleNotes(5);
    if (!scaleNotes || scaleNotes.length === 0) return;

    // Short descending gliss: 2 notes down from current position
    var now = audioCtx.currentTime;
    var glissNotes = [scaleNotes[Math.max(0, (this._noteIdx - 1) % scaleNotes.length)],
                      scaleNotes[Math.max(0, (this._noteIdx - 2 + scaleNotes.length) % scaleNotes.length)]];
    var gDest = _gstDest;
    glissNotes.forEach(function(midi, i) {
      var freq = midiToFreq(midi);
      var osc  = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(gDest);
      osc.type = 'sine';
      osc.frequency.value = freq;
      var t = now + i * 0.06;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(CFG.GAIN.streak_tone * 0.6, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.start(t);
      osc.stop(t + 0.14);
    });
    this._noteIdx = 0;
  },

  _startShimmer: function(freq) {
    if (this._shimmerNode) return; // already running
    if (!audioCtx) return;
    var _gstDest = (typeof _trackGains !== 'undefined' && _trackGains.sfx) ? _trackGains.sfx : submixGain;
    if (!_gstDest) return;
    var osc  = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_gstDest);
    osc.type = 'sine';
    osc.frequency.value = freq * 2; // shimmer at octave above current note
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(CFG.GAIN.streak_tone * 0.4, audioCtx.currentTime + 0.1);
    osc.start(audioCtx.currentTime);
    this._shimmerNode = osc;
    this._shimmerGain = gain;
  },

  _stopShimmer: function() {
    if (!this._shimmerNode) return;
    try {
      var g = this._shimmerGain;
      var n = this._shimmerNode;
      if (g && audioCtx) {
        g.gain.setValueAtTime(g.gain.value, audioCtx.currentTime);
        g.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
      }
      if (n && audioCtx) n.stop(audioCtx.currentTime + 0.16);
    } catch(e) {}
    this._shimmerNode = null;
    this._shimmerGain = null;
  },

  shutdown: function() {
    this._stopShimmer();
    this._active   = false;
    this._noteIdx  = 0;
    this._palette  = null;
  },
};

// ========== FILL SYSTEM (SPEC_018 §2) ==========
// Manages drum fill triggers, selection, and execution state.
// Fills replace the normal drum pattern for exactly 1 bar (16 steps).
//
// Trigger types:
//   'phase'  — full-bar fill on phase transition (all 3 instruments)
//   'beat16' — snare + hat mini-fill on every 16th beat (last 4 steps only)
//   'intensity'  — kick build fill at intensity milestones 10, 20, 50
//
// Fill selection: fills arrays in palette.drums[inst] ordered low→high intensity.
// Phase bias selects from progressively higher-intensity fills as game progresses.

var FillSystem = {
  _palette:    null,
  _active:     false,

  // Per-instrument fill state: { pattern: [...], stepsLeft: 0 }
  _fills: { kick: null, snare: null, hat: null },

  // Phase intensity bias table (0 = start from low-intensity fills only)
  _PHASE_BIAS: { pulse: 0.0, swell: 0.2, surge: 0.4, storm: 0.6, maelstrom: 0.8 },

  // Cooldown tracking: prevent fills from triggering too rapidly
  _lastFillBeat: -32,  // beat index when last full fill fired
  _FILL_COOLDOWN: 8,   // min beats between full fills

  initRun: function(palette) {
    this._palette   = palette;
    this._active    = true;
    this._fills     = { kick: null, snare: null, hat: null };
    this._lastFillBeat = -32;
  },

  stop: function() {
    this._active = false;
    this._fills  = { kick: null, snare: null, hat: null };
    this._palette = null;
  },

  // Select a fill pattern name for instrument at given phase.
  // palette.drums[inst].fills = names ordered low→high intensity.
  _selectFill: function(inst, phase) {
    if (!this._palette) return null;
    var instrCfg = this._palette.drums[inst];
    if (!instrCfg || !instrCfg.fills || !instrCfg.fills.length) return null;
    var fills = instrCfg.fills;
    var bias  = this._PHASE_BIAS[phase] || 0;
    // Pick from the top (0.5 + bias*0.5) portion — earlier phases stay conservative
    var maxIdx = Math.max(0, Math.floor(fills.length * (0.5 + bias * 0.5)) - 1);
    var idx = Math.floor((_songRng || Math.random)() * (maxIdx + 1));
    return fills[Math.min(idx, fills.length - 1)];
  },

  // Arm a fill for an instrument. Builds the pattern and sets stepCursor.
  // stepCursor counts 0→15 across the fill bar; fill auto-clears at step 16.
  _armFill: function(inst, fillName) {
    if (!fillName) return;
    var pat = _buildPattern(fillName);
    if (!pat) return;
    this._fills[inst] = { pattern: pat, stepCursor: 0 };
  },

  // Trigger a full-bar fill across all 3 drum instruments (phase transition).
  // beatIdx: current G.beatCount. Guards against rapid re-trigger.
  triggerPhaseFill: function(phase, beatIdx) {
    if (!this._active) return;
    if ((beatIdx - this._lastFillBeat) < this._FILL_COOLDOWN) return;
    this._lastFillBeat = beatIdx;
    this._armFill('kick',  this._selectFill('kick',  phase));
    this._armFill('snare', this._selectFill('snare', phase));
    this._armFill('hat',   this._selectFill('hat',   phase));
    console.log('[FillSystem] Phase fill →', phase);
  },

  // Trigger a mini-fill: snare + hat last-4-steps style (every 16 beats).
  triggerMiniFill: function(phase) {
    if (!this._active) return;
    // Only fire if no fill is already active on these instruments
    if (this._fills.snare && this._fills.snare.stepsLeft > 0) return;
    this._armFill('snare', 'fill_snare_mini');
    this._armFill('hat',   'fill_hat_mini');
  },

  // Trigger a kick build fill at intensity milestones (10, 20, 50).
  triggerIntensityBuild: function(phase) {
    if (!this._active) return;
    // Only fire if kick fill not already running
    if (this._fills.kick && this._fills.kick.stepsLeft > 0) return;
    this._armFill('kick', this._selectFill('kick', phase) || 'fill_kick_build');
  },

  // Called per 16th step from Sequencer.tick().
  // Returns the active fill step for this instrument, or null if no fill active.
  // Advances internal cursor; auto-clears after 16 steps (1 bar).
  getStep: function(inst) {
    var fill = this._fills[inst];
    if (!fill) return null;
    var step = fill.pattern[fill.stepCursor];
    fill.stepCursor++;
    if (fill.stepCursor >= 16) {
      this._fills[inst] = null;  // fill complete
    }
    return step || null;
  },
};

// ---- Walking Bass Engine (SPEC_018 §3) ----
//
// Replaces the simple root-offset bass lookup with intensity-driven behavior:
//   Intensity 0–9:  root note only (pattern controls rhythm)
//   Intensity 10–19: root + 5th alternation
//   Intensity 20–34: chord tones + octave bounce + passing tones
//   Intensity 35–49: walking bass — stepwise scale motion toward next chord root
//   Intensity 50+:  chromatic approach notes + syncopation
//
// WalkingBass.getNote(stepIndex, beatTime) returns MIDI note.
// On chord changes, it queues a 2-beat approach figure leading into the new root.

var WalkingBass = {
  _palette:       null,
  _active:        false,
  _lastNote:      -1,       // last MIDI note played (for stepwise motion)
  _approachQueue: null,     // { notes: [midi, midi], stepIdx: 0 } — 2-step approach figure
  _lastChordRoot: -1,       // detect chord changes independently (semitone)
  _passDir:       1,        // passing tone direction: +1 ascending, -1 descending

  initRun: function(palette) {
    this._palette       = palette;
    this._active        = true;
    this._lastNote      = -1;
    this._approachQueue = null;
    this._lastChordRoot = -1;
    this._passDir       = 1;
  },

  stop: function() {
    this._active        = false;
    this._approachQueue = null;
    this._palette       = null;
  },

  // --- Complexity tier ---
  _tier: function(intensity, cap) {
    var raw;
    if (intensity >= 50) raw = 4;        // chromatic approach + syncopation
    else if (intensity >= 35) raw = 3;   // walking bass (stepwise to target)
    else if (intensity >= 20) raw = 2;   // chord tones + passing
    else if (intensity >= 10) raw = 1;   // root + 5th
    else raw = 0;                        // root only
    if (typeof cap === 'number' && raw > cap) {
      var pName = (this._palette && this._palette.name) ? this._palette.name : 'unknown';
      console.log('[WalkingBass] tier capped at ' + cap + ' (palette: ' + pName + ', raw: ' + raw + ')');
      return cap;
    }
    return raw;
  },

  // --- Get the target root MIDI for the current chord at a given octave ---
  _chordRoot: function(octave) {
    if (typeof HarmonyEngine === 'undefined' || !HarmonyEngine._currentChord) return -1;
    var semitone = HarmonyEngine._currentChord.rootSemitone;
    return (octave + 1) * 12 + semitone;
  },

  // --- Get all scale notes in range [lo, hi] ---
  _scaleNotesInRange: function(lo, hi) {
    if (typeof HarmonyEngine === 'undefined') return [];
    var root   = HarmonyEngine.root;
    var scale  = HarmonyEngine._melodyScale;
    if (!scale) return [];
    var notes = [];
    for (var oct = 1; oct <= 6; oct++) {
      for (var i = 0; i < scale.length; i++) {
        var n = oct * 12 + root + scale[i];
        if (n >= lo && n <= hi) notes.push(n);
      }
    }
    return notes;
  },

  // --- Next scale step toward target ---
  _stepToward: function(current, target) {
    if (typeof HarmonyEngine === 'undefined') return target;
    var scale  = this._scaleNotesInRange(
      Math.min(current, target) - 14,
      Math.max(current, target) + 14
    );
    if (!scale.length) return target;
    // Sort by proximity to current, prefer direction toward target
    var dir = (target > current) ? 1 : -1;
    var candidates = scale.filter(function(n) {
      return dir > 0 ? (n > current && n <= target) : (n < current && n >= target);
    });
    if (!candidates.length) return target;
    // Pick nearest in direction
    candidates.sort(function(a, b) { return Math.abs(a - current) - Math.abs(b - current); });
    return candidates[0];
  },

  // --- Chromatic step toward target (within 2 semitones) ---
  _chromaticApproach: function(target) {
    // Approach from below or above randomly
    var dir = ((_songRng || Math.random)() < 0.6) ? -1 : 1;
    return target + dir;
  },

  // --- Queue a 2-step approach figure into newRoot ---
  // beat 3.5: scale tone approach; beat 4: chromatic step; beat 1: target (played normally)
  // We arm this when chord changes detected and tier >= 2.
  _armApproach: function(newRoot) {
    var approach1 = this._stepToward(this._lastNote >= 0 ? this._lastNote : newRoot - 2, newRoot);
    var approach2 = this._chromaticApproach(newRoot);
    this._approachQueue = { notes: [approach1, approach2], stepIdx: 0 };
  },

  // --- Main: called per 16th step from Sequencer.tick ---
  // Returns MIDI note or -1 (silence for this step).
  // bStep = pattern step object (for rhythm / active gate).
  // intensity = current G.intensity.
  // octave = palette bass octave.
  getNote: function(bStep, intensity, octave) {
    if (!this._active || !bStep || !bStep.active) return -1;
    if (typeof HarmonyEngine === 'undefined' || !HarmonyEngine._currentChord) return -1;

    var tierCap = (this._palette && this._palette.bass && typeof this._palette.bass.tierCap === 'number')
      ? this._palette.bass.tierCap : undefined;
    var tier = this._tier(intensity, tierCap);
    var root = this._chordRoot(octave);
    if (root < 0) return root;

    // --- Detect chord change, arm approach figure at tier 2+ ---
    var currentRoot = HarmonyEngine._currentChord.rootSemitone;
    if (this._lastChordRoot >= 0 && currentRoot !== this._lastChordRoot && tier >= 2) {
      this._armApproach(root);
    }
    this._lastChordRoot = currentRoot;

    // --- Consume approach queue first ---
    if (this._approachQueue && this._approachQueue.stepIdx < this._approachQueue.notes.length) {
      var aqNote = this._approachQueue.notes[this._approachQueue.stepIdx];
      this._approachQueue.stepIdx++;
      if (this._approachQueue.stepIdx >= this._approachQueue.notes.length) {
        this._approachQueue = null;
      }
      this._lastNote = aqNote;
      return aqNote;
    }

    // --- Generate note by tier ---
    var note;

    if (tier === 0) {
      // Root only
      note = root;

    } else if (tier === 1) {
      // Root + 5th alternation (every 2 active steps)
      var chord = HarmonyEngine.getChordTones(octave);
      var fifth = chord.length >= 2 ? chord[1] : root + 7;
      // Alternate: use step pattern position as rough guide
      note = (this._lastNote === root) ? fifth : root;

    } else if (tier === 2) {
      // Chord tones + octave bounce + passing tone
      var chTones = HarmonyEngine.getChordTones(octave);
      if (!chTones.length) { note = root; }
      else {
        // Cycle through chord tones, occasionally add passing tone
        var _rng = (_songRng || Math.random);
        var ctIdx = Math.floor(_rng() * chTones.length);
        note = chTones[ctIdx];
        // 20% chance: passing tone (scale step between last note and chord tone)
        if (this._lastNote >= 0 && _rng() < 0.20 && Math.abs(note - this._lastNote) > 2) {
          var passing = this._stepToward(this._lastNote, note);
          if (passing !== this._lastNote) note = passing;
        }
      }

    } else if (tier === 3) {
      // Walking bass: stepwise scale motion toward next chord root
      if (this._lastNote < 0) {
        note = root;
      } else {
        note = this._stepToward(this._lastNote, root);
        // If we've arrived at root, explore neighboring chord tones
        if (note === this._lastNote || note === root) {
          var wChord = HarmonyEngine.getChordTones(octave);
          if (wChord.length > 1) {
            note = wChord[Math.floor((_songRng || Math.random)() * wChord.length)];
          }
        }
      }

    } else {
      // Tier 4: chromatic approach + syncopation
      if (this._lastNote < 0) {
        note = root;
      } else {
        var distToRoot = Math.abs(this._lastNote - root);
        if (distToRoot <= 2 && distToRoot > 0) {
          // Chromatic walk into root
          note = this._lastNote + (root > this._lastNote ? 1 : -1);
        } else if (distToRoot === 0) {
          // At root: explore tritone sub or chord tone
          var t4chord = HarmonyEngine.getChordTones(octave);
          note = t4chord.length > 1 ? t4chord[Math.floor((_songRng || Math.random)() * t4chord.length)] : root + 6;
        } else {
          // Step toward root (can use chromatic steps)
          note = this._lastNote + (root > this._lastNote ? 1 : -1);
        }
      }
    }

    // --- Safety: clamp note to playable bass range (MIDI 28–55, E1–G3) ---
    while (note > 55) note -= 12;
    while (note < 28) note += 12;

    this._lastNote = note;
    return note;
  },
};

// ---- Polyrhythm Tracks (SPEC_018 §5) ----
// Overlay percussion tracks that run at step counts other than 16.
// Perc B (12 steps, 3:4 triplet) at Storm+. Perc C (20 steps, 5:4 quintuplet) at Maelstrom+.
// Uses _globalStep (incremented every 16th note across the entire run) modulo each track's step count.
// Hits are quiet (-6dB from main drums) and panned slightly off-center.

var PolyTrack = {
  _tracks:     null,   // array of { steps, pattern, freq, wave, decay, phase, muted, pan }
  _globalStep: 0,      // monotonic 16th-note counter (never wraps to 16)
  _active:     false,

  initRun: function(palette) {
    this._globalStep = 0;
    this._tracks     = [];
    this._active     = true;

    var polyCfg = palette.polyrhythms;
    if (!polyCfg || !polyCfg.length) return;

    for (var i = 0; i < polyCfg.length; i++) {
      var cfg = polyCfg[i];
      // Build euclidean pattern at the track's step count
      var pat = euclidean(cfg.hits || Math.floor(cfg.steps * 0.4), cfg.steps);
      // Convert to step objects with velocity
      var steps = [];
      for (var j = 0; j < pat.length; j++) {
        steps.push(pat[j] ? { active: true, vel: cfg.vel || 0.35 } : { active: false });
      }
      this._tracks.push({
        steps:   cfg.steps,
        pattern: steps,
        freq:    cfg.freq    || 600,
        wave:    cfg.wave    || 'triangle',
        decay:   cfg.decay   || 0.04,
        phase:   cfg.phase   || 'storm',   // phase gate: muted until this phase
        muted:   true,                      // StateMapper unmutes at phase
        pan:     cfg.pan     || (i % 2 === 0 ? -0.3 : 0.3),  // slight stereo offset
      });
    }
  },

  stop: function() {
    this._active = false;
    this._tracks = null;
  },

  // Called by StateMapper._onPhaseChange to unmute tracks at their phase gate
  onPhaseChange: function(newPhase) {
    if (!this._tracks) return;
    var phaseOrder = ['pulse', 'swell', 'surge', 'storm', 'maelstrom'];
    var phaseIdx   = phaseOrder.indexOf(newPhase);
    if (phaseIdx < 0) phaseIdx = phaseOrder.length; // post-maelstrom = all unmuted

    for (var i = 0; i < this._tracks.length; i++) {
      var gateIdx = phaseOrder.indexOf(this._tracks[i].phase);
      this._tracks[i].muted = (phaseIdx < gateIdx);
    }
  },

  // Called per 16th step from Sequencer.tick. Plays any poly hits for this global step.
  tickStep: function(t) {
    if (!this._active || !this._tracks || !audioCtx) return;

    for (var i = 0; i < this._tracks.length; i++) {
      var tr = this._tracks[i];
      if (tr.muted) continue;
      var step = this._globalStep % tr.steps;
      var s    = tr.pattern[step];
      if (!s || !s.active) continue;

      // Synthesize polyrhythm percussion hit (reuse _synthPerc with custom cfg)
      _synthPerc(t, s.vel, {
        wave:  tr.wave,
        freq:  tr.freq,
        decay: tr.decay,
      });
    }
    this._globalStep++;
  },
};

// ---- Pattern Mutation System (SPEC_018 §6) ----
// Every 4 bars, applies subtle mutations to drum patterns:
//   - Velocity drift (±10% random) — every bar
//   - Step swap (two adjacent active steps) — 15% per 4 bars
//   - Step add (one inactive → ghost, prob 0.3) — 20% per 4 bars
//   - Step remove (one ghost → inactive) — 10% per 4 bars
//   - Accent shift (one downbeat accent moves ±1) — 10% per 4 bars
// Max 2 mutations per 4-bar cycle (excluding velocity drift which always applies).
// Original patterns preserved as reference; mutations revert at phase transitions.

var PatternMutator = {
  _originals:    null,  // { kick: [...], snare: [...], hat: [...] } — deep copies of originals
  _barCounter:   0,     // counts bars (one bar = 16 steps = 4 beats)
  _active:       false,

  initRun: function() {
    this._barCounter = 0;
    this._active     = true;
    this._originals  = null;  // captured after first bar plays
  },

  stop: function() {
    this._active    = false;
    this._originals = null;
  },

  // Capture original patterns (called once, after Sequencer builds patterns)
  captureOriginals: function(drumPatterns) {
    if (!drumPatterns) return;
    this._originals = {};
    var instruments = ['kick', 'snare', 'hat'];
    for (var i = 0; i < instruments.length; i++) {
      var inst = instruments[i];
      if (!drumPatterns[inst]) continue;
      this._originals[inst] = [];
      for (var j = 0; j < drumPatterns[inst].length; j++) {
        var s = drumPatterns[inst][j];
        this._originals[inst].push(s ? { active: s.active, vel: s.vel, prob: s.prob } : { active: false });
      }
    }
  },

  // Revert to original patterns (called on phase transitions)
  revertToOriginals: function(drumPatterns) {
    if (!this._originals || !drumPatterns) return;
    var instruments = ['kick', 'snare', 'hat'];
    for (var i = 0; i < instruments.length; i++) {
      var inst = instruments[i];
      if (!this._originals[inst] || !drumPatterns[inst]) continue;
      for (var j = 0; j < this._originals[inst].length; j++) {
        var orig = this._originals[inst][j];
        drumPatterns[inst][j] = { active: orig.active, vel: orig.vel, prob: orig.prob };
      }
    }
  },

  // Called every 16th step. Tracks bars and triggers mutations.
  // stepIdx: the 0–15 step within the bar.
  // drumPatterns: Sequencer._drumPatterns (mutated in place).
  onStep: function(stepIdx, drumPatterns) {
    if (!this._active || !drumPatterns) return;
    // Only act on step 0 (start of a new bar)
    if (stepIdx !== 0) return;
    this._barCounter++;

    // Capture originals on first bar
    if (this._barCounter === 1 && !this._originals) {
      this.captureOriginals(drumPatterns);
    }

    // --- Velocity drift: every bar, all instruments ---
    this._applyVelocityDrift(drumPatterns);

    // --- Structural mutations: every 4 bars, max 2 ---
    if (this._barCounter % 4 === 0) {
      this._applyStructuralMutations(drumPatterns);
    }
  },

  _applyVelocityDrift: function(drumPatterns) {
    var instruments = ['kick', 'snare', 'hat'];
    for (var i = 0; i < instruments.length; i++) {
      var pat = drumPatterns[instruments[i]];
      if (!pat) continue;
      for (var j = 0; j < pat.length; j++) {
        if (!pat[j] || !pat[j].active) continue;
        // ±10% random drift, clamped to [0.1, 1.0]
        var drift = 1 + ((_songRng || Math.random)() * 0.2 - 0.1);
        pat[j].vel = Math.max(0.1, Math.min(1.0, pat[j].vel * drift));
      }
    }
  },

  _applyStructuralMutations: function(drumPatterns) {
    var budget = 2;
    var instruments = ['kick', 'snare', 'hat'];

    // Shuffle instrument order for fairness
    var _rng = (_songRng || Math.random);
    for (var i = instruments.length - 1; i > 0; i--) {
      var j = Math.floor(_rng() * (i + 1));
      var tmp = instruments[i]; instruments[i] = instruments[j]; instruments[j] = tmp;
    }

    for (var idx = 0; idx < instruments.length && budget > 0; idx++) {
      var pat = drumPatterns[instruments[idx]];
      if (!pat) continue;

      // Step swap: 15%
      if (budget > 0 && _rng() < 0.15) {
        this._mutateSwap(pat);
        budget--;
      }

      // Step add (ghost): 20%
      if (budget > 0 && _rng() < 0.20) {
        this._mutateAdd(pat);
        budget--;
      }

      // Step remove (ghost): 10%
      if (budget > 0 && _rng() < 0.10) {
        this._mutateRemove(pat);
        budget--;
      }

      // Accent shift: 10%
      if (budget > 0 && _rng() < 0.10) {
        this._mutateAccentShift(pat);
        budget--;
      }
    }
  },

  // Swap two adjacent active steps
  _mutateSwap: function(pat) {
    for (var i = 0; i < pat.length - 1; i++) {
      if (pat[i].active && pat[i + 1].active) {
        var tmpVel = pat[i].vel;
        pat[i].vel = pat[i + 1].vel;
        pat[i + 1].vel = tmpVel;
        return;
      }
    }
  },

  // Turn one inactive step into a ghost note
  _mutateAdd: function(pat) {
    var candidates = [];
    for (var i = 0; i < pat.length; i++) {
      if (!pat[i].active) candidates.push(i);
    }
    if (!candidates.length) return;
    var idx = candidates[Math.floor((_songRng || Math.random)() * candidates.length)];
    pat[idx] = { active: true, vel: 0.25, prob: 0.3 };
  },

  // Deactivate one ghost step (prob < 1.0)
  _mutateRemove: function(pat) {
    var candidates = [];
    for (var i = 0; i < pat.length; i++) {
      if (pat[i].active && pat[i].prob !== undefined && pat[i].prob < 1.0) candidates.push(i);
    }
    if (!candidates.length) return;
    var idx = candidates[Math.floor((_songRng || Math.random)() * candidates.length)];
    pat[idx] = { active: false };
  },

  // Shift one downbeat accent ±1 step
  _mutateAccentShift: function(pat) {
    // Downbeats: steps 0, 4, 8, 12
    var downbeats = [0, 4, 8, 12];
    for (var i = 0; i < downbeats.length; i++) {
      var db = downbeats[i];
      if (!pat[db] || !pat[db].active || pat[db].vel < 0.7) continue;
      var dir = ((_songRng || Math.random)() < 0.5) ? -1 : 1;
      var target = db + dir;
      if (target < 0 || target >= pat.length) continue;
      if (pat[target].active) continue; // don't overwrite
      // Move the accent
      pat[target] = { active: true, vel: pat[db].vel, prob: pat[db].prob };
      pat[db].vel *= 0.6; // soften the original
      return;
    }
  },
};

// ---- Drum synth dispatch (SPEC_019 §4: genre-specific overrides) ----
// If palette drum cfg has a synth function, call it instead of the default.
var _DRUM_DEFAULTS = { kick: _synthKick, snare: _synthSnare, hat: _synthHat, perc: _synthPerc };
function _dispatchDrumSynth(type, t, vel, cfg) {
  if (cfg && typeof cfg.synth === 'function') {
    cfg.synth(t, vel, cfg);
  } else {
    _DRUM_DEFAULTS[type](t, vel, cfg);
  }
}

// ---- ChordTrack — rhythmic chord articulation (SPEC_032 §4) ----
// Plays rhythmic chord voicings (stabs, comps, arps) per palette.
// 16-step resolution, called from Sequencer tick's sub-step loop.

// 8 chord rhythm patterns — each is 16-step array of { active, vel }
// vel=0 → ghost note (comp style plays at ~20% velocity)
var _CHORD_PATTERNS = {
  // Offbeat power stabs: beats 2+4 (steps 4, 12)
  offbeat_stab: [
    {a:0,v:0}, {a:0,v:0}, {a:0,v:0}, {a:0,v:0},
    {a:1,v:0.9}, {a:0,v:0}, {a:0,v:0}, {a:0,v:0},
    {a:0,v:0}, {a:0,v:0}, {a:0,v:0}, {a:0,v:0},
    {a:1,v:0.9}, {a:0,v:0}, {a:0,v:0}, {a:0,v:0},
  ],
  // Four-on-floor stabs: every beat (steps 0,4,8,12)
  four_stab: [
    {a:1,v:0.85}, {a:0,v:0}, {a:0,v:0}, {a:0,v:0},
    {a:1,v:0.75}, {a:0,v:0}, {a:0,v:0}, {a:0,v:0},
    {a:1,v:0.80}, {a:0,v:0}, {a:0,v:0}, {a:0,v:0},
    {a:1,v:0.75}, {a:0,v:0}, {a:0,v:0}, {a:0,v:0},
  ],
  // Syncopated comp: jazz voicing — 1-and, 2, and-of-3, 4
  // Velocities reduced to prevent gain collision with simultaneous melody notes (qa39 improve)
  synco_comp: [
    {a:1,v:0.45}, {a:0,v:0}, {a:1,v:0.35}, {a:0,v:0},
    {a:1,v:0.55}, {a:0,v:0}, {a:0,v:0}, {a:1,v:0.25},
    {a:0,v:0}, {a:0,v:0}, {a:1,v:0.40}, {a:0,v:0},
    {a:1,v:0.50}, {a:0,v:0}, {a:0,v:0}, {a:0,v:0},
  ],
  // Ascending arp — every 16th note, cycling through chord tones
  arp_up: [
    {a:1,v:0.7}, {a:1,v:0.5}, {a:1,v:0.6}, {a:1,v:0.5},
    {a:1,v:0.7}, {a:1,v:0.5}, {a:1,v:0.6}, {a:1,v:0.5},
    {a:1,v:0.7}, {a:1,v:0.5}, {a:1,v:0.6}, {a:1,v:0.5},
    {a:1,v:0.7}, {a:1,v:0.5}, {a:1,v:0.6}, {a:1,v:0.5},
  ],
  // Up-down arp — ascending then descending through chord tones
  arp_updown: [
    {a:1,v:0.8}, {a:1,v:0.6}, {a:1,v:0.7}, {a:1,v:0.6},
    {a:1,v:0.7}, {a:1,v:0.5}, {a:1,v:0.6}, {a:1,v:0.5},
    {a:1,v:0.7}, {a:1,v:0.6}, {a:1,v:0.7}, {a:1,v:0.6},
    {a:1,v:0.8}, {a:1,v:0.5}, {a:1,v:0.6}, {a:1,v:0.5},
  ],
  // Euclidean 3-in-8 (distributed evenly, doubled to 16 steps)
  euclidean_3_8: [
    {a:1,v:0.85}, {a:0,v:0}, {a:0,v:0}, {a:1,v:0.7},
    {a:0,v:0}, {a:0,v:0}, {a:1,v:0.75}, {a:0,v:0},
    {a:1,v:0.85}, {a:0,v:0}, {a:0,v:0}, {a:1,v:0.7},
    {a:0,v:0}, {a:0,v:0}, {a:1,v:0.75}, {a:0,v:0},
  ],
  // Ghost comp — mostly ghosted, random accent (lo-fi)
  ghost_comp: [
    {a:1,v:0.25}, {a:0,v:0}, {a:1,v:0.2}, {a:0,v:0},
    {a:1,v:0.6}, {a:0,v:0}, {a:0,v:0}, {a:1,v:0.2},
    {a:0,v:0}, {a:0,v:0}, {a:1,v:0.25}, {a:0,v:0},
    {a:1,v:0.55}, {a:0,v:0}, {a:1,v:0.2}, {a:0,v:0},
  ],
  // Stutter 8th — rapid 8th-note stabs (industrial)
  stutter_8th: [
    {a:1,v:0.85}, {a:0,v:0}, {a:1,v:0.7}, {a:0,v:0},
    {a:1,v:0.80}, {a:0,v:0}, {a:1,v:0.65}, {a:0,v:0},
    {a:1,v:0.85}, {a:0,v:0}, {a:1,v:0.7}, {a:0,v:0},
    {a:1,v:0.80}, {a:0,v:0}, {a:1,v:0.65}, {a:0,v:0},
  ],
};

var ChordTrack = {
  _active:      false,
  _muted:       true,      // starts muted; StateMapper enables via Sequencer._mute.chord
  _palette:     null,      // palette.chord config
  _paletteName: null,
  _pattern:     null,      // 16-step pattern ref from _CHORD_PATTERNS
  _step:        0,         // current step (0–15, advances per 16th note in tick)
  _lpf:         null,      // shared lowpass filter
  _arpIndex:    0,         // current arp position (cycles through chord tones)

  initRun: function(palette) {
    this.shutdown();
    this._paletteName = palette.name || null;
    var chordCfg = palette.chord;
    if (!chordCfg || chordCfg.style === 'none') {
      this._active = false;
      this._palette = null;
      this._pattern = null;
      return;
    }
    this._palette = chordCfg;
    this._active  = true;
    this._muted   = true;   // StateMapper will unmute at entryPhase
    this._step    = 0;
    this._arpIndex = 0;

    // Resolve pattern
    this._pattern = _CHORD_PATTERNS[chordCfg.pattern] || _CHORD_PATTERNS.offbeat_stab;

    // Create shared LPF → chord track gain
    var dest = (typeof _trackGains !== 'undefined' && _trackGains.chord) ? _trackGains.chord : submixGain;
    if (audioCtx && dest) {
      this._lpf = audioCtx.createBiquadFilter();
      this._lpf.type = 'lowpass';
      this._lpf.frequency.value = chordCfg.lpfCutoff || 2000;
      this._lpf.Q.value = chordCfg.lpfResonance || 1.0;
      this._lpf.connect(dest);
    }
  },

  // Called per 16th-note sub-step from Sequencer tick loop
  tickStep: function(time, stepIdx) {
    if (!this._active || !audioCtx || this._muted || !this._palette) return;
    if (!this._pattern) return;

    var pat = this._pattern[stepIdx % 16];
    if (!pat || !pat.a) return;

    var cfg = this._palette;
    var vel = pat.v;

    // Ghost note handling for comp style: low vel = ghost (play quieter)
    if (cfg.style === 'comp' && vel < 0.3) {
      // Probabilistic ghost — 60% chance to fire
      if ((_songRng || Math.random)() > 0.6) return;
    }

    // Get chord tones at the configured octave
    if (typeof HarmonyEngine === 'undefined') return;
    var tones = HarmonyEngine.getChordTones(cfg.octave || 4);
    if (!tones || tones.length === 0) return;

    // Limit to requested voice count
    var voiceCount = Math.min(cfg.voices || 3, tones.length);

    if (cfg.style === 'arp') {
      // Arp: play one note at a time, cycling through chord tones
      var toneIdx = this._arpIndex % voiceCount;
      this._playArpNote(time, tones[toneIdx], vel, cfg);
      // Advance arp index (up-down reverses direction)
      if (cfg.pattern === 'arp_updown') {
        // 0,1,2,1,0,1,2,1,... for 3 voices
        var cycle = (voiceCount - 1) * 2;
        if (cycle < 1) cycle = 1;
        this._arpIndex = (this._arpIndex + 1) % cycle;
      } else {
        this._arpIndex = (this._arpIndex + 1) % voiceCount;
      }
    } else {
      // Stab / comp: play all voices simultaneously
      this._playStab(time, tones, voiceCount, vel, cfg);
    }
  },

  _playStab: function(time, tones, voiceCount, vel, cfg) {
    if (!audioCtx || !this._lpf) return;
    var baseGain = (CFG.GAIN.chord || 0.10) * (cfg.gainScalar || 1.0) * vel;

    for (var i = 0; i < voiceCount; i++) {
      var freq = midiToFreq(tones[i]);
      var osc = audioCtx.createOscillator();
      // Use square for stabs (punchy), triangle for comps (softer)
      osc.type = (cfg.style === 'comp') ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(freq, time);

      var gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0, time);

      // ADSR envelope
      var attack = cfg.attack || 0.01;
      var decay = cfg.decay || 0.15;
      var susLvl = cfg.sustainLevel || 0;
      var release = cfg.release || 0.05;

      gain.gain.linearRampToValueAtTime(baseGain, time + attack);
      gain.gain.linearRampToValueAtTime(baseGain * susLvl, time + attack + decay);
      // Release
      var noteEnd = time + attack + decay + 0.05;
      gain.gain.linearRampToValueAtTime(0, noteEnd + release);

      osc.connect(gain);
      gain.connect(this._lpf);
      osc.start(time);
      osc.stop(noteEnd + release + 0.01);
    }
  },

  _playArpNote: function(time, toneMidi, vel, cfg) {
    if (!audioCtx || !this._lpf) return;
    var baseGain = (CFG.GAIN.chord || 0.10) * (cfg.gainScalar || 1.0) * vel;
    var freq = midiToFreq(toneMidi);

    var osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, time);

    var attack = cfg.attack || 0.003;
    var decay = cfg.decay || 0.06;
    var release = cfg.release || 0.03;

    gain.gain.linearRampToValueAtTime(baseGain, time + attack);
    gain.gain.linearRampToValueAtTime(0, time + attack + decay);
    var noteEnd = time + attack + decay;
    gain.gain.linearRampToValueAtTime(0, noteEnd + release);

    osc.connect(gain);
    gain.connect(this._lpf);
    osc.start(time);
    osc.stop(noteEnd + release + 0.01);
  },

  // Called from StateMapper._dispatchHarmony on phase transition
  onPhaseChange: function(phase) {
    if (!this._active || !this._palette) return;
    var phaseOrder = ['pulse', 'swell', 'surge', 'storm', 'maelstrom'];
    var entryIdx = phaseOrder.indexOf(this._palette.entryPhase || 'swell');
    var curIdx   = phaseOrder.indexOf(phase);
    // Gate on entryPhase: unmute when phase meets or exceeds entry threshold
    this._muted = (curIdx < entryIdx);
  },

  shutdown: function() {
    this._active = false;
    this._muted  = true;
    this._palette = null;
    this._pattern = null;
    this._step    = 0;
    this._arpIndex = 0;
    if (this._lpf) {
      try { this._lpf.disconnect(); } catch(e) {}
      this._lpf = null;
    }
  },
};

// ---- Sequencer ----

var Sequencer = {
  _stepIdx:      0,     // current 16th-note step (0–15)
  _globalStep:   0,     // monotonic 16th-note counter (never resets within a run)
  _drumPatterns: null,  // { kick, snare, hat } — arrays of 16 steps
  _bassPattern:  null,  // array of 16 steps
  _palette:      null,
  _active:       false,
  _mute:         { kick: false, snare: false, hat: false, bass: false, pad: true, perc: true },
  _hatDefault:   null,   // original hat pattern name (for Maelstrom reset)
  _hatDoubled:   false,  // true when Maelstrom double-time hat is active

  // Called from resetRun() with the selected palette
  initRun: function(palette) {
    this._palette  = palette;
    _activePaletteName = palette.name || null;  // for wavetable lookup in synth fns
    _activePalette = palette;                    // full object for bass personality (SPEC_028)
    if (typeof Wavetables !== 'undefined') Wavetables.clearCache();  // fresh waves per run
    this._stepIdx  = 0;
    this._globalStep = 0;
    this._active   = true;
    // Start muted per Pulse floor: only kick audible at game start.
    // StateMapper._updateLayers() will unmute tracks as phase/intensity progress.
    this._mute     = { kick: false, snare: true, hat: true, bass: true, pad: true, perc: true, melody: true, chord: true };
    this._hatDoubled = false;
    this._halfTime = false;
    this._halfTimeEnd = 0;
    this._intensityComplexity = 'simple'; // SPEC_020 §6: 'simple'|'base'|'complex' set by StateMapper
    _noiseBuffer   = null; // reset: new AudioContext gets fresh buffer

    var d = palette.drums;
    this._drumPatterns = {
      kick:  _buildPattern(d.kick.pattern),
      snare: _buildPattern(d.snare.pattern),
      hat:   _buildPattern(d.hat.pattern),
    };
    this._hatDefault = d.hat.pattern;

    // Build perc pattern from palette data (played at Surge+)
    if (d.perc && d.perc.pattern) {
      this._drumPatterns.perc = _buildPattern(d.perc.pattern);
    }

    // Pick a seeded-random bass pattern from palette
    var bPats = palette.bass.patterns;
    var bName = bPats[Math.floor((_songRng || Math.random)() * bPats.length)];
    this._bassPattern = _buildPattern(bName);

    // Init PadTrack + GrazeStreakTrack + MelodyEngine + GrooveEngine + FillSystem
    if (typeof PadTrack !== 'undefined') PadTrack.initRun(palette);
    if (typeof GrazeStreakTrack !== 'undefined') GrazeStreakTrack.initRun(palette);
    if (typeof MelodyEngine !== 'undefined') MelodyEngine.initRun(palette);
    if (typeof ChordTrack !== 'undefined') ChordTrack.initRun(palette);     // SPEC_032 §4
    if (typeof GrooveEngine !== 'undefined') GrooveEngine.initRun(palette);  // SPEC_018 §1
    if (typeof FillSystem !== 'undefined') FillSystem.initRun(palette);      // SPEC_018 §2
    if (typeof WalkingBass !== 'undefined') WalkingBass.initRun(palette);   // SPEC_018 §3
    if (typeof PolyTrack !== 'undefined') PolyTrack.initRun(palette);       // SPEC_018 §5
    if (typeof PatternMutator !== 'undefined') PatternMutator.initRun();    // SPEC_018 §6

    // Palette special textures (SPEC_019)
    if (typeof VinylCrackle !== 'undefined') {
      if (palette.special === 'vinyl_crackle') {
        VinylCrackle.start();
      } else {
        VinylCrackle.stop();
      }
    }
    if (typeof PitchWobble !== 'undefined') {
      if (palette.special === 'pitch_wobble') {
        PitchWobble.start();
      } else {
        PitchWobble.stop();
      }
    }
    if (typeof BreakRewind !== 'undefined') {
      BreakRewind.initRun(palette);
    }

    // Set sidechain amount from palette effects
    if (palette.effects && palette.effects.sidechain !== undefined) {
      _sidechainAmount = palette.effects.sidechain;
    }

    // Apply palette mix settings to MixBus
    if (palette.effects) {
      var fx = palette.effects;
      // Reverb wet/dry
      if (_reverbWet && fx.reverb !== undefined) {
        _reverbWet.gain.value = fx.reverb;
        if (_reverbDry) _reverbDry.gain.value = 1 - fx.reverb;
      }
      // Delay feedback
      if (_delayFeedback && fx.delay && fx.delay.feedback !== undefined) {
        _delayFeedback.gain.value = fx.delay.feedback;
      }
      // Delay time synced to beat subdivision
      if (_delay && fx.delay && fx.delay.time) {
        var beatSec = 60 / G.bpm;
        var delayMap = { '4n': beatSec, '8n': beatSec / 2, '16n': beatSec / 4 };
        var dTime = delayMap[fx.delay.time] || (beatSec / 2);
        _delay.delayTime.value = dTime;
      }
      // Base distortion override
      if (waveshaper && fx.distortion > 0) {
        waveshaper.curve = _makeDistortionCurve(fx.distortion);
      }
      // Reverb impulse duration per palette feel
      if (_reverb && audioCtx) {
        var impDur  = fx.reverb >= 0.5 ? 2.0 : 0.8; // long for wet palettes
        var impDecay = fx.reverb >= 0.5 ? 1.5 : 2.0;
        _reverb.buffer = _makeImpulse(impDur, impDecay);
      }

      // ── SPEC_016: Apply palette-specific per-track send levels at run start ──
      if (fx.phases && fx.phases.pulse) {
        var pulseFx = fx.phases.pulse;
        // Set initial reverb send levels
        if (typeof _trackReverbSends !== 'undefined') {
          if (_trackReverbSends.pad) _trackReverbSends.pad.gain.value = pulseFx.reverbSend * 1.0;
          if (_trackReverbSends.snare) _trackReverbSends.snare.gain.value = pulseFx.reverbSend * 0.4;
        }
        // Set initial delay send levels
        if (typeof _trackDelaySends !== 'undefined') {
          if (_trackDelaySends.sfx) _trackDelaySends.sfx.gain.value = pulseFx.delaySend * 0.3;
        }
      }

      // ── SPEC_016: Apply palette-specific sidechain intensity ──
      if (typeof _SIDECHAIN_PROFILES !== 'undefined') {
        // Palette sidechain value scales all per-track sidechain ducks
        var scBase = fx.sidechain || 0.6;
        _SIDECHAIN_PROFILES.bass.duck = Math.min(0.80 * (scBase / 0.6), 0.95);
        _SIDECHAIN_PROFILES.pad.duck  = Math.min(0.40 * (scBase / 0.6), 0.70);
        _SIDECHAIN_PROFILES.perc.duck = Math.min(0.30 * (scBase / 0.6), 0.60);
        _SIDECHAIN_PROFILES.sfx.duck  = Math.min(0.20 * (scBase / 0.6), 0.40);
      }
    }

    console.log('[Sequencer] initRun: palette=' + palette.name +
                ' drums=(' + d.kick.pattern + '/' + d.snare.pattern + '/' + d.hat.pattern + ')' +
                ' bass=' + bName);
  },

  stop: function() {
    this._active = false;
    if (typeof PadTrack !== 'undefined') PadTrack.shutdown();
    if (typeof GrazeStreakTrack !== 'undefined') GrazeStreakTrack.shutdown();
    if (typeof MelodyEngine !== 'undefined') MelodyEngine.shutdown();
    if (typeof ChordTrack !== 'undefined') ChordTrack.shutdown();         // SPEC_032 §4
    if (typeof FillSystem !== 'undefined') FillSystem.stop();              // SPEC_018 §2
    if (typeof WalkingBass !== 'undefined') WalkingBass.stop();           // SPEC_018 §3
    if (typeof PolyTrack !== 'undefined') PolyTrack.stop();               // SPEC_018 §5
    if (typeof PatternMutator !== 'undefined') PatternMutator.stop();     // SPEC_018 §6
    if (typeof VinylCrackle !== 'undefined') VinylCrackle.stop();        // SPEC_019
    if (typeof PitchWobble !== 'undefined') PitchWobble.stop();          // SPEC_019
    if (typeof BreakRewind !== 'undefined') BreakRewind.stop();          // SPEC_019
    if (typeof PaletteBlender !== 'undefined') PaletteBlender.stop();    // SPEC_019 §2
  },

  // Switch bass pattern mid-run (called by StateMapper at section boundaries)
  switchBassPattern: function() {
    if (!this._palette) return;
    var bPats = this._palette.bass.patterns;
    if (bPats.length <= 1) return;
    var bName = bPats[Math.floor((_songRng || Math.random)() * bPats.length)];
    this._bassPattern = _buildPattern(bName);
  },

  // Double-time hat for Maelstrom: straight 16ths, accented downbeats
  switchHatDouble: function() {
    if (this._hatDoubled) return;
    this._hatDoubled = true;
    var pat = [];
    for (var i = 0; i < 16; i++) {
      pat.push({ active: true, vel: (i % 4 === 0) ? 0.7 : 0.45 });
    }
    this._drumPatterns.hat = pat;
    console.log('[Sequencer] Hat → double-time 16ths');
  },

  // ── Half-time feel (SPEC_025 §7 — Timewarp musical rest) ──
  // For durationBeats: drums play half-time, bass holds, hat muted,
  // pad gain +0.05, reverb sends +20%. Auto-restores after durationBeats.
  _halfTime: false,
  _halfTimeEnd: 0,      // beatCount at which half-time ends
  _halfTimePadBoost: null,

  setHalfTime: function(beatTime, durationBeats) {
    if (this._halfTime) return; // already in half-time
    this._halfTime = true;
    this._halfTimeEnd = (G.beatCount || 0) + durationBeats;

    var t = beatTime || (audioCtx ? audioCtx.currentTime : 0);

    // Mute hat during half-time
    this._mute._hatBeforeHT = this._mute.hat;
    this._mute.hat = true;

    // Pad gain boost +0.05
    if (typeof PadTrack !== 'undefined' && audioCtx) {
      PadTrack._halfTimeGainBoost = 0.05;
    }

    // Reverb sends +20%
    if (audioCtx && typeof _trackReverbSends !== 'undefined') {
      var sends = ['pad', 'snare', 'perk'];
      for (var i = 0; i < sends.length; i++) {
        var s = _trackReverbSends[sends[i]];
        if (s) {
          s._htOriginal = s.gain.value;
          s.gain.setTargetAtTime(s.gain.value * 1.2, t, 0.05);
        }
      }
    }

    console.log('[Sequencer] Half-time ON for ' + durationBeats + ' beats');
  },

  _checkHalfTimeEnd: function() {
    if (!this._halfTime) return;
    if ((G.beatCount || 0) >= this._halfTimeEnd) {
      this._halfTime = false;

      // Restore hat
      this._mute.hat = this._mute._hatBeforeHT || false;

      // Remove pad boost
      if (typeof PadTrack !== 'undefined') {
        PadTrack._halfTimeGainBoost = 0;
      }

      // Restore reverb sends
      if (audioCtx && typeof _trackReverbSends !== 'undefined') {
        var sends = ['pad', 'snare', 'perk'];
        for (var i = 0; i < sends.length; i++) {
          var s = _trackReverbSends[sends[i]];
          if (s && s._htOriginal !== undefined) {
            s.gain.setTargetAtTime(s._htOriginal, audioCtx.currentTime, 0.08);
            s._htOriginal = undefined;
          }
        }
      }

      console.log('[Sequencer] Half-time OFF');
    }
  },

  // Called every beat (quarter note) from _onBeat in GameScene.
  // Schedules 4 sixteenth-note sub-steps ahead, each precisely timed.
  tick: function(beatTime) {
    if (!this._active || !audioCtx || !this._palette) return;

    // Check half-time end (SPEC_025 §7)
    this._checkHalfTimeEnd();

    // Palette blending: advance blend amount each beat during Maelstrom (SPEC_019 §2)
    if (typeof PaletteBlender !== 'undefined' && G.phase === 'maelstrom') {
      PaletteBlender.onBeat();
    }

    var beatDurSecs = 60 / G.bpm;
    var subDur      = beatDurSecs / 4;  // 16th-note duration
    var pal         = this._palette;
    var d           = pal.drums;

    // --- Pad: tick on downbeat only (step 0 of this beat) ---
    if (typeof PadTrack !== 'undefined' && !this._mute.pad) {
      PadTrack._muted = false;
      PadTrack.tick(beatTime);
    } else if (typeof PadTrack !== 'undefined') {
      PadTrack._muted = true;
    }

    // --- Melody: tick on downbeat (SPEC_017 §5) ---
    if (typeof MelodyEngine !== 'undefined' && !this._mute.melody) {
      MelodyEngine._muted = false;
      MelodyEngine.tick(beatTime);
    } else if (typeof MelodyEngine !== 'undefined') {
      MelodyEngine._muted = true;
    }

    // --- 16-beat mini-fill trigger (SPEC_018 §2) ---
    // Every 16 beats: snare + hat mini-fill (last 4 steps only).
    // Only fires in Swell+ to keep Pulse clean.
    if (typeof FillSystem !== 'undefined' && G.beatCount > 0 &&
        G.beatCount % 16 === 0 && G.phase !== 'pulse') {
      FillSystem.triggerMiniFill(G.phase);
    }

    var useGroove = (typeof GrooveEngine !== 'undefined');

    var useBreakRewind = (typeof BreakRewind !== 'undefined' && BreakRewind._active);

    for (var sub = 0; sub < 4; sub++) {
      // BreakRewind (SPEC_019 §1.6): on 8th bar of every 8-bar cycle, reverse pattern lookup
      var s = useBreakRewind ? BreakRewind.resolveStep(this._globalStep) : this._stepIdx;

      // Apply swing + humanize timing offset for this step (SPEC_018 §1)
      var grooveOffset = useGroove ? GrooveEngine.getTimingOffset(s, subDur) : 0;
      var t = beatTime + sub * subDur + grooveOffset;

      // --- Drums (mute-aware, prob-gated; fill overrides normal pattern) ---
      // FillSystem.getStep() returns fill step if fill active, else null.
      // Fill steps bypass prob gate (fills always play as written).
      var useFill = (typeof FillSystem !== 'undefined');

      // ── Half-time drum override (SPEC_025 §7): kick on 1 only, snare on beat 3 (step 8), no hat ──
      var isHalfTime = this._halfTime;

      var kickFillStep = useFill ? FillSystem.getStep('kick') : null;
      var kick = kickFillStep || this._drumPatterns.kick[s];
      if (kick && !this._mute.kick) {
        if (isHalfTime) {
          // Half-time: kick only on step 0
          if (s === 0) _dispatchDrumSynth('kick', t, 0.8, d.kick);
        } else if (kickFillStep) {
          if (kick.active) _dispatchDrumSynth('kick', t, kick.vel, d.kick);
        } else {
          if (useGroove ? GrooveEngine.shouldFire(kick) : (kick.active)) {
            _dispatchDrumSynth('kick', t, kick.vel, d.kick);
          }
        }
      }

      var snareFillStep = useFill ? FillSystem.getStep('snare') : null;
      var snare = snareFillStep || this._drumPatterns.snare[s];
      if (snare && !this._mute.snare) {
        // Complexity tier: 'simple' = backbeat only (step 4,12), 'base'/'complex' = full
        var snareTier = this._intensityComplexity || 'base';
        var skipSnareSimple = (snareTier === 'simple' && !snareFillStep && !isHalfTime && (s !== 4 && s !== 12));
        if (skipSnareSimple) {
          // Simple tier: only backbeat positions
        } else if (isHalfTime) {
          // Half-time: snare on step 8 (beat 3)
          if (s === 8) _dispatchDrumSynth('snare', t, 0.7, d.snare);
        } else if (snareFillStep) {
          if (snare.active) _dispatchDrumSynth('snare', t, snare.vel, d.snare);
        } else {
          if (useGroove ? GrooveEngine.shouldFire(snare) : (snare.active)) {
            _dispatchDrumSynth('snare', t, snare.vel, d.snare);
          }
        }
      }

      var hatFillStep = useFill ? FillSystem.getStep('hat') : null;
      var hat = hatFillStep || this._drumPatterns.hat[s];
      if (hat && !this._mute.hat) {
        // Complexity tier: 'simple' = quarter notes only (skip offbeats), 'base' = normal, 'complex' = full with ghosts
        var cTier = this._intensityComplexity || 'base';
        var skipSimple = (cTier === 'simple' && !hatFillStep && (s % 4 !== 0));
        if (skipSimple) {
          // Simple tier: only play on-beat hits (steps 0, 4, 8, 12)
        } else if (hatFillStep) {
          if (hat.active) _dispatchDrumSynth('hat', t, hat.vel, d.hat);
        } else {
          if (useGroove ? GrooveEngine.shouldFire(hat) : (hat.active)) {
            // Velocity scaling per complexity tier
            var hatVel = hat.vel;
            if (cTier === 'simple') hatVel *= 0.7;
            _dispatchDrumSynth('hat', t, hatVel, d.hat);
          }
        }
      }

      // --- Perc (mute-aware, Surge+) ---
      if (this._drumPatterns.perc && d.perc) {
        var perc = this._drumPatterns.perc[s];
        if (perc && !this._mute.perc) {
          if (useGroove ? GrooveEngine.shouldFire(perc) : (perc.active)) {
            _dispatchDrumSynth('perc', t, perc.vel, d.perc);
          }
        }
      }

      // --- ChordTrack (SPEC_032 §4 — rhythmic chord stabs/comps/arps) ---
      if (typeof ChordTrack !== 'undefined' && !this._mute.chord) {
        ChordTrack._muted = false;
        ChordTrack.tickStep(t, s);
      } else if (typeof ChordTrack !== 'undefined') {
        ChordTrack._muted = true;
      }

      // --- Polyrhythm tracks (SPEC_018 §5, Storm+/Maelstrom+) ---
      if (typeof PolyTrack !== 'undefined') {
        PolyTrack.tickStep(t);
      }

      // --- Pattern mutations (SPEC_018 §6) ---
      if (typeof PatternMutator !== 'undefined') {
        PatternMutator.onStep(s, this._drumPatterns);
      }

      // --- Bass (mute-aware; WalkingBass engine handles pitch — SPEC_018 §3) ---
      // During half-time: bass holds current note, skip new triggers (SPEC_025 §7)
      var bStep = this._bassPattern[s];
      if (bStep && bStep.active && !this._mute.bass && !this._halfTime) {
        var bassMidi = -1;
        if (typeof WalkingBass !== 'undefined' && WalkingBass._active) {
          bassMidi = WalkingBass.getNote(bStep, G.intensity, pal.bass.octave);
        } else {
          // Fallback: simple root
          var fbTones = HarmonyEngine.getChordTones(pal.bass.octave);
          if (fbTones.length > 0) bassMidi = fbTones[0] + (bStep.pitchOffset || 0);
        }
        if (bassMidi >= 0) {
          _synthBass(t, midiToFreq(bassMidi), bStep.vel,
                     pal.bass.filterCutoff, pal.bass.filterResonance, pal.bass.wave);
        }
      }

      this._stepIdx = (this._stepIdx + 1) % 16;
      this._globalStep++;
    }
  },
};

// ── Vinyl Crackle Texture (SPEC_019 §1.1 — lo_fi_chill special) ─────────
// Continuous quiet noise source (LP 2kHz, gain 0.02) simulating record surface
// noise. Starts on initRun when palette.special === 'vinyl_crackle', stops on
// next initRun or scene shutdown.

var VinylCrackle = {
  _src: null,
  _gain: null,

  start: function() {
    this.stop();
    if (!audioCtx) return;
    var nb = _getNoiseBuffer();
    if (!nb) return;

    var dest = (typeof _trackGains !== 'undefined' && _trackGains.perc) ? _trackGains.perc : submixGain;
    if (!dest) return;

    var src  = audioCtx.createBufferSource();
    src.buffer = nb;
    src.loop   = true;

    var lp   = audioCtx.createBiquadFilter();
    lp.type  = 'lowpass';
    lp.frequency.value = 2000;
    lp.Q.value = 0.5;

    var gain = audioCtx.createGain();
    gain.gain.value = 0.02;

    src.connect(lp);
    lp.connect(gain);
    gain.connect(dest);
    src.start(0);

    this._src  = src;
    this._gain = gain;
  },

  stop: function() {
    if (this._src) {
      try { this._src.stop(); } catch (e) { /* ignore */ }
      try { this._src.disconnect(); } catch (e) { /* ignore */ }
    }
    if (this._gain) {
      try { this._gain.disconnect(); } catch (e) { /* ignore */ }
    }
    this._src  = null;
    this._gain = null;
  },
};

// ── Pitch Wobble (SPEC_019 §1.5 — vaporwave special) ──────────────────────
// Slow 0.2Hz LFO modulating master pitch by ±10 cents, simulating a warped
// cassette tape. Connected to a detune-capable node in the audio chain.

var PitchWobble = {
  _lfo: null,
  _lfoGain: null,
  _target: null,  // the ConstantSourceNode whose offset detunes the master

  start: function() {
    this.stop();
    if (!audioCtx) return;

    // Create a ConstantSourceNode to act as a detune offset
    // We modulate masterGain's detune (or a dedicated constant source)
    var lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.2;  // 0.2 Hz — slow tape warble

    var lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 10;  // ±10 cents

    // Connect LFO → gain → masterGain.detune (if available)
    // AudioParam modulation: LFO oscillates, scaled to ±10 cents
    lfo.connect(lfoGain);

    // Modulate submixGain detune if it exists; fallback to masterGain
    var target = submixGain || masterGain;
    if (target && target.detune) {
      lfoGain.connect(target.detune);
      this._target = target;
    }

    lfo.start(0);
    this._lfo = lfo;
    this._lfoGain = lfoGain;
  },

  stop: function() {
    if (this._lfo) {
      try { this._lfo.stop(); } catch (e) { /* ignore */ }
      try { this._lfo.disconnect(); } catch (e) { /* ignore */ }
    }
    if (this._lfoGain) {
      try { this._lfoGain.disconnect(); } catch (e) { /* ignore */ }
    }
    this._lfo = null;
    this._lfoGain = null;
    this._target = null;
  },
};

// ── Break Rewind (SPEC_019 §1.6 — breakbeat special) ──────────────────────
// Every 8 bars (128 steps), reverses drum pattern step iteration for 1 bar
// (16 steps), simulating a "rewind" effect common in jungle/DnB.

var BreakRewind = {
  _active: false,

  initRun: function(palette) {
    this._active = !!(palette && palette.special === 'break_rewind');
  },

  stop: function() {
    this._active = false;
  },

  // Given a globalStep (monotonic 16th counter), return the step index (0–15)
  // to use for pattern lookup. On the 8th bar of every 8-bar cycle, reverse.
  resolveStep: function(globalStep) {
    if (!this._active) return globalStep % 16;
    // Which bar are we in within the 8-bar cycle? (0-indexed)
    var barInCycle = Math.floor(globalStep / 16) % 8;
    var stepInBar = globalStep % 16;
    // Bar 7 (8th bar) = rewind: read pattern backwards
    if (barInCycle === 7) {
      return 15 - stepInBar;
    }
    return stepInBar;
  },
};
