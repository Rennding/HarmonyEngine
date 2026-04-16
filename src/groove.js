// ========== GROOVE ENGINE — Swing, Humanization, Probability Scaling ==========
// SPEC_018 §1 — Session 1
//
// Applies timing deviation and ghost-note probability scaling to the sequencer.
// Called by Sequencer.tick() to compute:
//   - swing offset per step index (even steps delayed)
//   - humanize jitter (±ms, random per note)
//   - probability multiplier per phase (scales ghost note fire rate)
//
// Phase scaling table (SPEC_018 §1):
//   Pulse:     humanize ×1.0, swing ×1.0,  prob ×0.5
//   Swell:     humanize ×1.2, swing ×1.0,  prob ×1.0
//   Surge:     humanize ×1.0, swing ×1.3,  prob ×1.3
//   Storm:     humanize ×0.5, swing ×1.0,  prob ×1.5
//   Maelstrom: humanize ×2.0, swing ×1.5,  prob ×2.0 (ghost prob clamped to 0.8)

var GrooveEngine = {
  // Active values — updated on phase change and palette init
  _swingBase:    0.0,   // from palette.groove.swing
  _humanizeBase: 5,     // from palette.groove.humanize (ms)

  // Phase multipliers (active)
  _swingMult:    1.0,
  _humanizeMult: 1.0,
  _probMult:     0.5,   // start conservative at Pulse

  // Phase scaling tables
  _PHASE_SWING_MULT:    { pulse: 1.0, swell: 1.0, surge: 1.3, storm: 1.0, maelstrom: 1.5 },
  _PHASE_HUMANIZE_MULT: { pulse: 1.0, swell: 1.2, surge: 1.0, storm: 0.5, maelstrom: 2.0 },
  _PHASE_PROB_MULT:     { pulse: 0.5, swell: 1.0, surge: 1.3, storm: 1.5, maelstrom: 2.0 },

  // Initialize from palette at run start
  initRun: function(palette) {
    var g = palette.groove || {};
    this._swingBase    = g.swing     !== undefined ? g.swing     : 0.0;
    this._humanizeBase = g.humanize  !== undefined ? g.humanize  : 5;
    // Start at Pulse phase defaults
    this._swingMult    = 1.0;
    this._humanizeMult = 1.0;
    this._probMult     = 0.5;
  },

  // Called by StateMapper when phase changes
  onPhaseChange: function(newPhase) {
    var ph = newPhase || 'pulse';
    this._swingMult    = this._PHASE_SWING_MULT[ph]    || 1.0;
    this._humanizeMult = this._PHASE_HUMANIZE_MULT[ph] || 1.0;
    this._probMult     = this._PHASE_PROB_MULT[ph]     || 1.0;
  },

  // Compute timing offset (seconds) for a given 16th-note step.
  // stepIndex: 0–15 within the bar.
  // subDurSecs: duration of one 16th note in seconds.
  getTimingOffset: function(stepIndex, subDurSecs) {
    var offset = 0;

    // Swing: delay odd-indexed steps (1,3,5,7,9,11,13,15)
    if (stepIndex % 2 === 1) {
      var swing = this._swingBase * this._swingMult;
      offset += swing * subDurSecs * 0.5;
    }

    // Humanize: random ±ms deviation
    var humanizeMs  = this._humanizeBase * this._humanizeMult;
    var humanizeSec = ((_songRng || Math.random)() * 2 - 1) * humanizeMs / 1000;
    offset += humanizeSec;

    return offset;
  },

  // Should this step fire? Applies probability + phase scaling.
  // step: { active, vel, prob? }
  // Returns true if the step should play this bar.
  shouldFire: function(step) {
    if (!step || !step.active) return false;
    // No prob field = always fire (backwards-compat with bass/non-ghost steps)
    if (step.prob === undefined || step.prob === null) return true;
    // prob 1.0 = deterministic
    if (step.prob >= 1.0) return true;

    // Scale ghost probability by phase multiplier, clamped to 0.8 max
    var scaledProb = Math.min(step.prob * this._probMult, 0.8);
    return (_songRng || Math.random)() < scaledProb;
  },
};
