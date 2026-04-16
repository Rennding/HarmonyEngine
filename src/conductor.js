// ========== VIRTUAL CONDUCTOR ==========
// Replaces the game loop. Simulates phase progression, intensity ramp,
// and musical events so the audio engine plays a full song autonomously.

var Conductor = (function() {
  var _running = false;
  var _paused = false;
  var _autoIntensity = true;  // simulate intensity ramp
  var _autoPhase = true;      // let DC drive phase transitions
  var _manualPhase = null;    // override phase when autoPhase=false
  var _intensityRate = 1;     // intensity increment per beat (simulate player skill)

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

    // Virtual intensity ramp
    if (_autoIntensity) {
      G.intensity += _intensityRate;
      G.bestIntensity = Math.max(G.bestIntensity, G.intensity);
    }

    // Score
    G.score += 10 + Math.floor(G.intensity * 0.5);

    // Advance audio subsystems
    if (typeof HarmonyEngine !== 'undefined') HarmonyEngine.advanceBeat();
    if (typeof Sequencer !== 'undefined') Sequencer.tick(beatTime);
    if (typeof StateMapper !== 'undefined') StateMapper.update(beatTime);
    if (typeof MelodyEngine !== 'undefined') MelodyEngine.updateIntensity(G.intensity);
    if (typeof NarrativeConductor !== 'undefined') NarrativeConductor.onBeat(beatTime);
    if (typeof PaletteBlender !== 'undefined') PaletteBlender.onBeat();
    if (typeof GrooveEngine !== 'undefined') GrooveEngine.onPhaseChange(G.phase);

    // Dispatch beat event for UI
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('conductor:beat', {
        detail: { beat: G.beatCount, phase: G.phase, dc: G.dc, intensity: G.intensity, bpm: G.bpm }
      }));
    }
  }

  return {
    start: function() {
      if (_running) this.stop();
      _running = true;
      _paused = false;

      resetRun();

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
      if (typeof VoicePool !== 'undefined') VoicePool.shutdown();
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

    // --- Palette lock ---
    lockPalette: function(idx) {
      // idx = 0-based palette index. Stores as 1-based in G.settings.palette.
      // _selectPalette() treats 0=random, 1..N=locked.
      if (typeof G !== 'undefined' && G.settings) {
        G.settings.palette = (idx >= 0) ? idx + 1 : 0;
      }
    },
    unlockPalette: function() {
      if (typeof G !== 'undefined' && G.settings) {
        G.settings.palette = 0;
      }
    },

    // --- Controls ---
    setAutoIntensity: function(v) { _autoIntensity = !!v; },
    setIntensityRate: function(r) { _intensityRate = Math.max(0, r); },
    setAutoPhase: function(v) { _autoPhase = !!v; },
    forcePhase: function(name) {
      _autoPhase = false;
      _manualPhase = name;
    },
    setVolume: function(v) {
      G.settings.volume = Math.max(0, Math.min(1, v));
      applyVolumeSetting();
    },

    // --- BPM override ---
    setBPM: function(bpm) {
      // Clamp to slider range; takes effect on next beat (beat clock reads G.bpm dynamically)
      var clamped = Math.max(60, Math.min(200, Math.round(bpm)));
      G.settings.bpmOverride = clamped;
      G.bpm = clamped;
    },
    setAutoBPM: function() {
      G.settings.bpmOverride = null;
      // G.bpm stays at current value until next resetRun(); that's acceptable —
      // the user pressed Auto so the next Play will pick the natural palette BPM.
    },
    setIntensity: function(c) { G.intensity = Math.max(0, c); },

    // Simulate a "hit" — drops intensity, triggers audio effects
    simulateHit: function() {
      G.intensity = 0;
      G.energy = Math.max(1, G.energy - 1);
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
