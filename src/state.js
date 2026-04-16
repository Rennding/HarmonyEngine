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

// ========== TENSION MAP (SPEC_011) ==========
// Generates per-song tension events (plateaus, spikes, retreats) on top of
// the monotonic DC power curve. Same seed → same map → reproducible.

var TensionMap = (function() {
  var _events = [];
  var _suppressed = false;  // true when autoPhase off or cycle active

  // Find the active event for a given beat count
  function _findActive(beat) {
    for (var i = 0; i < _events.length; i++) {
      var e = _events[i];
      if (beat >= e.startBeat && beat < e.startBeat + e.duration) return e;
    }
    return null;
  }

  // Compute eased offset for spike/retreat
  function _easedOffset(e, beat) {
    var into = beat - e.startBeat;
    var t;
    if (e.easeIn > 0 && into < e.easeIn) {
      t = into / e.easeIn;
      return e.magnitude * t;
    } else if (e.easeOut > 0 && into > e.duration - e.easeOut) {
      var remaining = e.duration - into;
      t = remaining / e.easeOut;
      return e.magnitude * t;
    }
    return e.magnitude;
  }

  return {
    // Generate tension events from PRNG + palette profile
    generate: function(rng, palette) {
      _events = [];
      _suppressed = false;
      if (!rng || !palette) return;

      var T = CFG.TENSION;
      var prof = palette.tension || {};
      var density = prof.eventDensity != null ? prof.eventDensity : 0.7;
      var retreatDepth = prof.retreatDepth != null ? prof.retreatDepth : 0.15;
      var spikeHeight = prof.spikeHeight != null ? prof.spikeHeight : 0.20;
      var plateauBias = prof.plateauBias != null ? prof.plateauBias : 0.0;

      // Compute adjusted probabilities
      var pNone = T.BASE_PROBS.none;
      var pPlateau = T.BASE_PROBS.plateau + plateauBias;
      var pSpike = T.BASE_PROBS.spike;
      var pRetreat = T.BASE_PROBS.retreat;
      // Normalize
      var sum = pNone + pPlateau + pSpike + pRetreat;
      pNone /= sum; pPlateau /= sum; pSpike /= sum; pRetreat /= sum;

      // Phase thresholds for spike capping
      var phases = CFG.PHASES;

      // Walk candidate windows
      var beat = T.GRACE_BEATS;
      var maxBeat = 800; // ~6+ minutes at 120bpm — enough for any song
      var lastEventEnd = 0;

      while (beat < maxBeat) {
        var windowSize = T.WINDOW_MIN + Math.floor(rng() * (T.WINDOW_MAX - T.WINDOW_MIN + 1));
        var midBeat = beat + Math.floor(windowSize / 2);

        // Density roll — skip window?
        if (rng() > density) { beat += windowSize; continue; }

        // Enforce gap from last event
        if (midBeat < lastEventEnd + T.GAP_MIN) { beat += windowSize; continue; }

        // Event type roll
        var roll = rng();
        var type;
        if (roll < pNone) { beat += windowSize; continue; }
        else if (roll < pNone + pPlateau) type = 'plateau';
        else if (roll < pNone + pPlateau + pSpike) type = 'spike';
        else type = 'retreat';

        // Duration
        var dur = T.DURATION[type];
        var duration = dur.min + Math.floor(rng() * (dur.max - dur.min + 1));

        // Magnitude
        var magnitude = 0;
        if (type === 'spike') {
          // Magnitude = fraction of gap to next phase threshold
          // Use spikeHeight as fraction of 0.30 (typical phase gap)
          magnitude = spikeHeight * 0.30;
        } else if (type === 'retreat') {
          // Magnitude is negative — fraction of expected DC at this point
          // Estimate DC at midBeat using normal curve
          var moodKey = (CFG.MOODS[1] || {}).name;
          var curve = CFG.DIFFICULTY.CURVES[(moodKey || 'normal').toLowerCase()] || CFG.DIFFICULTY.CURVES.normal;
          var estDC = Math.pow(midBeat / curve.scale, curve.exp);
          magnitude = -(retreatDepth * Math.max(estDC, 0.1));
        }
        // plateau magnitude stays 0 (freeze, not additive)

        _events.push({
          type: type,
          startBeat: midBeat,
          duration: duration,
          magnitude: magnitude,
          easeIn: dur.easeIn,
          easeOut: dur.easeOut,
          frozenDC: 0, // set at runtime for plateaus
        });

        lastEventEnd = midBeat + duration;
        beat += windowSize;
      }

      if (_events.length > 0) {
        console.log('[TensionMap] Generated ' + _events.length + ' events for ' + palette.name);
      }
    },

    // Get the effective DC offset for a given beat.
    // Returns { offset, freeze } — if freeze is true, caller uses frozenDC instead of baseDC+offset
    getOffset: function(beatCount) {
      if (_suppressed) return { offset: 0, freeze: false };
      var e = _findActive(beatCount);
      if (!e) return { offset: 0, freeze: false };

      if (e.type === 'plateau') {
        // During easeOut, lerp back to normal
        var into = beatCount - e.startBeat;
        if (e.easeOut > 0 && into > e.duration - e.easeOut) {
          var remaining = e.duration - into;
          var t = remaining / e.easeOut;
          return { offset: 0, freeze: true, freezeLerp: t, frozenDC: e.frozenDC };
        }
        return { offset: 0, freeze: true, freezeLerp: 1.0, frozenDC: e.frozenDC };
      }

      return { offset: _easedOffset(e, beatCount), freeze: false };
    },

    // Set frozenDC for a plateau event at the given beat (called from updateDC on first beat of plateau)
    _stampFrozenDC: function(beatCount, dc) {
      var e = _findActive(beatCount);
      if (e && e.type === 'plateau' && e.frozenDC === 0) {
        e.frozenDC = dc;
      }
    },

    // Cap spike so it doesn't skip >1 phase
    _capSpike: function(baseDC, offset) {
      if (offset <= 0) return offset;
      var effective = baseDC + offset;
      var phases = CFG.PHASES;
      // Find current phase index
      var curIdx = 0;
      for (var i = phases.length - 1; i >= 0; i--) {
        if (baseDC >= phases[i].dc) { curIdx = i; break; }
      }
      // Max allowed = threshold of curIdx+2 (skip 1 = land on curIdx+1, so cap at curIdx+2 boundary - 0.01)
      var maxIdx = Math.min(curIdx + 2, phases.length - 1);
      var cap = phases[maxIdx].dc - 0.01;
      if (effective > cap && maxIdx < phases.length - 1) {
        return cap - baseDC;
      }
      return offset;
    },

    setSuppressed: function(v) { _suppressed = !!v; },
    isActive: function(beat) {
      if (_suppressed) return false;
      return !!_findActive(beat != null ? beat : G.beatCount - G.beatCountCycleBase);
    },
    currentEvent: function(beat) {
      if (_suppressed) return null;
      return _findActive(beat != null ? beat : G.beatCount - G.beatCountCycleBase);
    },
    reset: function() { _events = []; _suppressed = false; },
  };
})();

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
  beatCountCycleBase: 0,   // subtracted from beatCount for cycle-relative DC + TensionMap lookups
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
  // Use cycle-relative beat so each cycle's DC arc starts from 0
  var cycleBeat = G.beatCount - G.beatCountCycleBase;
  var baseDC = Math.pow(cycleBeat / curve.scale, curve.exp);

  // ── Tension curve modulation (SPEC_011 §4) ──────────────────────────────
  var tension = TensionMap.getOffset(cycleBeat);
  if (tension.freeze) {
    // Plateau: stamp frozenDC on first beat, then hold
    TensionMap._stampFrozenDC(cycleBeat, baseDC);
    if (tension.freezeLerp < 1.0) {
      // easeOut: lerp from frozen back to current baseDC
      G.dc = tension.frozenDC + (baseDC - tension.frozenDC) * (1.0 - tension.freezeLerp);
    } else {
      G.dc = tension.frozenDC;
    }
  } else {
    var offset = TensionMap._capSpike(baseDC, tension.offset);
    G.dc = Math.max(0, baseDC + offset);
  }

  // Log tension event transitions (use cycle-relative beat for event lookup)
  var curEvent = TensionMap.currentEvent(cycleBeat);
  if (curEvent) {
    var into = cycleBeat - curEvent.startBeat;
    if (into === 0) {
      console.log('[TensionMap] ' + curEvent.type + ' started at cycle-beat ' + cycleBeat +
                  ' (duration=' + curEvent.duration + ')');
    } else if (into === curEvent.duration - 1) {
      console.log('[TensionMap] ' + curEvent.type + ' ending at cycle-beat ' + cycleBeat);
    }
  }

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
  G.beatCountCycleBase = 0;
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
    // Generate tension map for this song (SPEC_011 §3.1)
    TensionMap.generate(_songRng, pal);
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
