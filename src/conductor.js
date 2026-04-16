// ========== VIRTUAL CONDUCTOR ==========
// Replaces the game loop. Simulates phase progression, combo ramp,
// and musical events so the audio engine plays a full song autonomously.

var Conductor = (function() {
  var _running = false;
  var _paused = false;
  var _autoCombo = true;     // simulate combo ramp
  var _autoPhase = true;     // let DC drive phase transitions
  var _manualPhase = null;   // override phase when autoPhase=false
  var _comboRate = 1;        // combo increment per beat (simulate player skill)

  function _onBeat(beatTime) {
    if (!_running) return;

    G.beatCount++;
    G.beatsSinceHit++;

    // DC + phase progression
    if (_autoPhase) {
      updateDC(beatTime);
    } else if (_manualPhase && _manualPhase !== G.phase) {
      // Force phase
      var oldPhase = G.phase;
      G.phase = _manualPhase;
      G.phaseEntryBeat = G.beatCount;
      for (var j = 0; j < G._phaseChangeListeners.length; j++) {
        G._phaseChangeListeners[j](_manualPhase, oldPhase, beatTime);
      }
    }

    // Virtual combo ramp
    if (_autoCombo) {
      G.combo += _comboRate;
      G.bestCombo = Math.max(G.bestCombo, G.combo);
    }

    // Score
    G.score += 10 + Math.floor(G.combo * 0.5);

    // Advance audio subsystems
    if (typeof HarmonyEngine !== 'undefined') HarmonyEngine.advanceBeat();
    if (typeof Sequencer !== 'undefined') Sequencer.tick(beatTime);
    if (typeof StateMapper !== 'undefined') StateMapper.update(beatTime);
    if (typeof MelodyEngine !== 'undefined') MelodyEngine.updateCombo(G.combo);
    if (typeof NarrativeConductor !== 'undefined') NarrativeConductor.onBeat(beatTime);
    if (typeof PaletteBlender !== 'undefined') PaletteBlender.onBeat();
    if (typeof GrooveEngine !== 'undefined') GrooveEngine.onPhaseChange(G.phase);

    // Dispatch beat event for UI
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('conductor:beat', {
        detail: { beat: G.beatCount, phase: G.phase, dc: G.dc, combo: G.combo, bpm: G.bpm }
      }));
    }
  }

  return {
    start: function(paletteOverride) {
      if (_running) this.stop();
      _running = true;
      _paused = false;

      // If palette override, temporarily replace _selectPalette
      if (paletteOverride !== undefined && typeof PALETTES !== 'undefined') {
        var savedSelect = window._selectPalette;
        window._selectPalette = function() { return PALETTES[paletteOverride]; };
        resetRun();
        window._selectPalette = savedSelect;
      } else {
        resetRun();
      }

      initAudio();
      // Resume AudioContext (may be suspended by autoplay policy or after stop()).
      // startBeatClock after context is running so scheduled times are valid.
      var self = this;
      var resumePromise = (audioCtx && audioCtx.state !== 'running')
        ? audioCtx.resume()
        : Promise.resolve();
      resumePromise.then(function() { startBeatClock(_onBeat); });
    },

    stop: function() {
      _running = false;
      stopBeatClock();
      // Suspend (not close) AudioContext so it can be reused next play.
      if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'running') {
        audioCtx.suspend();
      }
      if (typeof BulletVoicePool !== 'undefined') BulletVoicePool.shutdown();
      if (typeof StateMapper !== 'undefined') StateMapper.shutdown();
      if (typeof MelodyEngine !== 'undefined') MelodyEngine.shutdown();
      if (typeof NarrativeConductor !== 'undefined') NarrativeConductor.shutdown();
    },

    pause: function() {
      if (!_running || _paused) return;
      _paused = true;
      stopBeatClock();
    },

    resume: function() {
      if (!_running || !_paused) return;
      _paused = false;
      startBeatClock(_onBeat);
    },

    isRunning: function() { return _running; },
    isPaused: function() { return _paused; },

    // --- Controls ---
    setAutoCombo: function(v) { _autoCombo = !!v; },
    setComboRate: function(r) { _comboRate = Math.max(0, r); },
    setAutoPhase: function(v) { _autoPhase = !!v; },
    forcePhase: function(name) {
      _autoPhase = false;
      _manualPhase = name;
    },
    setVolume: function(v) {
      G.settings.volume = Math.max(0, Math.min(1, v));
      applyVolumeSetting();
    },
    setCombo: function(c) { G.combo = Math.max(0, c); },

    // Simulate a "hit" — drops combo, triggers audio effects
    simulateHit: function() {
      G.combo = 0;
      G.hp = Math.max(1, G.hp - 1);
      G.beatsSinceHit = 0;
      if (typeof StateMapper !== 'undefined') StateMapper.onHit();
      if (typeof playHitSFX === 'function') playHitSFX();
    },

    // Simulate graze event
    simulateGraze: function(tier) {
      tier = tier || 'normal';
      G.grazeStreak++;
      if (typeof StateMapper !== 'undefined') StateMapper.registerNearMiss(tier);
    },
  };
})();
