// ========== HARMONY ENGINE + PALETTES ==========

// --- Scale intervals (semitones from root) ---
var SCALES = {
  minor:           [0, 2, 3, 5, 7, 8, 10],
  major:           [0, 2, 4, 5, 7, 9, 11],
  minorPentatonic: [0, 3, 5, 7, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  phrygian:        [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor:   [0, 2, 3, 5, 7, 8, 11],
  lydian:          [0, 2, 4, 6, 7, 9, 11],
  locrian:         [0, 1, 3, 5, 6, 8, 10],
  chromatic:       [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  wholeTone:       [0, 2, 4, 6, 8, 10],
};

// Non-diatonic scales need a 7-note parent for chord building
var CHORD_PARENT = {
  minorPentatonic: 'minor',
  majorPentatonic: 'major',
  wholeTone:       'lydian',   // 6-note scale → nearest 7-note diatonic for chord degrees
};

// Root note semitone offsets
var ROOT_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
var ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Roman numeral → scale degree index (0-based)
var _ROMAN_MAP = {
  i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6,
  I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6,
};

function _parseRoman(numeral) {
  // Handle borrowed chord prefixes: bVI, bVII, bII, #iv°
  var flat = false;
  var sharp = false;
  var stripped = numeral;
  if (stripped.charAt(0) === 'b') { flat = true; stripped = stripped.substring(1); }
  if (stripped.charAt(0) === '#') { sharp = true; stripped = stripped.substring(1); }

  // Handle diminished suffix
  var dim = false;
  if (stripped.charAt(stripped.length - 1) === '°') {
    dim = true;
    stripped = stripped.substring(0, stripped.length - 1);
  }

  var lower = stripped.toLowerCase();
  var degree = _ROMAN_MAP[lower];
  if (degree === undefined) degree = 0;

  var isUpper = stripped.charAt(0) === stripped.charAt(0).toUpperCase()
                && stripped.charAt(0) !== stripped.charAt(0).toLowerCase();
  var quality = dim ? 'diminished' : (isUpper ? 'major' : 'minor');

  return { degree: degree, quality: quality, flat: flat, sharp: sharp };
}

// Build intervals from chord root by quality
function _triadIntervals(quality) {
  if (quality === 'major')      return [0, 4, 7];
  if (quality === 'diminished') return [0, 3, 6];
  return [0, 3, 7]; // minor
}

// Extended voicing intervals (above triad root)
var _VOICING_INTERVALS = {
  triad:   [0, 4, 7],            // or [0, 3, 7] for minor — use _triadIntervals
  '7th':   [10, 11],             // minor 7th / major 7th (added to triad)
  '9th':   [14],                 // 9th = octave + 2nd (added to 7th chord)
  sus2:    [0, 2, 7],
  sus4:    [0, 5, 7],
  add9:    [0, 4, 7, 14],        // or [0, 3, 7, 14] for minor
  power:   [0, 7, 12],
};

// MIDI note number → frequency (A4 = 69 = 440Hz)
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// --- Palette definitions ---
var PALETTES = [
  {
    name: 'dark_techno',
    bpmRange: [125, 140],
    scale: 'minorPentatonic',
    rootNote: null,

    groove: { swing: 0.0, humanize: 3 },  // ms: dead straight, mechanical
    polyrhythms: [
      { steps: 12, hits: 5, freq: 600, wave: 'triangle', decay: 0.04, vel: 0.30, phase: 'storm', pan: -0.3 },
      { steps: 20, hits: 7, freq: 900, wave: 'sine',     decay: 0.03, vel: 0.25, phase: 'maelstrom', pan: 0.3 },
    ],
    drums: {
      kick:  { wave: 'sine', freq: 55, decay: 0.3, pattern: 'four_on_floor',
               fills: ['fill_kick_drop', 'fill_kick_synco', 'fill_kick_build', 'fill_kick_double'] },
      snare: { wave: 'noise', freq: 200, decay: 0.15, pattern: 'backbeat',
               fills: ['fill_snare_shift', 'fill_snare_mini', 'fill_snare_flam', 'fill_snare_roll'] },
      hat:   { wave: 'noise', freq: 8000, decay: 0.03, pattern: 'offbeat_8th',
               fills: ['fill_hat_drop', 'fill_hat_mini', 'fill_hat_open_close', 'fill_hat_roll'] },
      perc:  { wave: 'triangle', freq: 800, decay: 0.05, pattern: 'euclidean_5_8' },
    },

    bass: {
      wave: 'sawtooth',
      octave: 2,
      patterns: ['root_pump', 'octave_bounce', 'fifth_walk'],
      filterCutoff: 400,
      filterResonance: 8,
    },

    pad: {
      wave: 'triangle',
      octave: 4,
      attack: 0.8,
      release: 1.2,
      detune: 12,
    },

    voiceConfig: {
      wave: 'square',
      octave: 5,
      attack: 0.01,
      decay: 0.15,
      filterSweep: true,
    },

    effects: {
      reverb: 0.3,
      delay: { time: '8n', feedback: 0.25 },
      distortion: 0,
      sidechain: 0.6,
      // Per-phase FX profiles (SPEC_016 §7)
      phases: {
        pulse:     { reverbSend: 0.15, delaySend: 0.10, delayTime: '8n', delayFb: 0.15, dist: 0,  sidechainMult: 1.0 },
        swell:     { reverbSend: 0.25, delaySend: 0.18, delayTime: '8n', delayFb: 0.25, dist: 0,  sidechainMult: 1.0 },
        surge:     { reverbSend: 0.30, delaySend: 0.22, delayTime: '8n', delayFb: 0.30, dist: 5,  sidechainMult: 1.1 },
        storm:     { reverbSend: 0.40, delaySend: 0.28, delayTime: '16n', delayFb: 0.35, dist: 10, sidechainMult: 1.2 },
        maelstrom: { reverbSend: 0.55, delaySend: 0.35, delayTime: '16n', delayFb: 0.40, dist: 15, sidechainMult: 1.3 },
      },
    },

    chordProgressions: [
      {
        A: ['i', 'VI', 'III', 'VII'],
        B: ['iv', 'i', 'v', 'III'],
        C: ['bVI', 'bVII', 'i', 'v'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'default',
      },
      {
        A: ['i', 'iv', 'v', 'i'],
        B: ['VI', 'III', 'VII', 'iv'],
        C: ['i', 'bVII', 'v', 'i'],
        form: ['A', 'A', 'B', 'C'],
        phase: 'default',
      },
      {
        A: ['i', 'VII', 'VI', 'v'],
        B: ['iv', 'VII', 'III', 'i'],
        C: ['bVI', 'iv', 'v', 'i'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'storm',
      },
    ],

    melodyRhythm: {
      subdivide: 'beat',         // quarter notes — hypnotic, on-grid
      swingInherit: false,       // dead straight
      humanizeInherit: false,
      holdProbability: 0.15,     // mostly new notes — repetitive
      restStyle: 'even',         // floating entry OK for techno
    },

    voicing: {
      padDefault: 'triad',
      bassVoicing: 'root',
      allowSus: true,
      allow9th: false,
      preferOpen: false,
    },

    // Stagger: tight mechanical (SPEC_010 §3)
    stagger: { rhythm: 0, harmony: 2, texture: 4, melody: 4, window: 4 },
  },

  {
    name: 'synthwave',
    bpmRange: [100, 120],
    scale: 'majorPentatonic',
    rootNote: null,

    groove: { swing: 0.15, humanize: 8 },  // ms: subtle shuffle, retro feel
    polyrhythms: [
      { steps: 12, hits: 4, freq: 500, wave: 'triangle', decay: 0.05, vel: 0.28, phase: 'storm', pan: -0.25 },
      { steps: 20, hits: 8, freq: 800, wave: 'sine',     decay: 0.04, vel: 0.22, phase: 'maelstrom', pan: 0.25 },
    ],
    drums: {
      kick:  { wave: 'sine', freq: 50, decay: 0.35, pattern: 'four_on_floor',
               fills: ['fill_kick_drop', 'fill_kick_synco', 'fill_kick_build', 'fill_kick_double'] },
      snare: { wave: 'noise', freq: 180, decay: 0.2, pattern: 'backbeat',
               fills: ['fill_snare_shift', 'fill_snare_mini', 'fill_snare_roll', 'fill_snare_flam'] },
      hat:   { wave: 'noise', freq: 7000, decay: 0.04, pattern: 'straight_8th',
               fills: ['fill_hat_mini', 'fill_hat_open_close', 'fill_hat_roll', 'fill_hat_drop'] },
      perc:  { wave: 'sine', freq: 1200, decay: 0.04, pattern: 'euclidean_3_8' },
    },

    bass: {
      wave: 'sawtooth',
      octave: 2,
      patterns: ['root_pump', 'octave_bounce'],
      filterCutoff: 600,
      filterResonance: 5,
    },

    pad: {
      wave: 'triangle',
      octave: 4,
      attack: 1.0,
      release: 1.5,
      detune: 10,
    },

    voiceConfig: {
      wave: 'sawtooth',
      octave: 5,
      attack: 0.02,
      decay: 0.25,
      filterSweep: true,
    },

    effects: {
      reverb: 0.45,
      delay: { time: '8n', feedback: 0.3 },
      distortion: 0,
      sidechain: 0.4,
      phases: {
        pulse:     { reverbSend: 0.25, delaySend: 0.12, delayTime: '8n', delayFb: 0.20, dist: 0,  sidechainMult: 1.0 },
        swell:     { reverbSend: 0.35, delaySend: 0.20, delayTime: '8n', delayFb: 0.28, dist: 0,  sidechainMult: 1.0 },
        surge:     { reverbSend: 0.45, delaySend: 0.25, delayTime: '8n', delayFb: 0.32, dist: 0,  sidechainMult: 1.05 },
        storm:     { reverbSend: 0.50, delaySend: 0.28, delayTime: '16n', delayFb: 0.35, dist: 5,  sidechainMult: 1.1 },
        maelstrom: { reverbSend: 0.58, delaySend: 0.32, delayTime: '16n', delayFb: 0.40, dist: 8,  sidechainMult: 1.15 },
      },
    },

    chordProgressions: [
      {
        A: ['I', 'V', 'vi', 'IV'],
        B: ['I', 'IV', 'ii', 'V'],
        C: ['vi', 'IV', 'bVII', 'I'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'default',
      },
      {
        A: ['I', 'IV', 'V', 'I'],
        B: ['vi', 'ii', 'V', 'I'],
        C: ['IV', 'iv', 'I', 'V'],
        form: ['A', 'A', 'B', 'C'],
        phase: 'default',
      },
      {
        A: ['vi', 'IV', 'I', 'V'],
        B: ['ii', 'V', 'vi', 'IV'],
        C: ['bVI', 'bVII', 'I', 'V'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'storm',
      },
    ],

    melodyRhythm: {
      subdivide: 'beat',         // steady quarter notes — singable
      swingInherit: false,       // on-grid synthwave
      humanizeInherit: false,
      holdProbability: 0.25,     // held notes for anthem feel
      restStyle: 'even',         // floating entry OK
    },

    voicing: {
      padDefault: 'add9',
      bassVoicing: 'root',
      allowSus: true,
      allow9th: true,
      preferOpen: true,
    },

    // Stagger: cinematic build, melody enters last (SPEC_010 §3)
    stagger: { rhythm: 0, harmony: 2, texture: 4, melody: 6, window: 6 },
  },
  {
    name: 'glitch',
    bpmRange: [130, 160],
    scale: 'wholeTone',
    rootNote: null,

    groove: { swing: 0.0, humanize: 15 },  // ms: straight grid but sloppy — intentionally unstable
    polyrhythms: [
      { steps: 12, hits: 7, freq: 1200, wave: 'square', decay: 0.02, vel: 0.32, phase: 'storm', pan: -0.35 },
      { steps: 20, hits: 9, freq: 1500, wave: 'sawtooth', decay: 0.02, vel: 0.28, phase: 'maelstrom', pan: 0.35 },
    ],
    drums: {
      kick:  { wave: 'sine', freq: 60, decay: 0.18, pattern: 'glitch_kick',
               fills: ['fill_kick_synco', 'fill_kick_drop', 'fill_kick_double', 'fill_kick_build'] },
      snare: { wave: 'noise', freq: 300, decay: 0.08, pattern: 'glitch_snare',
               fills: ['fill_snare_mini', 'fill_snare_shift', 'fill_snare_roll', 'fill_snare_flam'] },
      hat:   { wave: 'noise', freq: 10000, decay: 0.02, pattern: 'glitch_hat',
               fills: ['fill_hat_roll', 'fill_hat_drop', 'fill_hat_open_close', 'fill_hat_mini'] },
      perc:  { wave: 'square', freq: 1500, decay: 0.03, pattern: 'euclidean_7_16' },
    },

    bass: {
      wave: 'square',
      octave: 2,
      patterns: ['stutter_bass', 'root_pump'],
      filterCutoff: 300,
      filterResonance: 12,
    },

    pad: {
      wave: 'triangle',
      octave: 3,
      attack: 0.4,
      release: 0.6,
      detune: 12,
    },

    voiceConfig: {
      wave: 'sawtooth',
      octave: 5,
      attack: 0.005,
      decay: 0.08,
      filterSweep: true,
    },

    effects: {
      reverb: 0.2,
      delay: { time: '16n', feedback: 0.35 },
      distortion: 20,
      sidechain: 0.3,
      phases: {
        pulse:     { reverbSend: 0.10, delaySend: 0.15, delayTime: '16n', delayFb: 0.20, dist: 5,  sidechainMult: 1.0 },
        swell:     { reverbSend: 0.15, delaySend: 0.22, delayTime: '16n', delayFb: 0.28, dist: 10, sidechainMult: 1.0 },
        surge:     { reverbSend: 0.20, delaySend: 0.28, delayTime: '16n', delayFb: 0.32, dist: 15, sidechainMult: 1.1 },
        storm:     { reverbSend: 0.25, delaySend: 0.32, delayTime: '16n', delayFb: 0.38, dist: 22, sidechainMult: 1.2 },
        maelstrom: { reverbSend: 0.30, delaySend: 0.35, delayTime: '16n', delayFb: 0.42, dist: 30, sidechainMult: 1.3 },
      },
    },

    chordProgressions: [
      {
        A: ['i', 'II', 'iii', 'IV'],
        B: ['V', 'iii', 'i', 'II'],
        C: ['IV', 'bVII', 'II', 'i'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'default',
      },
      {
        A: ['i', 'iii', 'V', 'VII'],
        B: ['II', 'IV', 'i', 'iii'],
        C: ['bVI', 'V', 'II', 'i'],
        form: ['A', 'A', 'B', 'C'],
        phase: 'default',
      },
      {
        A: ['i', 'II', 'V', 'i'],
        B: ['iii', 'VII', 'IV', 'II'],
        C: ['bVII', 'bVI', 'V', 'i'],
        form: ['A', 'B', 'B', 'C'],
        phase: 'storm',
      },
    ],

    melodyRhythm: {
      subdivide: '16th',         // rapid bursts — glitchy
      swingInherit: false,       // grid-locked
      humanizeInherit: false,
      holdProbability: 0.10,     // tight, minimal holds
      restStyle: 'rhythmic',     // bar-aligned starts
    },

    voicing: {
      padDefault: 'triad',
      bassVoicing: 'root',
      allowSus: false,
      allow9th: false,
      preferOpen: false,
    },

    // Stagger: chaotic, near-instant (SPEC_010 §3)
    stagger: { rhythm: 0, harmony: 1, texture: 1, melody: 2, window: 2 },
  },

  {
    name: 'ambient_dread',
    bpmRange: [80, 100],
    scale: 'locrian',
    rootNote: null,

    groove: { swing: 0.25, humanize: 12 },  // ms: lazy, behind the beat, dragging
    polyrhythms: [
      { steps: 12, hits: 3, freq: 220, wave: 'sine', decay: 0.08, vel: 0.22, phase: 'storm', pan: -0.2 },
      { steps: 20, hits: 5, freq: 330, wave: 'triangle', decay: 0.06, vel: 0.18, phase: 'maelstrom', pan: 0.2 },
    ],
    drums: {
      kick:  { wave: 'sine', freq: 45, decay: 0.5, pattern: 'sparse_kick',
               fills: ['fill_kick_drop', 'fill_kick_synco', 'fill_kick_build', 'fill_kick_double'] },
      snare: { wave: 'noise', freq: 150, decay: 0.25, pattern: 'ghost_snare',
               fills: ['fill_snare_shift', 'fill_snare_mini', 'fill_snare_flam', 'fill_snare_roll'] },
      hat:   { wave: 'noise', freq: 6000, decay: 0.06, pattern: 'slow_hat',
               fills: ['fill_hat_drop', 'fill_hat_mini', 'fill_hat_open_close', 'fill_hat_roll'] },
      perc:  { wave: 'sine', freq: 280, decay: 0.08, pattern: 'euclidean_3_8' },
    },

    bass: {
      wave: 'sine',
      octave: 1,
      patterns: ['drone_root'],
      filterCutoff: 200,
      filterResonance: 3,
    },

    pad: {
      wave: 'sine',
      octave: 3,
      attack: 2.0,
      release: 2.5,
      detune: 8,
    },

    voiceConfig: {
      wave: 'sine',
      octave: 5,
      attack: 0.05,
      decay: 0.4,
      filterSweep: false,
    },

    effects: {
      reverb: 0.7,
      delay: { time: '4n', feedback: 0.4 },
      distortion: 0,
      sidechain: 0.2,
      phases: {
        pulse:     { reverbSend: 0.40, delaySend: 0.15, delayTime: '4n', delayFb: 0.25, dist: 0, sidechainMult: 1.0 },
        swell:     { reverbSend: 0.50, delaySend: 0.22, delayTime: '4n', delayFb: 0.32, dist: 0, sidechainMult: 1.0 },
        surge:     { reverbSend: 0.60, delaySend: 0.28, delayTime: '8n', delayFb: 0.35, dist: 0, sidechainMult: 1.0 },
        storm:     { reverbSend: 0.60, delaySend: 0.30, delayTime: '8n', delayFb: 0.35, dist: 3, sidechainMult: 1.05 },
        maelstrom: { reverbSend: 0.65, delaySend: 0.35, delayTime: '8n', delayFb: 0.40, dist: 5, sidechainMult: 1.1 },
      },
    },

    chordProgressions: [
      {
        A: ['i', 'ii', 'v', 'i'],
        B: ['vi', 'iii', 'iv', 'i'],
        C: ['bVI', 'v', 'ii', 'i'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'default',
      },
      {
        A: ['i', 'vi', 'iii', 'v'],
        B: ['iv', 'ii', 'v', 'i'],
        C: ['bII', 'v', 'iv', 'i'],
        form: ['A', 'A', 'B', 'C'],
        phase: 'default',
      },
      {
        A: ['i', 'iv', 'vii', 'i'],
        B: ['ii', 'v', 'vi', 'iii'],
        C: ['bVI', 'bVII', 'v', 'i'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'storm',
      },
    ],

    melody: {
      attack: 0.15,        // very slow bloom — eerie drift
      release: 0.5,        // long tail
      vibratoRate: 3.5,    // Hz — slow vibrato = eerie
    },

    melodyRhythm: {
      subdivide: 'beat',         // sparse, floating
      swingInherit: true,        // match drum feel
      humanizeInherit: true,
      holdProbability: 0.50,     // long holds — lots of space
      restStyle: 'even',         // floating entry = ethereal
    },

    voicing: {
      padDefault: 'triad',
      bassVoicing: 'root',
      allowSus: true,
      allow9th: true,
      preferOpen: true,
    },

    // Stagger: glacial drift, maximum spread (SPEC_010 §3)
    stagger: { rhythm: 0, harmony: 4, texture: 8, melody: 12, window: 12 },
  },

  // ── lo-fi_chill (SPEC_019 §1.1) ──────────────────────────────────────────
  {
    name: 'lo_fi_chill',
    bpmRange: [75, 90],
    scale: 'majorPentatonic',
    rootNote: null,

    groove: { swing: 0.3, humanize: 10 },  // ms: lazy, behind-beat lo-fi feel
    polyrhythms: [
      { steps: 12, hits: 3, freq: 400, wave: 'sine', decay: 0.06, vel: 0.18, phase: 'storm', pan: -0.15 },
      { steps: 20, hits: 5, freq: 700, wave: 'triangle', decay: 0.05, vel: 0.15, phase: 'maelstrom', pan: 0.15 },
    ],
    drums: {
      kick:  { wave: 'sine', freq: 50, decay: 0.35, pattern: 'lo_fi_kick',
               fills: ['fill_kick_drop', 'fill_kick_synco', 'fill_kick_build', 'fill_kick_double'] },
      snare: { wave: 'noise', freq: 180, decay: 0.2, pattern: 'lo_fi_snare',
               fills: ['fill_snare_mini', 'fill_snare_shift', 'fill_snare_flam', 'fill_snare_roll'] },
      hat:   { wave: 'noise', freq: 7000, decay: 0.05, pattern: 'lo_fi_hat',
               fills: ['fill_hat_mini', 'fill_hat_drop', 'fill_hat_open_close', 'fill_hat_roll'] },
      perc:  { wave: 'triangle', freq: 400, decay: 0.06, pattern: 'euclidean_3_8' },
    },

    bass: {
      wave: 'sine',
      octave: 2,
      patterns: ['root_pump', 'fifth_walk'],
      filterCutoff: 300,
      filterResonance: 3,
    },

    pad: {
      wave: 'sine',
      octave: 4,
      attack: 1.5,
      release: 2.0,
      detune: 6,
    },

    voiceConfig: {
      wave: 'sine',
      octave: 5,
      attack: 0.03,
      decay: 0.3,
      filterSweep: false,
    },

    effects: {
      reverb: 0.4,
      delay: { time: '8n', feedback: 0.35 },
      distortion: 0,
      sidechain: 0.2,
      phases: {
        pulse:     { reverbSend: 0.35, delaySend: 0.25, delayTime: '8n', delayFb: 0.30, dist: 0,  sidechainMult: 1.0 },
        swell:     { reverbSend: 0.40, delaySend: 0.28, delayTime: '8n', delayFb: 0.32, dist: 0,  sidechainMult: 1.0 },
        surge:     { reverbSend: 0.45, delaySend: 0.30, delayTime: '8n', delayFb: 0.35, dist: 0,  sidechainMult: 1.0 },
        storm:     { reverbSend: 0.50, delaySend: 0.32, delayTime: '8n', delayFb: 0.38, dist: 0,  sidechainMult: 1.05 },
        maelstrom: { reverbSend: 0.55, delaySend: 0.35, delayTime: '8n', delayFb: 0.40, dist: 0,  sidechainMult: 1.1 },
      },
    },

    chordProgressions: [
      {
        A: ['ii', 'V', 'I', 'vi'],
        B: ['IV', 'iii', 'vi', 'V'],
        C: ['ii', 'bVII', 'I', 'IV'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'default',
      },
      {
        A: ['I', 'vi', 'ii', 'V'],
        B: ['IV', 'I', 'ii', 'vi'],
        C: ['I', 'IV', 'bVII', 'I'],
        form: ['A', 'A', 'B', 'C'],
        phase: 'default',
      },
      {
        A: ['ii', 'V', 'vi', 'IV'],
        B: ['I', 'bVII', 'IV', 'V'],
        C: ['ii', 'IV', 'I', 'vi'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'storm',
      },
    ],

    melodyRhythm: {
      subdivide: '8th',          // gentle 8th-note feel
      swingInherit: true,        // behind-the-beat swing
      humanizeInherit: true,
      holdProbability: 0.35,     // moderate holds — laid-back
      restStyle: 'rhythmic',     // bar-aligned phrases
    },

    voicing: {
      padDefault: 'add9',
      bassVoicing: 'root',
      allowSus: true,
      allow9th: true,
      preferOpen: true,
    },

    // Special: vinyl crackle texture (continuous quiet noise)
    special: 'vinyl_crackle',

    // Stagger: lazy, unhurried drift (SPEC_010 §3)
    stagger: { rhythm: 0, harmony: 2, texture: 6, melody: 8, window: 8 },
  },

  // ── chiptune (SPEC_019 §1.3) ─────────────────────────────────────────────
  {
    name: 'chiptune',
    bpmRange: [140, 170],
    scale: 'major',
    rootNote: null,

    groove: { swing: 0.0, humanize: 0 },  // ms: ZERO humanization — perfect grid, authentic chip
    polyrhythms: [
      { steps: 12, hits: 5, freq: 800, wave: 'square', decay: 0.02, vel: 0.25, phase: 'storm', pan: -0.2 },
      { steps: 20, hits: 7, freq: 1200, wave: 'square', decay: 0.015, vel: 0.20, phase: 'maelstrom', pan: 0.2 },
    ],
    drums: {
      kick:  { wave: 'sine', freq: 80, decay: 0.12, pattern: 'four_on_floor',
               fills: ['fill_kick_build', 'fill_kick_double', 'fill_kick_synco', 'fill_kick_drop'] },
      snare: { wave: 'noise', freq: 500, decay: 0.06, pattern: 'chiptune_snare',
               fills: ['fill_snare_roll', 'fill_snare_mini', 'fill_snare_flam', 'fill_snare_shift'] },
      hat:   { wave: 'noise', freq: 12000, decay: 0.01, pattern: 'straight_8th',
               fills: ['fill_hat_roll', 'fill_hat_mini', 'fill_hat_drop', 'fill_hat_open_close'] },
      perc:  { wave: 'square', freq: 1000, decay: 0.03, pattern: 'euclidean_5_8' },
    },

    bass: {
      wave: 'square',
      octave: 2,
      patterns: ['octave_bounce', 'fifth_walk'],
      filterCutoff: 800,
      filterResonance: 2,
    },

    pad: {
      wave: 'square',
      octave: 4,
      attack: 0.01,
      release: 0.1,
      detune: 0,
    },

    voiceConfig: {
      wave: 'square',
      octave: 6,
      attack: 0.005,
      decay: 0.05,
      filterSweep: false,
    },

    effects: {
      reverb: 0.0,
      delay: { time: '16n', feedback: 0.0 },
      distortion: 0,
      sidechain: 0.3,
      phases: {
        pulse:     { reverbSend: 0.00, delaySend: 0.00, delayTime: '16n', delayFb: 0.00, dist: 0,  sidechainMult: 1.0 },
        swell:     { reverbSend: 0.00, delaySend: 0.00, delayTime: '16n', delayFb: 0.00, dist: 0,  sidechainMult: 1.0 },
        surge:     { reverbSend: 0.05, delaySend: 0.05, delayTime: '16n', delayFb: 0.10, dist: 0,  sidechainMult: 1.1 },
        storm:     { reverbSend: 0.10, delaySend: 0.10, delayTime: '16n', delayFb: 0.15, dist: 3,  sidechainMult: 1.2 },
        maelstrom: { reverbSend: 0.30, delaySend: 0.20, delayTime: '8n',  delayFb: 0.25, dist: 5,  sidechainMult: 1.3 },
      },
    },

    chordProgressions: [
      {
        A: ['I', 'IV', 'V', 'I'],
        B: ['vi', 'IV', 'V', 'I'],
        C: ['I', 'V', 'vi', 'IV'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'default',
      },
      {
        A: ['I', 'V', 'vi', 'IV'],
        B: ['I', 'IV', 'ii', 'V'],
        C: ['vi', 'V', 'IV', 'I'],
        form: ['A', 'A', 'B', 'C'],
        phase: 'default',
      },
      {
        A: ['I', 'vi', 'IV', 'V'],
        B: ['IV', 'V', 'I', 'vi'],
        C: ['bVI', 'bVII', 'I', 'V'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'storm',
      },
    ],

    melody: {
      attack: 0.005,       // instant on — chip character
      release: 0.02,       // instant off
      vibratoDepth: 0,     // no vibrato — mechanical
      lpfCutoff: 6000,     // bright — cut through
    },

    melodyRhythm: {
      subdivide: '8th',          // crisp 8th-note runs — NES lead
      swingInherit: false,       // grid-locked
      humanizeInherit: false,
      holdProbability: 0.10,     // minimal holds — tight runs
      restStyle: 'rhythmic',     // bar-aligned phrases
    },

    voicing: {
      padDefault: 'triad',
      bassVoicing: 'root',
      allowSus: false,
      allow9th: false,
      preferOpen: false,
    },

    // Stagger: snappy 8-bit, fast transitions (SPEC_010 §3)
    stagger: { rhythm: 0, harmony: 1, texture: 1, melody: 2, window: 2 },
  },

  // ── noir_jazz (SPEC_019 §1.4) ──────────────────────────────────────────
  {
    name: 'noir_jazz',
    bpmRange: [85, 105],
    scale: 'harmonicMinor',
    rootNote: null,

    groove: { swing: 0.4, humanize: 12 },  // ms: heavy swing, behind-the-beat
    polyrhythms: [
      { steps: 12, hits: 3, freq: 500, wave: 'sine', decay: 0.08, vel: 0.15, phase: 'storm', pan: -0.2 },
      { steps: 20, hits: 5, freq: 350, wave: 'triangle', decay: 0.1, vel: 0.12, phase: 'maelstrom', pan: 0.2 },
    ],
    drums: {
      kick:  { wave: 'sine', freq: 50, decay: 0.3, pattern: 'jazz_kick',
               fills: ['fill_kick_drop', 'fill_kick_synco', 'fill_kick_build', 'fill_kick_double'],
               // Jazz brush-kick: very soft sine, long decay, no pitch sweep. Almost a thump.
               synth: function(t, vel, cfg) {
                 if (!audioCtx) return;
                 var tg = (typeof _trackGains !== 'undefined' && _trackGains.kick) || submixGain;
                 var g = audioCtx.createGain();
                 g.gain.setValueAtTime(vel * 0.35, t);
                 g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                 var osc = audioCtx.createOscillator();
                 osc.type = 'sine';
                 osc.frequency.setValueAtTime(cfg.freq, t);
                 // Gentle LP filter for brush warmth
                 var lp = audioCtx.createBiquadFilter();
                 lp.type = 'lowpass';
                 lp.frequency.setValueAtTime(300, t);
                 osc.connect(lp);
                 lp.connect(g);
                 g.connect(tg);
                 osc.start(t);
                 osc.stop(t + 0.45);
               },
             },
      snare: { wave: 'noise', freq: 200, decay: 0.15, pattern: 'jazz_snare',
               fills: ['fill_snare_mini', 'fill_snare_flam', 'fill_snare_shift', 'fill_snare_roll'],
               // Jazz brush sweep: filtered noise with resonance, simulates brush on snare head.
               synth: function(t, vel, cfg) {
                 if (!audioCtx) return;
                 var tg = (typeof _trackGains !== 'undefined' && _trackGains.snare) || submixGain;
                 var g = audioCtx.createGain();
                 g.gain.setValueAtTime(vel * 0.30, t);
                 g.gain.exponentialRampToValueAtTime(0.001, t + cfg.decay + 0.1);
                 // Noise source
                 var buf = (typeof _getNoiseBuffer === 'function') ? _getNoiseBuffer() : null;
                 if (!buf) return;
                 var src = audioCtx.createBufferSource();
                 src.buffer = buf;
                 // Bandpass filter: brush sweep centered at freq, narrow Q
                 var bp = audioCtx.createBiquadFilter();
                 bp.type = 'bandpass';
                 bp.frequency.setValueAtTime(cfg.freq * 0.8, t);
                 bp.frequency.linearRampToValueAtTime(cfg.freq * 2.5, t + cfg.decay);  // sweep up
                 bp.Q.setValueAtTime(2.5, t);
                 src.connect(bp);
                 bp.connect(g);
                 g.connect(tg);
                 src.start(t);
                 src.stop(t + cfg.decay + 0.15);
               },
             },
      hat:   { wave: 'noise', freq: 8000, decay: 0.04, pattern: 'jazz_ride',
               fills: ['fill_hat_mini', 'fill_hat_drop', 'fill_hat_open_close', 'fill_hat_roll'],
               // Jazz ride: longer decay, bell-like tonal component + shimmer noise.
               synth: function(t, vel, cfg) {
                 if (!audioCtx) return;
                 var tg = (typeof _trackGains !== 'undefined' && _trackGains.hat) || submixGain;
                 // Bell tone (sine at ~3kHz)
                 var bellG = audioCtx.createGain();
                 bellG.gain.setValueAtTime(vel * 0.15, t);
                 bellG.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                 var bell = audioCtx.createOscillator();
                 bell.type = 'sine';
                 bell.frequency.setValueAtTime(3200, t);
                 bell.connect(bellG);
                 bellG.connect(tg);
                 bell.start(t);
                 bell.stop(t + 0.15);
                 // Shimmer noise (highpass filtered)
                 var buf = (typeof _getNoiseBuffer === 'function') ? _getNoiseBuffer() : null;
                 if (!buf) return;
                 var nG = audioCtx.createGain();
                 nG.gain.setValueAtTime(vel * 0.12, t);
                 nG.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                 var src = audioCtx.createBufferSource();
                 src.buffer = buf;
                 var hp = audioCtx.createBiquadFilter();
                 hp.type = 'highpass';
                 hp.frequency.setValueAtTime(6000, t);
                 src.connect(hp);
                 hp.connect(nG);
                 nG.connect(tg);
                 src.start(t);
                 src.stop(t + 0.10);
               },
             },
      perc:  { wave: 'noise', freq: 500, decay: 0.08, pattern: 'euclidean_3_8' },
    },

    bass: {
      wave: 'sine',
      octave: 2,
      patterns: ['jazz_walk', 'fifth_walk'],
      filterCutoff: 500,
      filterResonance: 4,
    },

    pad: {
      wave: 'sine',
      octave: 3,
      attack: 0.6,
      release: 1.5,
      detune: 4,
    },

    voiceConfig: {
      wave: 'sine',
      octave: 5,
      attack: 0.02,
      decay: 0.25,
      filterSweep: false,
    },

    effects: {
      reverb: 0.35,
      delay: { time: '4n', feedback: 0.2 },
      distortion: 0,
      sidechain: 0.15,
      phases: {
        pulse:     { reverbSend: 0.30, delaySend: 0.08, delayTime: '4n', delayFb: 0.18, dist: 0,  sidechainMult: 1.0 },
        swell:     { reverbSend: 0.35, delaySend: 0.10, delayTime: '4n', delayFb: 0.20, dist: 0,  sidechainMult: 1.0 },
        surge:     { reverbSend: 0.40, delaySend: 0.12, delayTime: '4n', delayFb: 0.22, dist: 0,  sidechainMult: 1.0 },
        storm:     { reverbSend: 0.45, delaySend: 0.15, delayTime: '4n', delayFb: 0.25, dist: 0,  sidechainMult: 1.05 },
        maelstrom: { reverbSend: 0.55, delaySend: 0.20, delayTime: '4n', delayFb: 0.30, dist: 0,  sidechainMult: 1.1 },
      },
    },

    chordProgressions: [
      {
        A: ['i7', 'iv7', 'V7', 'i7'],
        B: ['bVI7', 'bII7', 'V7', 'i7'],
        C: ['ii7b5', 'V7', 'i7', 'iv7'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'default',
      },
      {
        A: ['i7', 'bVI7', 'bII7', 'V7'],
        B: ['iv7', 'bVII', 'i7', 'V7'],
        C: ['ii7b5', 'V7', 'bVI7', 'i7'],
        form: ['A', 'A', 'B', 'C'],
        phase: 'default',
      },
      {
        A: ['i7', 'iv7', 'bII7', 'V7'],
        B: ['bVI7', 'V7', 'i7', 'bII7'],
        C: ['ii7b5', 'bVI7', 'V7', 'i7'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'storm',
      },
    ],

    melody: {
      attack: 0.12,        // slower attack = breath
      vibratoDepth: 4,     // wider vibrato = expressive
      vibratoRate: 4.5,    // Hz
      lpfCutoff: 2000,     // dark filter = intimate
    },

    melodyRhythm: {
      subdivide: '8th',          // swung 8ths — jazz phrasing
      swingInherit: true,        // match drum swing
      humanizeInherit: true,
      holdProbability: 0.40,     // held notes — space and breath
      restStyle: 'rhythmic',     // bar-aligned phrase starts
    },

    voicing: {
      padDefault: '9th',
      bassVoicing: 'root',
      allowSus: true,
      allow9th: true,
      preferOpen: true,
    },

    // Stagger: smoky patience, bass walks in then sax (SPEC_010 §3)
    stagger: { rhythm: 0, harmony: 4, texture: 6, melody: 8, window: 8 },
  },

  // ── industrial (SPEC_019 §1.2) ──────────────────────────────────────────
  {
    name: 'industrial',
    bpmRange: [130, 145],
    scale: 'phrygian',
    rootNote: null,

    groove: { swing: 0.0, humanize: 2 },  // ms: hyper-quantized, robotic
    polyrhythms: [
      { steps: 12, hits: 7, freq: 2000, wave: 'sawtooth', decay: 0.02, vel: 0.30, phase: 'storm', pan: -0.4 },
      { steps: 20, hits: 9, freq: 3000, wave: 'sawtooth', decay: 0.015, vel: 0.25, phase: 'maelstrom', pan: 0.4 },
    ],
    drums: {
      kick:  { wave: 'sine', freq: 45, decay: 0.25, pattern: 'industrial_kick',
               fills: ['fill_kick_build', 'fill_kick_double', 'fill_kick_synco', 'fill_kick_drop'],
               // Industrial kick: layered — sine sub + distorted square mid + noise transient.
               synth: function(t, vel, cfg) {
                 if (!audioCtx) return;
                 var tg = (typeof _trackGains !== 'undefined' && _trackGains.kick) || submixGain;
                 // Layer 1: sine sub
                 var subG = audioCtx.createGain();
                 subG.gain.setValueAtTime(vel * 0.55, t);
                 subG.gain.exponentialRampToValueAtTime(0.001, t + cfg.decay);
                 var sub = audioCtx.createOscillator();
                 sub.type = 'sine';
                 sub.frequency.setValueAtTime(cfg.freq * 2, t);
                 sub.frequency.exponentialRampToValueAtTime(cfg.freq, t + 0.04);
                 sub.connect(subG);
                 subG.connect(tg);
                 sub.start(t);
                 sub.stop(t + cfg.decay + 0.05);
                 // Layer 2: distorted square mid (waveshaper)
                 var midG = audioCtx.createGain();
                 midG.gain.setValueAtTime(vel * 0.35, t);
                 midG.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                 var mid = audioCtx.createOscillator();
                 mid.type = 'square';
                 mid.frequency.setValueAtTime(120, t);
                 mid.frequency.exponentialRampToValueAtTime(60, t + 0.05);
                 var ws = audioCtx.createWaveShaper();
                 var c = new Float32Array(256);
                 for (var i = 0; i < 256; i++) { var x = (i / 128) - 1; c[i] = Math.tanh(x * 4); }
                 ws.curve = c;
                 mid.connect(ws);
                 ws.connect(midG);
                 midG.connect(tg);
                 mid.start(t);
                 mid.stop(t + 0.10);
                 // Layer 3: noise transient
                 var buf = (typeof _getNoiseBuffer === 'function') ? _getNoiseBuffer() : null;
                 if (buf) {
                   var nG = audioCtx.createGain();
                   nG.gain.setValueAtTime(vel * 0.20, t);
                   nG.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
                   var src = audioCtx.createBufferSource();
                   src.buffer = buf;
                   var hp = audioCtx.createBiquadFilter();
                   hp.type = 'highpass';
                   hp.frequency.setValueAtTime(2000, t);
                   src.connect(hp);
                   hp.connect(nG);
                   nG.connect(tg);
                   src.start(t);
                   src.stop(t + 0.03);
                 }
               },
             },
      snare: { wave: 'noise', freq: 350, decay: 0.12, pattern: 'industrial_snare',
               fills: ['fill_snare_roll', 'fill_snare_flam', 'fill_snare_mini', 'fill_snare_shift'],
               // Industrial snare: metallic clang — resonant BP noise + distorted sine ping.
               synth: function(t, vel, cfg) {
                 if (!audioCtx) return;
                 var tg = (typeof _trackGains !== 'undefined' && _trackGains.snare) || submixGain;
                 // Metallic noise body
                 var buf = (typeof _getNoiseBuffer === 'function') ? _getNoiseBuffer() : null;
                 if (buf) {
                   var nG = audioCtx.createGain();
                   nG.gain.setValueAtTime(vel * 0.45, t);
                   nG.gain.exponentialRampToValueAtTime(0.001, t + cfg.decay);
                   var src = audioCtx.createBufferSource();
                   src.buffer = buf;
                   var bp = audioCtx.createBiquadFilter();
                   bp.type = 'bandpass';
                   bp.frequency.setValueAtTime(cfg.freq, t);
                   bp.Q.setValueAtTime(8, t);  // high Q = metallic resonance
                   var ws = audioCtx.createWaveShaper();
                   var c = new Float32Array(256);
                   for (var i = 0; i < 256; i++) { var x = (i / 128) - 1; c[i] = Math.tanh(x * 3); }
                   ws.curve = c;
                   src.connect(bp);
                   bp.connect(ws);
                   ws.connect(nG);
                   nG.connect(tg);
                   src.start(t);
                   src.stop(t + cfg.decay + 0.05);
                 }
                 // Sine ping
                 var pG = audioCtx.createGain();
                 pG.gain.setValueAtTime(vel * 0.25, t);
                 pG.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
                 var ping = audioCtx.createOscillator();
                 ping.type = 'sine';
                 ping.frequency.setValueAtTime(cfg.freq * 3, t);
                 ping.connect(pG);
                 pG.connect(tg);
                 ping.start(t);
                 ping.stop(t + 0.06);
               },
             },
      hat:   { wave: 'noise', freq: 10000, decay: 0.015, pattern: 'industrial_hat',
               fills: ['fill_hat_roll', 'fill_hat_mini', 'fill_hat_drop', 'fill_hat_open_close'],
               // Industrial hat: metallic tick — very short, uniform, typewriter feel.
               synth: function(t, vel, cfg) {
                 if (!audioCtx) return;
                 var tg = (typeof _trackGains !== 'undefined' && _trackGains.hat) || submixGain;
                 var g = audioCtx.createGain();
                 g.gain.setValueAtTime(vel * 0.30, t);
                 g.gain.exponentialRampToValueAtTime(0.001, t + cfg.decay);
                 // Square ping at high freq = metallic tick
                 var osc = audioCtx.createOscillator();
                 osc.type = 'square';
                 osc.frequency.setValueAtTime(cfg.freq * 0.5, t);
                 var hp = audioCtx.createBiquadFilter();
                 hp.type = 'highpass';
                 hp.frequency.setValueAtTime(8000, t);
                 osc.connect(hp);
                 hp.connect(g);
                 g.connect(tg);
                 osc.start(t);
                 osc.stop(t + cfg.decay + 0.01);
               },
             },
      perc:  { wave: 'sawtooth', freq: 2000, decay: 0.02, pattern: 'euclidean_7_16' },
    },

    bass: {
      wave: 'sawtooth',
      octave: 1,
      patterns: ['root_pump', 'stutter_bass'],
      filterCutoff: 250,
      filterResonance: 15,
    },

    pad: {
      wave: 'sawtooth',
      octave: 4,
      attack: 0.3,
      release: 0.8,
      detune: 8,
    },

    voiceConfig: {
      wave: 'sawtooth',
      octave: 5,
      attack: 0.005,
      decay: 0.12,
      filterSweep: true,
    },

    effects: {
      reverb: 0.1,
      delay: { time: '16n', feedback: 0.2 },
      distortion: 15,
      sidechain: 0.7,
      phases: {
        pulse:     { reverbSend: 0.08, delaySend: 0.12, delayTime: '16n', delayFb: 0.18, dist: 12, sidechainMult: 1.0 },
        swell:     { reverbSend: 0.10, delaySend: 0.15, delayTime: '16n', delayFb: 0.20, dist: 15, sidechainMult: 1.1 },
        surge:     { reverbSend: 0.12, delaySend: 0.18, delayTime: '16n', delayFb: 0.22, dist: 18, sidechainMult: 1.2 },
        storm:     { reverbSend: 0.15, delaySend: 0.20, delayTime: '16n', delayFb: 0.25, dist: 22, sidechainMult: 1.3 },
        maelstrom: { reverbSend: 0.20, delaySend: 0.25, delayTime: '16n', delayFb: 0.30, dist: 28, sidechainMult: 1.5 },
      },
    },

    chordProgressions: [
      {
        A: ['i', 'bII', 'i', 'bII'],
        B: ['i', 'v', 'bVI', 'bII'],
        C: ['i', 'bII', 'bVII', 'v'],
        form: ['A', 'A', 'B', 'C'],
        phase: 'default',
      },
      {
        A: ['i', 'bVI', 'bII', 'i'],
        B: ['bVII', 'bVI', 'v', 'i'],
        C: ['i', 'bII', 'v', 'bVI'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'default',
      },
      {
        A: ['i', 'bII', 'bVII', 'bVI'],
        B: ['v', 'bVI', 'bII', 'i'],
        C: ['bVII', 'i', 'bII', 'v'],
        form: ['A', 'A', 'B', 'C'],
        phase: 'storm',
      },
    ],

    melody: {
      attack: 0.01,        // hard attack — mechanical
      vibratoDepth: 0,     // no vibrato — robotic
      lpfCutoff: 4000,     // brighter for aggression
    },

    melodyRhythm: {
      subdivide: '16th',         // machine-gun bursts
      swingInherit: false,       // mechanical grid
      humanizeInherit: false,
      holdProbability: 0.05,     // almost no holds — relentless
      restStyle: 'even',         // no bar alignment — cold
    },

    voicing: {
      padDefault: 'triad',
      bassVoicing: 'root',
      allowSus: false,
      allow9th: false,
      preferOpen: false,
    },

    // Stagger: harsh but controlled (SPEC_010 §3)
    stagger: { rhythm: 0, harmony: 2, texture: 2, melody: 4, window: 4 },
  },

  // ── vaporwave (SPEC_019 §1.5) ────────────────────────────────────────────
  {
    name: 'vaporwave',
    bpmRange: [70, 85],
    scale: 'lydian',
    rootNote: null,

    groove: { swing: 0.15, humanize: 15 },  // ms: sloppy, dreamlike
    polyrhythms: [
      { steps: 12, hits: 3, freq: 300, wave: 'sine', decay: 0.08, vel: 0.15, phase: 'storm', pan: -0.2 },
      { steps: 20, hits: 5, freq: 500, wave: 'triangle', decay: 0.06, vel: 0.12, phase: 'maelstrom', pan: 0.2 },
    ],
    drums: {
      kick:  { wave: 'sine', freq: 45, decay: 0.4, pattern: 'vaporwave_kick',
               fills: ['fill_kick_drop', 'fill_kick_build', 'fill_kick_synco', 'fill_kick_double'] },
      snare: { wave: 'noise', freq: 180, decay: 0.2, pattern: 'backbeat',
               fills: ['fill_snare_mini', 'fill_snare_flam', 'fill_snare_shift', 'fill_snare_roll'] },
      hat:   { wave: 'noise', freq: 6000, decay: 0.06, pattern: 'offbeat_8th',
               fills: ['fill_hat_mini', 'fill_hat_drop', 'fill_hat_open_close', 'fill_hat_roll'] },
      perc:  { wave: 'triangle', freq: 300, decay: 0.1, pattern: 'euclidean_3_8' },
    },

    bass: {
      wave: 'sine',
      octave: 2,
      patterns: ['drone_root', 'root_pump'],
      filterCutoff: 250,
      filterResonance: 5,
    },

    pad: {
      wave: 'sawtooth',
      octave: 4,
      attack: 2.5,
      release: 3.0,
      detune: 20,
    },

    voiceConfig: {
      wave: 'sine',
      octave: 5,
      attack: 0.03,
      decay: 0.3,
      filterSweep: false,
    },

    effects: {
      reverb: 0.6,
      delay: { time: '4n', feedback: 0.45 },
      distortion: 0,
      sidechain: 0.15,
      phases: {
        pulse:     { reverbSend: 0.55, delaySend: 0.35, delayTime: '4n', delayFb: 0.40, dist: 0, sidechainMult: 1.0 },
        swell:     { reverbSend: 0.60, delaySend: 0.38, delayTime: '4n', delayFb: 0.42, dist: 0, sidechainMult: 1.0 },
        surge:     { reverbSend: 0.63, delaySend: 0.40, delayTime: '4n', delayFb: 0.44, dist: 0, sidechainMult: 1.0 },
        storm:     { reverbSend: 0.65, delaySend: 0.42, delayTime: '4n', delayFb: 0.45, dist: 0, sidechainMult: 1.05 },
        maelstrom: { reverbSend: 0.70, delaySend: 0.45, delayTime: '4n', delayFb: 0.48, dist: 0, sidechainMult: 1.1 },
      },
    },

    chordProgressions: [
      {
        A: ['I', 'iii', 'IV', 'ii'],
        B: ['vi', 'IV', 'I', 'V'],
        C: ['I', '#IV', 'IV', 'I'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'default',
      },
      {
        A: ['I', 'V', 'vi', 'iii'],
        B: ['IV', 'ii', 'I', 'V'],
        C: ['I', '#IV', 'vi', 'IV'],
        form: ['A', 'A', 'B', 'C'],
        phase: 'default',
      },
      {
        A: ['I', 'iii', '#IV', 'ii'],
        B: ['vi', 'I', 'IV', 'V'],
        C: ['I', '#IV', 'V', 'I'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'storm',
      },
    ],

    melodyRhythm: {
      subdivide: 'beat',         // slow, dreamy quarter notes
      swingInherit: true,        // gentle swing feel
      humanizeInherit: true,
      holdProbability: 0.45,     // long holds — pitched-down feel
      restStyle: 'even',         // floating entry = dreamy
    },

    voicing: {
      padDefault: 'add9',
      bassVoicing: 'root',
      allowSus: true,
      allow9th: true,
      preferOpen: true,
    },

    // Special: pitch wobble — slow LFO ±10 cents on master detune
    special: 'pitch_wobble',

    // Stagger: dreamy, slowed, everything takes its time (SPEC_010 §3)
    stagger: { rhythm: 0, harmony: 4, texture: 8, melody: 10, window: 10 },
  },

  // ── breakbeat (SPEC_019 §1.6) ────────────────────────────────────────────
  {
    name: 'breakbeat',
    bpmRange: [155, 175],
    scale: 'minor',
    rootNote: null,

    groove: { swing: 0.0, humanize: 5 },  // ms: straight, tight
    polyrhythms: [
      { steps: 12, hits: 7, freq: 800, wave: 'sawtooth', decay: 0.03, vel: 0.25, phase: 'storm', pan: -0.3 },
      { steps: 20, hits: 11, freq: 1200, wave: 'sawtooth', decay: 0.02, vel: 0.22, phase: 'maelstrom', pan: 0.3 },
    ],
    drums: {
      kick:  { wave: 'sine', freq: 55, decay: 0.2, pattern: 'break_kick',
               fills: ['fill_kick_synco', 'fill_kick_double', 'fill_kick_build', 'fill_kick_drop'] },
      snare: { wave: 'noise', freq: 250, decay: 0.1, pattern: 'break_snare',
               fills: ['fill_snare_roll', 'fill_snare_flam', 'fill_snare_mini', 'fill_snare_shift'] },
      hat:   { wave: 'noise', freq: 9000, decay: 0.02, pattern: 'break_hat',
               fills: ['fill_hat_roll', 'fill_hat_mini', 'fill_hat_drop', 'fill_hat_open_close'] },
      perc:  { wave: 'sawtooth', freq: 800, decay: 0.04, pattern: 'euclidean_7_16' },
    },

    bass: {
      wave: 'sawtooth',
      octave: 1,
      patterns: ['stutter_bass', 'root_pump', 'octave_bounce'],
      filterCutoff: 350,
      filterResonance: 10,
    },

    pad: {
      wave: 'sawtooth',
      octave: 4,
      attack: 0.3,
      release: 0.8,
      detune: 8,
    },

    voiceConfig: {
      wave: 'sawtooth',
      octave: 5,
      attack: 0.005,
      decay: 0.1,
      filterSweep: true,
    },

    effects: {
      reverb: 0.15,
      delay: { time: '16n', feedback: 0.25 },
      distortion: 5,
      sidechain: 0.65,
      phases: {
        pulse:     { reverbSend: 0.12, delaySend: 0.18, delayTime: '16n', delayFb: 0.22, dist: 4, sidechainMult: 1.0 },
        swell:     { reverbSend: 0.15, delaySend: 0.20, delayTime: '16n', delayFb: 0.24, dist: 6, sidechainMult: 1.1 },
        surge:     { reverbSend: 0.18, delaySend: 0.22, delayTime: '16n', delayFb: 0.26, dist: 8, sidechainMult: 1.2 },
        storm:     { reverbSend: 0.22, delaySend: 0.25, delayTime: '16n', delayFb: 0.28, dist: 10, sidechainMult: 1.3 },
        maelstrom: { reverbSend: 0.28, delaySend: 0.30, delayTime: '16n', delayFb: 0.32, dist: 14, sidechainMult: 1.5 },
      },
    },

    chordProgressions: [
      {
        A: ['i', 'bVII', 'bVI', 'v'],
        B: ['i', 'iv', 'bVII', 'i'],
        C: ['bVI', 'bVII', 'i', 'i'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'default',
      },
      {
        A: ['i', 'v', 'bVI', 'bVII'],
        B: ['iv', 'bVII', 'i', 'v'],
        C: ['bVI', 'iv', 'bVII', 'i'],
        form: ['A', 'A', 'B', 'C'],
        phase: 'default',
      },
      {
        A: ['i', 'bVII', 'iv', 'bVI'],
        B: ['v', 'bVII', 'i', 'bVI'],
        C: ['iv', 'v', 'bVII', 'i'],
        form: ['A', 'B', 'A', 'C'],
        phase: 'storm',
      },
    ],

    melodyRhythm: {
      subdivide: '16th',         // syncopated off-beat accents
      swingInherit: true,        // inherit breakbeat groove
      humanizeInherit: true,
      holdProbability: 0.15,     // mostly tight notes
      restStyle: 'rhythmic',     // bar-aligned phrase starts
    },

    voicing: {
      padDefault: 'triad',
      bassVoicing: 'root',
      allowSus: false,
      allow9th: false,
      preferOpen: false,
    },

    // Special: break rewind — reversed pattern every 8 bars for 1 bar
    special: 'break_rewind',

    // Stagger: breaks hit first, rest follows quick (SPEC_010 §3)
    stagger: { rhythm: 0, harmony: 2, texture: 4, melody: 4, window: 4 },
  },
];

// --- Harmony Engine ---
var HarmonyEngine = {
  root: 0,                // semitone offset (0=C)
  rootName: 'C',
  scaleName: '',
  _chordScale: null,      // 7-note scale intervals for chord building
  _melodyScale: null,     // actual scale intervals for melody
  _progressions: [],      // array of structured progression objects (A/B/C form)
  _progIdx: 0,            // which progression we're on
  _formIdx: 0,            // position within form array (e.g. ['A','B','A','C'])
  _sectionChordIdx: 0,    // position within current section (0-3)
  _beatsInChord: 0,
  _beatsPerChord: 4,
  _totalBeats: 0,
  _palette: null,
  _currentChord: null,    // cached resolved chord
  _prevVoicing: null,     // previous chord MIDI notes for voice leading
  _lastVoiceNote: null,  // for proximity-based voice leading

  // Modulation state (SPEC_017 §3)
  _modulationCount: 0,    // max 4 per run (reset at Maelstrom)
  _pendingModulation: null, // {pivotNumeral, newRoot, beatsRemaining} or null
  _prevRoot: null,         // for HP regen restore

  // Borrowed chord state (SPEC_017 §4)
  _lastChordWasBorrowed: false,  // safety net: no consecutive borrowed chords
  _borrowedThisCycle: false,     // only one borrowed per 8-beat section

  initRun: function(palette) {
    // Pick random root if palette says null
    var rootKeys = Object.keys(ROOT_SEMITONES);
    if (palette.rootNote && ROOT_SEMITONES[palette.rootNote] !== undefined) {
      this.root = ROOT_SEMITONES[palette.rootNote];
      this.rootName = palette.rootNote;
    } else {
      var pick = rootKeys[Math.floor((_songRng || Math.random)() * rootKeys.length)];
      this.root = ROOT_SEMITONES[pick];
      this.rootName = pick;
    }

    this.scaleName = palette.scale;
    this._melodyScale = SCALES[palette.scale] || SCALES.minor;

    // Resolve chord-building scale (7-note parent if pentatonic)
    var parentName = CHORD_PARENT[palette.scale] || palette.scale;
    this._chordScale = SCALES[parentName] || SCALES.minor;

    this._progressions = palette.chordProgressions || [{
      A: ['i', 'iv', 'v', 'i'], B: ['i', 'iv', 'v', 'i'],
      C: ['i', 'iv', 'v', 'i'], form: ['A', 'B', 'A', 'C'], phase: 'default'
    }];
    this._progIdx = this._selectProgressionForPhase('pulse');
    this._formIdx = 0;
    this._sectionChordIdx = 0;
    this._beatsInChord = 0;
    this._beatsPerChord = 4;
    this._totalBeats = 0;
    this._palette = palette;
    this._currentChord = null;
    this._prevVoicing = null;
    this._lastVoiceNote = null;
    this._modulationCount = 0;
    this._pendingModulation = null;
    this._prevRoot = null;
    this._lastChordWasBorrowed = false;
    this._borrowedThisCycle = false;
    this._chordRhythmOffset = 0;

    this._resolveChord();

    var curForm = this._progressions[this._progIdx].form;
    console.log('[Harmony] Run start: palette=' + palette.name +
                ' root=' + this.rootName + ' scale=' + this.scaleName +
                ' form=' + curForm.join('-'));
  },

  // Select a progression appropriate for the current phase
  _selectProgressionForPhase: function(phase) {
    var phaseOrder = ['pulse', 'swell', 'surge', 'storm', 'maelstrom'];
    var phaseIdx = phaseOrder.indexOf(phase);
    if (phaseIdx < 0) phaseIdx = 0;

    // Storm+ progressions are eligible at storm/maelstrom
    // Default progressions are always eligible
    var candidates = [];
    for (var i = 0; i < this._progressions.length; i++) {
      var p = this._progressions[i];
      if (p.phase === 'default') { candidates.push(i); continue; }
      if (p.phase === 'storm' && phaseIdx >= 3) { candidates.push(i); continue; }
      if (p.phase === 'maelstrom' && phaseIdx >= 4) { candidates.push(i); continue; }
    }
    if (!candidates.length) candidates.push(0);
    return candidates[Math.floor((_songRng || Math.random)() * candidates.length)];
  },

  // Called by StateMapper._onPhaseChange — pick new progression for new phase
  onPhaseChange: function(newPhase) {
    this._progIdx = this._selectProgressionForPhase(newPhase);
    this._formIdx = 0;
    this._sectionChordIdx = 0;
    this._beatsInChord = 0;
    this._resolveChord();
    console.log('[Harmony] Phase → ' + newPhase + ': new progression form=' +
                this._progressions[this._progIdx].form.join('-'));
  },

  // --- Modulation system (SPEC_017 §3) ---

  modulateTo: function(newRootSemitone, method) {
    if (this._modulationCount >= 4) {
      console.log('[Harmony] Modulation cap reached (4), skipping');
      return;
    }
    newRootSemitone = ((newRootSemitone % 12) + 12) % 12;
    if (newRootSemitone === this.root) return; // no-op same key

    if (method === 'pivot') {
      var pivot = this._findPivotChord(this.root, newRootSemitone);
      if (pivot) {
        // Queue: play pivot chord next → then resolve to new I
        this._pendingModulation = {
          pivotNumeral: pivot.numeral,
          newRoot: newRootSemitone,
          beatsRemaining: 4, // pivot chord lasts 4 beats
        };
        this._modulationCount++;
        console.log('[Harmony] Pending pivot modulation → ' + ROOT_NAMES[newRootSemitone] +
                    ' via ' + pivot.numeral + ' (mod #' + this._modulationCount + ')');
        return;
      }
      // No pivot found — fall through to direct
    }

    // Direct modulation
    this._prevRoot = this.root;
    this.root = newRootSemitone;
    this.rootName = ROOT_NAMES[this.root];
    this._modulationCount++;
    this._resolveChord();
    console.log('[Harmony] Direct modulation → ' + this.rootName + ' (mod #' + this._modulationCount + ')');
  },

  // Find a chord that exists diatonically in both keys
  _findPivotChord: function(oldRoot, newRoot) {
    var oldScale = this._chordScale;
    if (!oldScale || oldScale.length < 7) return null;

    // Build triads for old key
    var oldTriads = [];
    for (var d = 0; d < 7; d++) {
      var r = (oldRoot + oldScale[d]) % 12;
      var third = (oldRoot + oldScale[(d + 2) % 7]) % 12;
      var fifth = (oldRoot + oldScale[(d + 4) % 7]) % 12;
      oldTriads.push({ root: r, third: third, fifth: fifth, degree: d });
    }

    // Build triads for new key (same scale type)
    var newTriads = [];
    for (var d2 = 0; d2 < 7; d2++) {
      var r2 = (newRoot + oldScale[d2]) % 12;
      var third2 = (newRoot + oldScale[(d2 + 2) % 7]) % 12;
      var fifth2 = (newRoot + oldScale[(d2 + 4) % 7]) % 12;
      newTriads.push({ root: r2, third: third2, fifth: fifth2, degree: d2 });
    }

    // Find matching triads (same pitch classes)
    var pivots = [];
    for (var i = 0; i < oldTriads.length; i++) {
      for (var j = 0; j < newTriads.length; j++) {
        if (oldTriads[i].root === newTriads[j].root &&
            oldTriads[i].third === newTriads[j].third &&
            oldTriads[i].fifth === newTriads[j].fifth) {
          // Build roman numeral from old key degree
          var deg = oldTriads[i].degree;
          var numerals = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
          pivots.push({ numeral: numerals[deg], oldDeg: deg, newDeg: newTriads[j].degree });
        }
      }
    }

    if (!pivots.length) return null;
    // Prefer IV or V as pivot (strongest function)
    for (var p = 0; p < pivots.length; p++) {
      if (pivots[p].oldDeg === 3 || pivots[p].oldDeg === 4) return pivots[p];
    }
    return pivots[0];
  },

  // Reset modulation counter (called at Maelstrom entry)
  resetModulationCount: function() {
    this._modulationCount = 0;
    console.log('[Harmony] Modulation counter reset (Maelstrom)');
  },

  // --- Borrowed chord pool (SPEC_017 §4) ---

  _getBorrowedChordPool: function() {
    // Determine if current key is major or minor based on scale
    var isMajor = (this._chordScale === SCALES.major ||
                   this._chordScale === SCALES.lydian ||
                   this._chordScale === SCALES.majorPentatonic ||
                   this.scaleName === 'majorPentatonic' ||
                   this.scaleName === 'major');

    if (isMajor) {
      return ['iv', 'bVII', 'bVI', '#iv°'];
    }
    // Minor / other
    return ['bVI', 'bVII', 'IV', 'bII'];
  },

  // Secondary dominant pool: V/x = major chord a P5 above target
  _getSecondaryDominantPool: function() {
    // V/iv, V/v, V/vi — build major triads on the 5th above scale degrees 3, 4, 5
    var pool = [];
    var targets = [3, 4, 5]; // iv, v, vi target degrees
    for (var t = 0; t < targets.length; t++) {
      var targetDeg = targets[t];
      var targetSemitone = (this.root + this._chordScale[targetDeg]) % 12;
      // V of target = major triad on (target + 7 semitones)
      var domRoot = (targetSemitone + 7) % 12;
      pool.push({
        rootSemitone: domRoot,
        quality: 'major',
        label: 'V/' + ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'][targetDeg],
        targetDegree: targetDeg,
      });
    }
    return pool;
  },

  // Chord rhythm state (SPEC_017 §7): anticipation/delay offsets
  _chordRhythmOffset: 0,    // -1 = anticipated (resolved 1 beat early), +1 = delayed

  // Chord-change signal (SPEC_018 §3): WalkingBass reads this each beat
  _chordChanged: false,

  advanceBeat: function() {
    this._chordChanged = false;  // reset each beat; _resolveChord sets it true
    this._totalBeats++;
    this._beatsInChord++;

    // Handle pending pivot modulation
    if (this._pendingModulation) {
      this._pendingModulation.beatsRemaining--;
      if (this._pendingModulation.beatsRemaining <= 0) {
        // Pivot done — commit to new key
        this._prevRoot = this.root;
        this.root = this._pendingModulation.newRoot;
        this.rootName = ROOT_NAMES[this.root];
        this._pendingModulation = null;
        this._resolveChord();
        console.log('[Harmony] Pivot modulation complete → ' + this.rootName);
        return; // chord already resolved
      }
    }

    // Track 8-beat sections for borrowed chord rate limiting
    if (this._totalBeats % 8 === 0) {
      this._borrowedThisCycle = false;
    }

    // Chord rhythm (SPEC_017 §7): anticipation/delay. Only at Swell+.
    // Check one beat before chord change to decide if we anticipate.
    var effectiveBeatsPerChord = this._beatsPerChord + this._chordRhythmOffset;
    var phaseAllowsRhythm = G.phase && G.phase !== 'pulse';

    // One beat before normal change: chance to anticipate (resolve early)
    if (phaseAllowsRhythm && this._beatsInChord === (effectiveBeatsPerChord - 1)) {
      var r = (_songRng || Math.random)();
      if (r < 0.25) {
        // Anticipate: resolve chord NOW (1 beat early)
        this._chordRhythmOffset = 0;
        this._beatsInChord = 0;
        this._advanceChordIndex();
        this._resolveChord();
        this._logChordChange('anticipate');
        return;
      }
    }

    if (this._beatsInChord >= effectiveBeatsPerChord) {
      // Normal or delayed change
      this._chordRhythmOffset = 0;
      this._beatsInChord = 0;

      // Decide if NEXT chord should be delayed
      if (phaseAllowsRhythm) {
        var dr = (_songRng || Math.random)();
        if (dr < 0.15) {
          this._chordRhythmOffset = 1; // next chord holds 1 extra beat
        }
      }

      this._advanceChordIndex();
      this._resolveChord();
      this._logChordChange('on-beat');
    }
  },

  // Factor out chord index advancement for reuse
  _advanceChordIndex: function() {
    this._sectionChordIdx++;
    var prog = this._progressions[this._progIdx];
    var sectionKey = prog.form[this._formIdx];
    var section = prog[sectionKey];

    if (this._sectionChordIdx >= section.length) {
      this._sectionChordIdx = 0;
      this._formIdx++;
      if (this._formIdx >= prog.form.length) {
        this._formIdx = 0;
      }
    }
  },

  _logChordChange: function(timing) {
    var c = this._currentChord;
    if (!c) return;
    var prog = this._progressions[this._progIdx];
    var sKey = prog.form[this._formIdx];
    console.log('[Harmony] Beat ' + this._totalBeats + ' (' + timing + '): ' + sKey +
                '[' + this._sectionChordIdx + '] → ' +
                c.numeral + ' (' + c.name + ') notes=[' +
                c.midiNotes.map(function(n) { return ROOT_NAMES[n % 12] + Math.floor(n / 12 - 1); }).join(', ') + ']');
  },

  // Get current Roman numeral from the form structure
  _getCurrentNumeral: function() {
    var prog = this._progressions[this._progIdx];
    if (!prog || !prog.form) return 'i';
    var sectionKey = prog.form[this._formIdx] || 'A';
    var section = prog[sectionKey];
    if (!section) return 'i';
    return section[this._sectionChordIdx] || section[0] || 'i';
  },

  // Resolve the current Roman numeral chord into actual MIDI notes with voice leading
  _resolveChord: function() {
    // If pending pivot modulation, use the pivot numeral as override
    var numeral;
    var isBorrowed = false;
    var isSecondary = false;
    var secondaryData = null;

    if (this._pendingModulation) {
      numeral = this._pendingModulation.pivotNumeral;
    } else {
      numeral = this._getCurrentNumeral();
    }

    // --- Borrowed chord / secondary dominant injection (SPEC_017 §4) ---
    var phase = (typeof G !== 'undefined' && G.phase) ? G.phase : 'pulse';
    if (!this._pendingModulation && !this._lastChordWasBorrowed && !this._borrowedThisCycle) {
      var borrowChance = 0;
      var secDomChance = 0;
      if (phase === 'surge')     { borrowChance = 0.10; secDomChance = 0.05; }
      if (phase === 'storm')     { borrowChance = 0.20; secDomChance = 0.10; }
      if (phase === 'maelstrom') { borrowChance = 0.30; secDomChance = 0.15; }

      var _rng = (_songRng || Math.random);
      var roll = _rng();
      if (roll < secDomChance) {
        // Secondary dominant injection
        var secPool = this._getSecondaryDominantPool();
        if (secPool.length) {
          secondaryData = secPool[Math.floor(_rng() * secPool.length)];
          isSecondary = true;
          this._lastChordWasBorrowed = true;
          this._borrowedThisCycle = true;
          console.log('[Harmony] Secondary dominant: ' + secondaryData.label);
        }
      } else if (roll < secDomChance + borrowChance) {
        // Borrowed chord injection
        var borrowPool = this._getBorrowedChordPool();
        numeral = borrowPool[Math.floor(_rng() * borrowPool.length)];
        isBorrowed = true;
        this._lastChordWasBorrowed = true;
        this._borrowedThisCycle = true;
        console.log('[Harmony] Borrowed chord: ' + numeral);
      } else {
        this._lastChordWasBorrowed = false;
      }
    } else if (!this._pendingModulation) {
      // Safety net: after a borrowed chord, resolve to diatonic
      this._lastChordWasBorrowed = false;
    }

    var parsed = _parseRoman(numeral);
    var scale = this._chordScale;

    var chordRoot, intervals;

    if (isSecondary && secondaryData) {
      // Secondary dominant: root is already absolute semitone
      chordRoot = secondaryData.rootSemitone;
      intervals = _triadIntervals(secondaryData.quality);
    } else {
      // Normal or borrowed chord
      var scaleInterval = scale[parsed.degree] !== undefined ? scale[parsed.degree] : scale[scale.length - 1];
      if (parsed.flat)  scaleInterval = (scaleInterval - 1 + 12) % 12;
      if (parsed.sharp) scaleInterval = (scaleInterval + 1) % 12;
      chordRoot = (this.root + scaleInterval) % 12;
      intervals = _triadIntervals(parsed.quality);
    }

    // Determine voicing based on palette config + phase
    var voicingCfg = this._palette && this._palette.voicing;
    var phase = (typeof G !== 'undefined' && G.phase) ? G.phase : 'pulse';
    intervals = this._getVoicingIntervals(parsed.quality, voicingCfg, phase);

    // Build raw MIDI notes in octave 4
    var baseOctave = 4;
    var baseMidi = (baseOctave + 1) * 12 + chordRoot;
    var rawNotes = intervals.map(function(iv) { return baseMidi + iv; });

    // Apply voice leading if we have a previous voicing
    var midiNotes;
    if (this._prevVoicing && this._prevVoicing.length > 0) {
      midiNotes = this._voiceLead(this._prevVoicing, rawNotes);
    } else {
      midiNotes = rawNotes;
    }

    this._prevVoicing = midiNotes.slice();

    var chordQuality = isSecondary ? secondaryData.quality : parsed.quality;
    var qualName = chordQuality === 'minor' ? 'm' : (chordQuality === 'diminished' ? 'dim' : '');
    var chordLabel = isSecondary ? secondaryData.label : numeral;
    this._currentChord = {
      numeral: chordLabel,
      quality: chordQuality,
      rootSemitone: chordRoot,
      name: ROOT_NAMES[chordRoot] + qualName,
      midiNotes: midiNotes,
      intervals: intervals,
      isBorrowed: isBorrowed,
      isSecondary: isSecondary,
    };
    this._chordChanged = true;  // signal WalkingBass (SPEC_018 §3)
  },

  // Choose intervals based on voicing config and current phase
  _getVoicingIntervals: function(quality, voicingCfg, phase) {
    var base = _triadIntervals(quality);
    if (!voicingCfg) return base;

    var phaseIdx = ['pulse', 'swell', 'surge', 'storm', 'maelstrom'].indexOf(phase);

    // Add 7th at Surge+ (phase >= 2)
    if (phaseIdx >= 2) {
      var seventh = (quality === 'minor' || quality === 'diminished') ? 10 : 11;
      base.push(seventh);
    }

    // Add 9th at Storm+ if allowed (phase >= 3)
    if (phaseIdx >= 3 && voicingCfg.allow9th) {
      base.push(14);
    }

    // Palette default voicing overrides
    var padDef = voicingCfg.padDefault;
    if (padDef === 'add9' && phaseIdx < 3) {
      // add9 only from Surge+ to avoid thickness in early game
      if (phaseIdx >= 2) base.push(14);
    }
    if (padDef === 'power' && phaseIdx < 2) {
      // Power chord (root-5th-octave) in early phases for techno
      return [0, 7, 12];
    }

    return base;
  },

  // Voice leading: minimize total semitone movement between prev and target
  _voiceLead: function(prev, target) {
    // Build candidate pool: target notes ± 1 octave
    var candidates = [];
    for (var i = 0; i < target.length; i++) {
      candidates.push(target[i] - 12, target[i], target[i] + 12);
    }

    // For each voice in prev, find nearest candidate
    var result = [];
    var used = {};
    // Sort prev by pitch for stable assignment
    var prevSorted = prev.slice().sort(function(a, b) { return a - b; });

    for (var v = 0; v < prevSorted.length; v++) {
      var best = null;
      var bestDist = Infinity;
      for (var c = 0; c < candidates.length; c++) {
        if (used[c]) continue;
        var dist = Math.abs(candidates[c] - prevSorted[v]);
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      if (best !== null) {
        result.push(candidates[best]);
        used[best] = true;
      }
    }

    // If target has more notes than prev (e.g. triad → 7th), add extras
    if (target.length > prev.length) {
      for (var t = prev.length; t < target.length; t++) {
        result.push(target[t]);
      }
    }

    // Sort result low to high for consistent voicing
    result.sort(function(a, b) { return a - b; });
    return result;
  },

  // Get chord tones transposed to a specific octave
  getChordTones: function(octave) {
    if (!this._currentChord) return [];
    var chordRoot = this._currentChord.rootSemitone;
    var baseMidi = (octave + 1) * 12 + chordRoot;
    // Use triad intervals only for external callers (voices, bass)
    var triIntervals = _triadIntervals(this._currentChord.quality);
    return triIntervals.map(function(iv) { return baseMidi + iv; });
  },

  // Get voiced chord tones (with extensions) for pad use
  getVoicedChordTones: function(octave) {
    if (!this._currentChord) return [];
    // Shift the voice-led notes to requested octave
    var ref = this._currentChord.midiNotes;
    if (!ref || !ref.length) return this.getChordTones(octave);
    // The midiNotes are in ~octave 4 range. Shift to target.
    var refBase = Math.min.apply(null, ref);
    var refOctave = Math.floor(refBase / 12) - 1;
    var shift = (octave - refOctave) * 12;
    return ref.map(function(n) { return n + shift; });
  },

  // Get chord tones + 7th for richer voicing (legacy API, used by PadTrack)
  getChordTones7th: function(octave) {
    // Now just returns the voiced chord tones (already includes 7th at Surge+)
    return this.getVoicedChordTones(octave);
  },

  // Proximity-based voice leading (SPEC_017 §6)
  _voiceToneIdx: 0,
  getNextChordTone: function(octave) {
    var tones = this.getChordTones(octave);
    if (!tones.length) return 60; // fallback C4

    if (this._lastVoiceNote === null) {
      // First voice: random chord tone
      var idx = Math.floor((_songRng || Math.random)() * tones.length);
      this._lastVoiceNote = tones[idx];
      return this._lastVoiceNote;
    }

    // Build candidates: chord tones in octave ± 1
    var candidates = [];
    for (var oct = octave - 1; oct <= octave + 1; oct++) {
      var t = this.getChordTones(oct);
      for (var i = 0; i < t.length; i++) candidates.push(t[i]);
    }

    // Sort by proximity to last note
    var last = this._lastVoiceNote;
    candidates.sort(function(a, b) {
      return Math.abs(a - last) - Math.abs(b - last);
    });

    // Pick from top 3 nearest (weighted random, not always closest)
    var pick = candidates[0];
    var _rngBt = (_songRng || Math.random);
    if (candidates.length >= 3 && _rngBt() < 0.3) {
      pick = candidates[Math.floor(_rngBt() * 3)];
    }

    this._lastVoiceNote = pick;
    return pick;
  },

  // Get available melody scale notes in a specific octave
  getScaleNotes: function(octave) {
    var root = this.root;
    var baseMidi = (octave + 1) * 12;
    return this._melodyScale.map(function(iv) { return baseMidi + root + iv; });
  },

  // Get current chord info (read-only snapshot)
  getCurrentChord: function() {
    return this._currentChord;
  },

  getPalette: function() {
    return this._palette;
  },
};

// --- Run-start palette selection (weighted recency) ---
function _selectPalette() {
  // 0 = random; 1..N = locked to PALETTES[idx-1]
  var setting = (typeof G !== 'undefined' && G.settings && G.settings.palette) || 0;
  if (setting > 0 && setting <= PALETTES.length) {
    return PALETTES[setting - 1];
  }

  // Load recent palette indices (last 5 runs)
  var recentPalettes = [];
  try {
    recentPalettes = JSON.parse(localStorage.getItem('recentPalettes') || '[]');
    if (!Array.isArray(recentPalettes)) recentPalettes = [];
  } catch (e) {
    recentPalettes = [];
  }

  // Weight each palette: recency penalty so same genre doesn't repeat
  var weights = PALETTES.map(function(p, i) {
    var pos = recentPalettes.indexOf(i);
    var recencyPenalty = 0;
    if (pos === 0)      recencyPenalty = 1.0;   // last played: impossible
    else if (pos === 1) recencyPenalty = 0.7;   // 2nd last: very unlikely
    else if (pos === 2) recencyPenalty = 0.4;   // 3rd last: unlikely
    else if (pos >= 3)  recencyPenalty = 0.1;   // older: slight penalty
    return Math.max(0.05, 1.0 - recencyPenalty);
  });

  // Weighted random selection
  var totalWeight = weights.reduce(function(a, b) { return a + b; }, 0);
  var rand = Math.random() * totalWeight;
  var idx = 0;
  for (var i = 0; i < weights.length; i++) {
    rand -= weights[i];
    if (rand <= 0) { idx = i; break; }
  }

  // Persist recency list
  try {
    recentPalettes.unshift(idx);
    recentPalettes = recentPalettes.slice(0, 5);
    localStorage.setItem('recentPalettes', JSON.stringify(recentPalettes));
  } catch (e) { /* localStorage unavailable — degrade silently */ }

  return PALETTES[idx];
}

// --- Palette Blending System (SPEC_019 §2) ---
// At Maelstrom entry, selects a second palette and lerps continuous params
// over 64 beats (capped at 40% blend). Discrete params (scale, patterns, BPM) never blend.
var PaletteBlender = {
  _active:        false,
  _source:        null,   // current palette
  _target:        null,   // blend target palette
  _blendAmount:   0,      // 0.0 → 0.4
  _beatsInMael:   0,      // beats since Maelstrom entry

  initRun: function(palette) {
    this._active      = false;
    this._source      = palette;
    this._target      = null;
    this._blendAmount = 0;
    this._beatsInMael = 0;
  },

  // Called by StateMapper._onPhaseChange when phase === 'maelstrom'
  onMaelstromEntry: function() {
    if (this._active || !this._source) return;
    // Pick a different palette as blend target
    var available = PALETTES.filter(function(p) {
      return p.name !== PaletteBlender._source.name;
    });
    if (!available.length) return;
    this._target = available[Math.floor((_songRng || Math.random)() * available.length)];
    this._beatsInMael = 0;
    this._blendAmount = 0;
    this._active = true;
    console.log('[PaletteBlender] Maelstrom blend start: ' +
                this._source.name + ' → ' + this._target.name);
  },

  // Called each beat by Sequencer.tick when in Maelstrom
  onBeat: function() {
    if (!this._active || !this._target) return;
    this._beatsInMael++;
    this._blendAmount = Math.min(this._beatsInMael / 64, 0.4);
    this._applyBlend();
  },

  // Lerp continuous parameters toward target
  _applyBlend: function() {
    if (!this._active || !this._target || !audioCtx) return;
    var a = this._blendAmount;
    var s = this._source;
    var t = this._target;

    function lerp(sv, tv) {
      if (typeof sv !== 'number' || typeof tv !== 'number') return sv;
      return sv + (tv - sv) * a;
    }

    // 1. Bass filter cutoff
    if (typeof _trackGains !== 'undefined' && _trackGains.bass &&
        s.bass && t.bass && typeof s.bass.filterCutoff === 'number' && typeof t.bass.filterCutoff === 'number') {
      var blendedCutoff = lerp(s.bass.filterCutoff, t.bass.filterCutoff);
      // Apply via StateMapper._updateBassFilter if exposed, else directly
      if (typeof StateMapper !== 'undefined' && StateMapper._bassFilter) {
        StateMapper._bassFilter.frequency.value = blendedCutoff;
      }
    }

    // 2. Pad detune + attack/release
    if (typeof PadTrack !== 'undefined' && PadTrack._palette &&
        s.pad && t.pad) {
      if (typeof s.pad.detune === 'number' && typeof t.pad.detune === 'number') {
        PadTrack._blendDetune = lerp(s.pad.detune, t.pad.detune);
      }
    }

    // 3. Reverb + delay sends
    if (s.effects && t.effects) {
      var sfx = s.effects.phases && s.effects.phases.pulse ? s.effects.phases.pulse : {};
      var tfx = t.effects.phases && t.effects.phases.pulse ? t.effects.phases.pulse : {};

      var blendReverb  = lerp(sfx.reverbSend || 0, tfx.reverbSend || 0);
      var blendDelay   = lerp(sfx.delaySend  || 0, tfx.delaySend  || 0);

      // Apply to per-track sends (pad is most audible)
      if (typeof _trackReverbSends !== 'undefined') {
        if (_trackReverbSends.pad)  _trackReverbSends.pad.gain.setTargetAtTime(blendReverb, audioCtx.currentTime, 0.5);
      }
      if (typeof _trackDelaySends !== 'undefined') {
        if (_trackDelaySends.sfx)   _trackDelaySends.sfx.gain.setTargetAtTime(blendDelay * 0.3, audioCtx.currentTime, 0.5);
      }
    }

    // 4. Swing (via GrooveEngine if available)
    if (typeof GrooveEngine !== 'undefined' &&
        typeof s.swing === 'number' && typeof t.swing === 'number') {
      GrooveEngine._blendSwing = lerp(s.swing, t.swing);
    }

    // 5. Drum velocities — lerp via Sequencer._drumPatterns live step velocities
    // Subtle: only affects kick/snare/hat relative gain, not timing
    if (typeof Sequencer !== 'undefined' && Sequencer._drumPatterns) {
      var sVol = (s.drums && s.drums.kick && typeof s.drums.kick.vel === 'number') ? s.drums.kick.vel : 0.7;
      var tVol = (t.drums && t.drums.kick && typeof t.drums.kick.vel === 'number') ? t.drums.kick.vel : 0.7;
      Sequencer._blendDrumVelScale = lerp(sVol / 0.7, tVol / 0.7);
    }
  },

  stop: function() {
    this._active = false;
    this._target = null;
    this._blendAmount = 0;
  },
};
