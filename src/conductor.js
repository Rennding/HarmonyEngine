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

  // ── Cycle mode state (SPEC_008 §6) ────────────────────────────────────────
  var _cycleState = null;           // null | 'decay' | 'bridge' | 'rebuild'
  var _cycleBeats = 0;              // beats elapsed in current cycle state
  var _maelstromSustainTarget = 0;  // bars to sustain before decay triggers
  var _maelstromSustainBeats = 0;   // beats counted in Maelstrom sustain
  var _nextPalette = null;          // palette selected during bridge
  var _frozenIntensity = 0;         // intensity frozen at decay start

  // Convert bars to beats (4/4 time)
  function _barsToBts(bars) { return bars * 4; }

  // ── MediaSession integration ─────────────────────────────────────────────
  // Declares the tab as an active media player to the OS. Reinforces
  // background-audio exemption from Layer 1 and exposes lock-screen /
  // notification transport controls on mobile.
  //
  // Action handler mapping (limited to standard MediaSession actions — the
  // browser/OS chooses which icons to render):
  //   play / pause / stop       → transport
  //   nexttrack / previoustrack → next / prev palette
  //   seekforward / seekbackward → step phase up / down
  var _mediaSessionBound = false;
  var _lastMediaSessionPhase = null;
  var _artworkCache = {};  // paletteName → data URL (cheap SVG)
  function _mediaSessionSupported() {
    return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
  }
  function _currentPaletteName() {
    if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine.getPalette) {
      var p = HarmonyEngine.getPalette();
      if (p && p.name) return p.name;
    }
    return '';
  }
  // Palette-colored SVG artwork as data URL. Some Chrome Android versions
  // only render the media notification when MediaMetadata.artwork is set.
  function _paletteArtwork(name) {
    if (_artworkCache[name]) return _artworkCache[name];
    var colors = {
      dark_techno:   ['#0a0a0f', '#00ffcc'],
      synthwave:     ['#1a0a2a', '#ff00aa'],
      glitch:        ['#0a1a0a', '#aaff00'],
      ambient_dread: ['#0a0a1a', '#557799'],
      lo_fi_chill:   ['#1a1a0a', '#ffcc66'],
      chiptune:      ['#000a0a', '#00ffee'],
      noir_jazz:     ['#0a0a0a', '#cc9966'],
      industrial:    ['#1a0a0a', '#ff6622'],
      vaporwave:     ['#1a0a1a', '#66ccff'],
      breakbeat:     ['#0a0a0a', '#ff3366']
    };
    var c = colors[name] || ['#0a0a0f', '#00ffcc'];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">' +
      '<rect width="512" height="512" fill="' + c[0] + '"/>' +
      '<text x="256" y="230" font-family="monospace" font-size="64" font-weight="bold" fill="' + c[1] + '" text-anchor="middle">HARMONY</text>' +
      '<text x="256" y="310" font-family="monospace" font-size="64" font-weight="bold" fill="' + c[1] + '" text-anchor="middle">ENGINE</text>' +
      '<text x="256" y="400" font-family="monospace" font-size="32" fill="' + c[1] + '" text-anchor="middle" opacity="0.7">' + (name || '').toUpperCase().replace(/_/g, ' ') + '</text>' +
      '</svg>';
    var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    _artworkCache[name] = url;
    return url;
  }
  function _updateMediaSession(state) {
    if (!_mediaSessionSupported()) return;
    try {
      var pal = _currentPaletteName();
      if (typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: pal ? ('Harmony Engine — ' + pal) : 'Harmony Engine',
          artist: pal || 'Procedural',
          album: G && G.phase ? ('Phase: ' + G.phase) : 'Procedural music station',
          artwork: [
            { src: _paletteArtwork(pal), sizes: '512x512', type: 'image/svg+xml' }
          ]
        });
      }
      navigator.mediaSession.playbackState = state; // 'playing' | 'paused' | 'none'
      if (!_mediaSessionBound) {
        var setH = function(action, fn) {
          try { navigator.mediaSession.setActionHandler(action, fn); } catch (e) {}
        };
        setH('play',          function() { Conductor.resume(); });
        setH('pause',         function() { Conductor.pause(); });
        setH('stop',          function() { Conductor.stop(); });
        setH('nexttrack',     function() { Conductor.nextPalette(); });
        setH('previoustrack', function() { Conductor.prevPalette(); });
        setH('seekforward',   function() { Conductor.stepPhase(+1); });
        setH('seekbackward',  function() { Conductor.stepPhase(-1); });
        _mediaSessionBound = true;
      }
    } catch (e) {}
  }

  // ── Maelstrom sustain check (SPEC_008 §2) ─────────────────────────────────
  function _checkMaelstromSustain(beatTime) {
    if (!G.settings.cycleMode) return;
    if (_cycleState !== null) return;       // already transitioning
    if (G.phase !== 'maelstrom') return;

    _maelstromSustainBeats++;
    if (_maelstromSustainBeats >= _barsToBts(_maelstromSustainTarget)) {
      _enterDecay(beatTime);
    }
  }

  // Called when phase changes to maelstrom — set the sustain timer
  function _onMaelstromEntry() {
    var min = CFG.CYCLE.MAELSTROM_SUSTAIN_MIN;
    var max = CFG.CYCLE.MAELSTROM_SUSTAIN_MAX;
    _maelstromSustainTarget = min + Math.floor((_songRng || Math.random)() * (max - min + 1));
    _maelstromSustainBeats = 0;
  }

  // ── Cycle state transitions (SPEC_008 §3/§4/§5/§6) ───────────────────────
  function _enterDecay(beatTime) {
    _cycleState = 'decay';
    _cycleBeats = 0;
    _frozenIntensity = G.intensity;
    // Cancel any active phase stagger — cycle choreography takes over (SPEC_010 §5.5)
    if (typeof StateMapper !== 'undefined') StateMapper.cancelStagger();
    // Schedule staggered gain ramps downward (SPEC_008 §3)
    if (typeof StateMapper !== 'undefined') StateMapper.startCycleDecay(beatTime);
    console.log('[Conductor] Cycle: entering decay (' + CFG.CYCLE.DECAY_BARS + ' bars)');
  }

  function _enterBridge(beatTime) {
    _cycleState = 'bridge';
    _cycleBeats = 0;
    console.log('[Conductor] Cycle: entering bridge (' + CFG.CYCLE.BRIDGE_BARS + ' bars)');
  }

  function _enterRebuild(beatTime) {
    _cycleState = 'rebuild';
    _cycleBeats = 0;
    _nextPalette = null; // swap is done — clear so UI no longer shows "old → new"
    // Schedule staggered gain ramps upward from 0 (SPEC_008 §5)
    if (typeof StateMapper !== 'undefined') StateMapper.startCycleRebuild(beatTime, _frozenIntensity);
    console.log('[Conductor] Cycle: entering rebuild (' + CFG.CYCLE.REBUILD_BARS + ' bars)');
  }

  function _exitCycle() {
    _cycleState = null;
    _cycleBeats = 0;
    _nextPalette = null;
    _maelstromSustainBeats = 0;
    // Hand gain control back to StateMapper._updateLayers (SPEC_008 §5)
    if (typeof StateMapper !== 'undefined') StateMapper.endCycleRebuild();
    // Enter at Swell — the cycle transition *was* Pulse, new palette picks up from Swell onward.
    // Back-compute a beatCountCycleBase so the power curve lands at exactly dc=0.30 (Swell threshold)
    // on the very next updateDC tick, giving a continuous arc without a Pulse snap.
    var moodKey = (CFG.MOODS[G.settings.mood] || CFG.MOODS[1]).name.toLowerCase();
    var curve = CFG.DIFFICULTY.CURVES[moodKey] || CFG.DIFFICULTY.CURVES.normal;
    var swellDC = 0.30; // CFG.PHASES[1].dc
    // beat that produces swellDC on the power curve: beat = scale * dc^(1/exp)
    var swellBeat = Math.round(curve.scale * Math.pow(swellDC, 1 / curve.exp));
    G.beatCountCycleBase = G.beatCount - swellBeat;

    var oldPhase = G.phase;
    G.phase = 'swell';
    G.phaseEntryBeat = G.beatCount;
    G.dc = swellDC;
    for (var j = 0; j < G._phaseChangeListeners.length; j++) {
      G._phaseChangeListeners[j]('swell', oldPhase, 0);
    }
    console.log('[Conductor] Cycle: rebuild complete, entering at swell (cycleBeat=' + swellBeat + ')');
  }

  // ── Palette swap during bridge (SPEC_008 §4) ─────────────────────────────
  function _doPaletteSwap() {
    // 1. Select next palette
    _nextPalette = _selectPalette();
    var paletteIdx = (typeof PALETTES !== 'undefined') ? PALETTES.indexOf(_nextPalette) : 0;

    // 2. New seed + PRNG
    G.songSeed = paletteIdx * 10000 + Math.floor(Math.random() * 10000);
    _songRng = _createSongRng(G.songSeed);

    // 3–4. Re-init subsystems (NOT full resetRun — preserve beatCount, audio graph, beat clock)
    if (typeof HarmonyEngine !== 'undefined') HarmonyEngine.initRun(_nextPalette);
    if (typeof PaletteBlender !== 'undefined') PaletteBlender.initRun(_nextPalette);
    if (typeof Sequencer !== 'undefined') Sequencer.initRun(_nextPalette);
    if (typeof VoicePool !== 'undefined') VoicePool.initRun(_nextPalette);
    if (typeof NarrativeConductor !== 'undefined') NarrativeConductor.initRun(_nextPalette);
    if (typeof StateMapper !== 'undefined') {
      StateMapper.initRun();
      // Re-freeze after initRun reset — we're still in bridge, ramps not yet started (SPEC_008 §4)
      StateMapper._cycleFrozen = true;
    }

    // 5. Auto BPM from new palette's range
    if (G.settings.bpmOverride === null) {
      var range = _nextPalette.bpmRange;
      G.bpm = range[0] + Math.floor((_songRng || Math.random)() * (range[1] - range[0] + 1));
    }

    // 6. Regenerate TensionMap for new palette (SPEC_011 §3.1 / §5.2)
    if (typeof TensionMap !== 'undefined') TensionMap.generate(_songRng, _nextPalette);

    console.log('[Conductor] Cycle: palette swapped to ' + _nextPalette.name +
                ' (seed=' + G.songSeed + ', bpm=' + G.bpm + ')');

    // Refresh lock-screen / notification metadata for the new palette.
    _updateMediaSession(_paused ? 'paused' : 'playing');
  }

  // ── Cycle beat processing ─────────────────────────────────────────────────
  function _processCycleBeat(beatTime) {
    if (_cycleState === null) return;

    _cycleBeats++;

    if (_cycleState === 'decay') {
      // Freeze intensity during decay (SPEC_008 §3)
      G.intensity = _frozenIntensity;
      if (_cycleBeats >= _barsToBts(CFG.CYCLE.DECAY_BARS)) {
        _enterBridge(beatTime);
      }
    } else if (_cycleState === 'bridge') {
      G.intensity = _frozenIntensity;
      // Palette swap on first beat of bridge (SPEC_008 §4)
      if (_cycleBeats === 1) {
        _doPaletteSwap();
      }
      if (_cycleBeats >= _barsToBts(CFG.CYCLE.BRIDGE_BARS)) {
        _enterRebuild(beatTime);
      }
    } else if (_cycleState === 'rebuild') {
      // Intensity stays frozen until rebuild completes
      G.intensity = _frozenIntensity;
      if (_cycleBeats >= _barsToBts(CFG.CYCLE.REBUILD_BARS)) {
        _exitCycle();
      }
    }
  }

  function _onBeat(beatTime) {
    if (!_running) return;

    G.beatCount++;
    G.beatsSinceHit++;

    // ── Tension suppression (SPEC_011 §5.1/§5.2) ─────────────────────────
    if (typeof TensionMap !== 'undefined') {
      TensionMap.setSuppressed(_cycleState !== null || !_autoPhase);
    }

    // ── Cycle state processing (before normal phase logic) ──────────────
    if (_cycleState !== null) {
      _processCycleBeat(beatTime);
    } else {
      // DC + phase progression (only when not in cycle transition)
      if (_autoPhase) {
        var prevPhase = G.phase;
        updateDC(beatTime);
        // Detect Maelstrom entry to start sustain timer
        if (G.phase === 'maelstrom' && prevPhase !== 'maelstrom') {
          _onMaelstromEntry();
        }
      } else if (_manualPhase && _manualPhase !== G.phase) {
        // Force phase — detect Maelstrom entry to start sustain timer
        var oldPhase = G.phase;
        var wasManualMaelstrom = (_manualPhase === 'maelstrom' && G.phase !== 'maelstrom');
        G.phase = _manualPhase;
        G.phaseEntryBeat = G.beatCount;
        for (var j = 0; j < G._phaseChangeListeners.length; j++) {
          G._phaseChangeListeners[j](_manualPhase, oldPhase, beatTime);
        }
        if (wasManualMaelstrom) {
          _onMaelstromEntry();
        }
      }

      // Check Maelstrom sustain regardless of auto/manual phase mode
      if (G.phase === 'maelstrom') {
        _checkMaelstromSustain(beatTime);
      }

      // Virtual intensity ramp (only when not in cycle transition)
      if (_autoIntensity) {
        G.intensity += _intensityRate;
        G.bestIntensity = Math.max(G.bestIntensity, G.intensity);
      }
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

    // Refresh MediaSession metadata when phase changes so lock-screen/notif
    // album line tracks the current phase. Cheap string compare — skip otherwise.
    if (G.phase !== _lastMediaSessionPhase) {
      _lastMediaSessionPhase = G.phase;
      _updateMediaSession(_paused ? 'paused' : 'playing');
    }

    // Dispatch beat event for UI (extended with cycleState — SPEC_008 §9)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('conductor:beat', {
        detail: {
          beat: G.beatCount, phase: G.phase, dc: G.dc,
          intensity: G.intensity, bpm: G.bpm,
          cycleState: _cycleState,
          nextPalette: (_cycleState && _nextPalette) ? _nextPalette.name : null
        }
      }));
    }
  }

  // ── Reset cycle state (called on stop and start) ──────────────────────────
  function _resetCycleState() {
    _cycleState = null;
    _cycleBeats = 0;
    _maelstromSustainTarget = 0;
    _maelstromSustainBeats = 0;
    _nextPalette = null;
    _frozenIntensity = 0;
  }

  return {
    start: function(seedOverride) {
      if (_running) this.stop();
      _running = true;
      _paused = false;
      _resetCycleState();

      resetRun(seedOverride);

      initAudio();
      // Resume AudioContext (may be suspended by autoplay policy or after stop()).
      // startBeatClock after context is running so scheduled times are valid.
      var self = this;
      var resumePromise = (audioCtx && audioCtx.state !== 'running')
        ? audioCtx.resume()
        : Promise.resolve();
      resumePromise.then(function() {
        startBeatClock(_onBeat);
        _updateMediaSession('playing');
      });
    },

    stop: function() {
      _running = false;
      _resetCycleState();
      stopBeatClock();
      // Suspend (not close) AudioContext so it can be reused next play.
      if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'running') {
        audioCtx.suspend();
      }
      if (typeof VoicePool !== 'undefined') VoicePool.shutdown();
      if (typeof StateMapper !== 'undefined') StateMapper.shutdown();
      if (typeof MelodyEngine !== 'undefined') MelodyEngine.shutdown();
      if (typeof NarrativeConductor !== 'undefined') NarrativeConductor.shutdown();
      _updateMediaSession('none');
    },

    pause: function() {
      if (!_running || _paused) return;
      _paused = true;
      stopBeatClock();
      _updateMediaSession('paused');
    },

    resume: function() {
      if (!_running || !_paused) return;
      _paused = false;
      startBeatClock(_onBeat);
      _updateMediaSession('playing');
    },

    isRunning: function() { return _running; },
    isPaused: function() { return _paused; },

    // --- Cycle mode API (SPEC_008 §7) ---
    setCycleMode: function(v) {
      var was = G.settings.cycleMode;
      G.settings.cycleMode = !!v;
      // When turning cycle mode off, anchor beatCountCycleBase so updateDC
      // restarts its power curve from the current beat (avoids Maelstrom snap).
      if (was && !G.settings.cycleMode) {
        // Abort any in-progress cycle transition
        _resetCycleState();
        // Re-enter at Swell so the arc continues naturally (same logic as _exitCycle)
        var moodKey2 = (CFG.MOODS[G.settings.mood] || CFG.MOODS[1]).name.toLowerCase();
        var curve2 = CFG.DIFFICULTY.CURVES[moodKey2] || CFG.DIFFICULTY.CURVES.normal;
        var swellBeat2 = Math.round(curve2.scale * Math.pow(0.30, 1 / curve2.exp));
        G.beatCountCycleBase = G.beatCount - swellBeat2;
        G.dc = 0.30;
        var oldPhase2 = G.phase;
        G.phase = 'swell';
        G.phaseEntryBeat = G.beatCount;
        for (var j = 0; j < G._phaseChangeListeners.length; j++) {
          G._phaseChangeListeners[j]('swell', oldPhase2, 0);
        }
      }
      console.log('[Conductor] Cycle mode: ' + (G.settings.cycleMode ? 'ON' : 'OFF'));
    },
    isCycleMode: function() { return G.settings.cycleMode; },
    getCycleState: function() { return _cycleState; },

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
    setAutoPhase: function(v) { _autoPhase = !!v; },
    forcePhase: function(name) {
      // Locked during cycle transitions (SPEC_008 §10)
      if (_cycleState !== null) {
        console.log('[Conductor] forcePhase ignored — cycle transition in progress');
        return;
      }
      _autoPhase = false;
      _manualPhase = name;
      _updateMediaSession(_paused ? 'paused' : 'playing');
    },

    // Step forward/backward through CFG.PHASES (wraps).
    // delta = +1 or -1. Locked during cycle transitions.
    stepPhase: function(delta) {
      if (_cycleState !== null) return;
      if (typeof CFG === 'undefined' || !CFG.PHASES) return;
      var phases = CFG.PHASES;
      var cur = (typeof G !== 'undefined' && G.phase) ? G.phase : phases[0].name;
      var idx = 0;
      for (var i = 0; i < phases.length; i++) {
        if (phases[i].name === cur) { idx = i; break; }
      }
      var next = ((idx + delta) % phases.length + phases.length) % phases.length;
      _autoPhase = false;
      _manualPhase = phases[next].name;
      _updateMediaSession(_paused ? 'paused' : 'playing');
    },

    // Switch to a different palette. Uses stop+lockPalette+start — a brief
    // gap, but deterministic. Mid-stream swap without cycle-mode is avoided
    // because StateMapper/HarmonyEngine state machines expect cycle scaffolding.
    setPalette: function(idx) {
      if (typeof PALETTES === 'undefined') return;
      var n = PALETTES.length;
      var clamped = ((idx % n) + n) % n;
      var wasRunning = _running;
      if (wasRunning) this.stop();
      this.lockPalette(clamped);
      if (wasRunning) this.start(null);
    },
    nextPalette: function() {
      if (typeof PALETTES === 'undefined') return;
      var cur = (typeof HarmonyEngine !== 'undefined' && HarmonyEngine.getPalette)
        ? HarmonyEngine.getPalette() : null;
      var i = cur ? PALETTES.indexOf(cur) : -1;
      this.setPalette((i < 0 ? 0 : i + 1));
    },
    prevPalette: function() {
      if (typeof PALETTES === 'undefined') return;
      var cur = (typeof HarmonyEngine !== 'undefined' && HarmonyEngine.getPalette)
        ? HarmonyEngine.getPalette() : null;
      var i = cur ? PALETTES.indexOf(cur) : 0;
      this.setPalette(i - 1);
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
