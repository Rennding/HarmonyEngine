// ========== HARMONY ENGINE STATE ==========
// Standalone state for the music station.
// Replaces DemoShooter's game state (02_state.js) with a virtual conductor.

// ========== SEEDED PRNG (SPEC_020 §7) ==========
var _songRng = null;

function _createSongRng(seed) {
  var state = seed | 0;
  return function() {
    state = (state + 0x6D2B79F5) | 0;
    var t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ========== VIRTUAL GAME STATE ==========
// The audio engine reads these fields. The virtual conductor writes them.

const G = {
  score: 0,
  intensity: 0,
  bestIntensity: 0,
  energy: CFG.MAX_ENERGY,
  beatCount: 0,
  alive: true,
  lastBeatTime: 0,
  bpm: CFG.BPM,

  // Settings
  settings: { volume: 0.8, mood: 1, palette: 0, bpmOverride: null, cycleMode: false },  // palette: 0=random, 1..N=locked; bpmOverride: null=auto, number=locked BPM; cycleMode: auto-rotate palettes

  // Per-run tracking
  songHash: '',
  songSeed: 0,

  // Difficulty Coefficient
  dc: 0,
  phase: 'pulse',
  phaseEntryBeat: 0,
  _phaseChangeListeners: [],

  // Perk state
  perks: [],

  // Playback state
  paused: false,
  beatsSinceHit: 0,

  // Graze state (audio references)
  grazeStreak: 0,
  grazeStreakBeat: 0,
  pulseArmed: false,
  pulseCooldown: 0,
  grazesRun: 0,

  // Meta
  meta: {
    beatsLifetime: 0,
  },
};

// ── Difficulty engine (virtual conductor drives this) ─────────────────────

function updateDC(beatTime) {
  var moodKey = (CFG.MOODS[G.settings.mood] || CFG.MOODS[1]).name.toLowerCase();
  var curve = CFG.DIFFICULTY.CURVES[moodKey] || CFG.DIFFICULTY.CURVES.normal;
  G.dc = Math.pow(G.beatCount / curve.scale, curve.exp);

  var phases = CFG.PHASES;
  var newPhase = phases[0].name;
  for (var i = phases.length - 1; i >= 0; i--) {
    if (G.dc >= phases[i].dc) { newPhase = phases[i].name; break; }
  }

  if (newPhase !== G.phase) {
    var oldPhase = G.phase;
    G.phase = newPhase;
    G.phaseEntryBeat = G.beatCount;
    for (var j = 0; j < G._phaseChangeListeners.length; j++) {
      G._phaseChangeListeners[j](newPhase, oldPhase, beatTime);
    }
  }
}

function onPhaseChange(fn) {
  G._phaseChangeListeners.push(fn);
}

function getPostMaelstromName() {
  if (G.phase !== 'maelstrom') return null;
  var beatsSinceEntry = G.beatCount - G.phaseEntryBeat;
  if (beatsSinceEntry < 64) return null;
  var idx = Math.floor(beatsSinceEntry / 64) - 1;
  var names = CFG.POST_MAELSTROM;
  return names[Math.min(idx, names.length - 1)];
}

// ── Run initialization (replaces resetRun) ────────────────────────────────

function resetRun(seedOverride) {
  G.score = 0;
  G.intensity = 0;
  G.bestIntensity = 0;
  G.energy = CFG.MAX_ENERGY;
  G.beatCount = 0;
  G.alive = true;
  G.lastBeatTime = 0;
  G.dc = 0;
  G.phase = 'pulse';
  G.phaseEntryBeat = 0;
  G._phaseChangeListeners = [];
  G.perks = [];
  G.beatsSinceHit = 0;
  G.grazeStreak = 0;
  G.grazeStreakBeat = 0;
  G.pulseArmed = false;
  G.pulseCooldown = 0;
  G.grazesRun = 0;

  // Palette selection + seeded PRNG
  if (typeof _selectPalette === 'function' && typeof HarmonyEngine !== 'undefined') {
    var pal = _selectPalette();
    var paletteIdx = (typeof PALETTES !== 'undefined') ? PALETTES.indexOf(pal) : 0;
    // Seed override: use provided seed (URL param replay), else generate fresh
    if (seedOverride != null && isFinite(seedOverride)) {
      G.songSeed = seedOverride | 0;
    } else {
      G.songSeed = paletteIdx * 10000 + Math.floor(Math.random() * 10000);
    }
    _songRng = _createSongRng(G.songSeed);

    HarmonyEngine.initRun(pal);
    if (typeof PaletteBlender !== 'undefined') PaletteBlender.initRun(pal);
    // Auto BPM: always pick from palette's natural range
    G.bpm = pal.bpmRange[0] + Math.floor(_songRng() * (pal.bpmRange[1] - pal.bpmRange[0] + 1));
    // BPM override: user-set value takes priority
    if (G.settings.bpmOverride !== null) G.bpm = G.settings.bpmOverride;
    if (typeof Sequencer !== 'undefined') Sequencer.initRun(pal);
    if (typeof VoicePool !== 'undefined') VoicePool.initRun(pal);
    if (typeof NarrativeConductor !== 'undefined') NarrativeConductor.initRun(pal);
    if (typeof StateMapper !== 'undefined') StateMapper.initRun();
  } else {
    G.songSeed = Math.floor(Math.random() * 100000);
    _songRng = _createSongRng(G.songSeed);
    var moodBpm = CFG.MOODS[G.settings.mood] ? CFG.MOODS[G.settings.mood].bpm : null;
    G.bpm = moodBpm !== null ? moodBpm : CFG.BPM;
    if (G.settings.bpmOverride !== null) G.bpm = G.settings.bpmOverride;
  }
  if (typeof applyVolumeSetting === 'function') applyVolumeSetting();
}

// ── Song hash utility ─────────────────────────────────────────────────────

function computeSongHash(paletteIdx, bpm, beats, intensity, seed) {
  var n = seed
    ? ((seed * 7919 + paletteIdx * 6271 + beats * 1021 + intensity * 3) & 0xFFFF)
    : ((paletteIdx * 7919 + bpm * 6271 + beats * 1021 + intensity * 3) & 0xFFFF);
  return n.toString(16).toUpperCase().padStart(4, '0');
}
