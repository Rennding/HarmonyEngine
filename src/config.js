// ========== HARMONY ENGINE CONFIG ==========
// Audio-relevant constants extracted from DemoShooter/src/01_config.js
// This file contains ONLY the constants needed by the audio engine.

const CFG = {
  BPM: 120,
  get BEAT_MS() { return 60000 / this.BPM; },

  MAX_ENERGY: 3,

  MOODS: [
    { name: 'Chill',    bpm: 90  },
    { name: 'Normal',   bpm: 120 },
    { name: 'Intense',  bpm: 150 },
  ],

  // ── Difficulty Coefficient (SPEC_011) ─────────────────────────────────────
  DIFFICULTY: {
    CURVES: {
      chill:   { scale: 250, exp: 1.2 },
      normal:  { scale: 200, exp: 1.3 },
      intense: { scale: 160, exp: 1.4 },
    },
  },

  // ── Phases (SPEC_011) ────────────────────────────────────────────────────
  PHASES: [
    { name: 'pulse',     dc: 0,    types: ['dart'] },
    { name: 'swell',     dc: 0.30, types: ['dart', 'wave', 'bloom'] },
    { name: 'surge',     dc: 0.60, types: ['dart', 'wave', 'bloom', 'snap', 'drift'] },
    { name: 'storm',     dc: 1.00, types: null },
    { name: 'maelstrom', dc: 1.50, types: null },
  ],

  // Phase floor: tracks always audible per phase (SPEC_011 §3.1)
  PHASE_FLOOR: {
    pulse:     { kick: true, hat: false, snare: false, bass: false, pad: false, perc: false, melody: false },
    swell:     { kick: true, hat: true,  snare: false, bass: false, pad: false, perc: false, melody: true  },
    surge:     { kick: true, hat: true,  snare: true,  bass: true,  pad: false, perc: true,  melody: true  },
    storm:     { kick: true, hat: true,  snare: true,  bass: true,  pad: true,  perc: true,  melody: true  },
    maelstrom: { kick: true, hat: true,  snare: true,  bass: true,  pad: true,  perc: true,  melody: true  },
  },

  // Intensity thresholds (above floor) for adding layers
  INTENSITY_LAYER_THRESHOLDS: { hat: 5, snare: 10, bass: 10, pad: 20, perc: 15 },

  // Post-Maelstrom cosmetic phase names
  POST_MAELSTROM: [
    'Excuse Me', 'Unreasonable', 'Personal', 'This Is Rude',
    'Mathematically Unfair', 'Therapy Recommended', 'Send Help',
    'Why Are You Still Here', 'Fine. Stay.',
  ],

  // Phase FX: additive to palette baseline
  PHASE_FX: {
    pulse:     { reverbAdd: 0,    delayFbAdd: 0,    distAdd: 0,   sidechainAdd: 0,    padVoices: 3, detuneAdd: 0 },
    swell:     { reverbAdd: 0.10, delayFbAdd: 0.05, distAdd: 0,   sidechainAdd: 0,    padVoices: 3, detuneAdd: 0 },
    surge:     { reverbAdd: 0.12, delayFbAdd: 0.08, distAdd: 0,   sidechainAdd: 0.10, padVoices: 4, detuneAdd: 0 },
    storm:     { reverbAdd: 0.15, delayFbAdd: 0.10, distAdd: 0.1, sidechainAdd: 0.15, padVoices: 4, detuneAdd: 0 },
    maelstrom: { reverbAdd: 0.20, delayFbAdd: 0.15, distAdd: 0.2, sidechainAdd: 0.25, padVoices: 4, detuneAdd: 12 },
  },

  // ── Graze config (audio needs these for SFX) ─────────────────────────────
  GRAZE: {
    ZONE_NORMAL:  2.5,
    ZONE_TIGHT:   1.6,
    ZONE_PERFECT: 1.15,
    BASE_SCORE:   10,
    TIER_MULTIPLIER: { normal: 1, tight: 2, perfect: 5 },
    STREAK_WINDOW:     2,
    STREAK_MULTIPLIER: 0.3,
    STREAK_CAP:        10,
    PULSE_THRESHOLD:   5,
    PULSE_RADIUS:      120,
    PULSE_FORCE:       4,
    PULSE_FRAMES:      8,
    PULSE_COOLDOWN:    4,
    PULSE_ZONE_SHRINK: 0.90,
    COOLDOWN_MS: 150,
  },

  GAIN: {
    // Drums
    kick:        0.38,
    snare_noise: 0.24,
    snare_tonal: 0.10,
    hat:         0.12,
    perc:        0.13,
    // Bass
    bass:        0.20,
    // Melody
    melody:      0.06,
    // Pad
    pad:         0.013,
    // Beat tick layers
    tick_sq:     0.05,
    tick_sub:    0.04,
    tick_stab:   0.025,
    // SFX
    hit_hp3:     0.14,
    hit_hp3b:    0.11,
    hit_hp2:     0.13,
    hit_hp2b:    0.11,
    hit_hp2c:    0.09,
    hit_hp1:     0.16,
    hit_hp1b:    0.14,
    hit_hp1c:    0.13,
    hit_hp1d:    0.11,
    combo_hi:    0.06,
    combo_mid:   0.08,
    combo_lo:    0.06,
    near_miss:   0.05,
    graze_normal:  0.06,
    graze_tight:   0.09,
    graze_perfect: 0.12,
    slash_layer:   0.08,
    streak_tone:   0.05,
    pulse_boom:    0.14,
    regen:         0.08,
    voice:       0.03,
    perk:        0.12,
    bass_fill:   0.12,
    death_swell: 0.08,
    death_note:  0.10,
  },

  // ── Staggered phase transitions (SPEC_010) ────────────────────────────────
  STAGGER_OVERRIDE: null,   // null = use palette defaults. Set to { rhythm, harmony, texture, melody, window } to override.
  STAGGER_DEFAULT: { rhythm: 0, harmony: 2, texture: 4, melody: 4, window: 4 },

  // ── Tension curve randomization (SPEC_011) ────────────────────────────────
  TENSION: {
    WINDOW_MIN: 32,          // minimum beats per candidate window
    WINDOW_MAX: 64,          // maximum beats per candidate window
    GRACE_BEATS: 16,         // no events before this beat
    GAP_MIN: 8,              // minimum beats between events
    BASE_PROBS: {            // base probabilities (before palette bias)
      none: 0.40,
      plateau: 0.25,
      spike: 0.15,
      retreat: 0.20,
    },
    DURATION: {
      plateau: { min: 16, max: 32, easeIn: 0,  easeOut: 4 },
      spike:   { min: 8,  max: 16, easeIn: 4,  easeOut: 4 },
      retreat: { min: 12, max: 24, easeIn: 4,  easeOut: 8 },
    },
  },

  // ── Cycle mode timing (SPEC_008 §2/§3/§5) ────────────────────────────────
  CYCLE: {
    DECAY_BARS:           16,   // bars to strip instruments down
    BRIDGE_BARS:           4,   // kick-only bars between palettes
    REBUILD_BARS:         16,   // bars to layer new palette instruments in
    MAELSTROM_SUSTAIN_MIN: 8,   // min bars before cycle triggers
    MAELSTROM_SUSTAIN_MAX: 32,  // max bars before cycle triggers
  },

  // ── Audio Visualizer (for UI) ─────────────────────────────────────────────
  VIZ: {
    CENTER_X:    300,
    CENTER_Y:    300,
    BINS:         64,
    BAR_W:         3,
    COLOR:    0x7b2fff,
    RENDER_EVERY:  3,
    BEAT_SPIKE:  0.20,
    PHASE_FLASH_A: 0.30,
    PHASE_FLASH_MS: 120,
    BREATH_PX:     3,
    BREATH_BEATS:  2,
    INNER_ALPHA: 0.15,
    PHASE_CFG: {
      Pulse:     [60, 50, 0.25],
      Swell:     [55, 60, 0.28],
      Surge:     [50, 65, 0.32],
      Storm:     [45, 70, 0.36],
      Maelstrom: [40, 80, 0.40],
    },
  },
};
