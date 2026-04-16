// ========== STATE MAPPER — GAME DRIVES MUSIC ==========
// Maps game state (intensity, energy, near-misses, beatCount) to musical parameters.
// Section progression: intro → build → groove → peak → evolve.
// Intensity drives layer addition, energy drives tension, near-misses spike delay feedback.

var StateMapper = {
  _nearMisses:        [],      // beat numbers of recent near-misses
  _hitStrip:          false,   // kick-only mode after player hit
  _hitStripBeatsLeft: 0,
  _energyFilter:      null,    // high-pass BiquadFilter on master chain
  _tremoloGain:       null,    // gain node for energy=1 tremolo
  _tremoloOsc:        null,    // LFO driving tremolo
  _deathFading:       false,
  _modulatedUp:       false,   // true if key was modulated up at Storm
  _phaseRegistered:   false,   // ensures one-time listener registration
  _stingerGain:       null,    // dedicated one-shot gain node for stingers
  _fxBaselines:       null,    // { reverbWet, delayFb, dist } captured at initRun
  _sidechainPhaseMult: 1.0,    // per-phase sidechain intensity multiplier (SPEC_016 §5)
  _cycleFrozen: false,         // true during decay/bridge — suppress _updateLayers

  // ── PhaseStagger state (SPEC_010) ──────────────────────────────────────────
  _staggerQueue:    [],      // { group, triggerBeat, phase, oldPhase }
  _staggerActive:   false,   // true while stagger window is in progress
  _staggerBaseBeat: 0,       // beat when phase change was initiated
  _effectiveFloor:  null,    // per-track floor override during stagger (or null = use G.phase)

  // --- Init per run ---
  initRun: function() {
    this._nearMisses        = [];
    this._hitStrip          = false;
    this._hitStripBeatsLeft = 0;
    this._deathFading       = false;
    this._modulatedUp       = false;
    this._postStormModRegistered = false;
    this._lastPostStormModBeat = 0;
    this._darkenedKey       = false;   // energy=1 key darken active
    this._sidechainPhaseMult = 1.0;
    this._cycleFrozen       = false;
    this._staggerQueue      = [];
    this._staggerActive     = false;
    this._staggerBaseBeat   = 0;
    this._effectiveFloor    = null;
    this._initEnergyFilter();
    this._initTremolo();
    this._initStingerGain();

    // Capture FX baselines from audio graph (set during initAudio)
    this._fxBaselines = {
      reverbWet: (_reverbWet ? _reverbWet.gain.value : 0.3),
      delayFb:   (_delayFeedback ? _delayFeedback.gain.value : 0.25),
      dist:      0,  // waveshaper starts with 0 distortion curve amount
    };

    // Register phase-change listener once (persists across runs since
    // G._phaseChangeListeners is reset in resetRun before initRun)
    if (typeof onPhaseChange === 'function') {
      onPhaseChange(this._onPhaseChange.bind(this));
    }
  },

  // --- Energy high-pass filter: inserted between submixGain and _compressor ---
  // At init, spliced into the existing chain: submix → energyFilter → compressor
  _initEnergyFilter: function() {
    if (!audioCtx || !submixGain || !_compressor) return;

    var upstream = (typeof _sidechainGain !== 'undefined' && _sidechainGain) ? _sidechainGain : submixGain;

    // Tear down previous filter if it exists (prevents parallel paths on retry)
    if (this._energyFilter) {
      try { upstream.disconnect(this._energyFilter); } catch(e) {}
      try { this._energyFilter.disconnect(_compressor); } catch(e) {}
      try { this._energyFilter.disconnect(); } catch(e) {}
    }

    // Also remove any direct upstream→compressor connection
    try { upstream.disconnect(_compressor); } catch(e) {}

    this._energyFilter = audioCtx.createBiquadFilter();
    this._energyFilter.type = 'highpass';
    this._energyFilter.frequency.value = 10; // effectively off (sub-audible)
    this._energyFilter.Q.value = 0.7;

    // Rewire: upstream → energyFilter → compressor
    upstream.connect(this._energyFilter);
    this._energyFilter.connect(_compressor);
  },

  // --- Tremolo for energy=1 danger state ---
  _initTremolo: function() {
    if (!audioCtx || !masterGain) return;

    // Tear down previous tremolo chain BEFORE creating new nodes.
    // Must happen while this._tremoloGain still references the old node,
    // otherwise the old node stays connected as a zombie parallel path.
    if (this._tremoloOsc) {
      try { this._tremoloOsc.stop(); } catch(e) {}
      try { this._tremoloOsc.disconnect(); } catch(e) {}
    }
    if (this._lfoDepth) {
      try { this._lfoDepth.disconnect(); } catch(e) {}
    }
    if (this._tremoloGain) {
      try { waveshaper.disconnect(this._tremoloGain); } catch(e) {}
      try { this._tremoloGain.disconnect(masterGain); } catch(e) {}
      try { this._tremoloGain.disconnect(); } catch(e) {}
    }

    // Create fresh nodes
    this._tremoloGain = audioCtx.createGain();
    this._tremoloGain.gain.value = 1.0;

    this._tremoloOsc = audioCtx.createOscillator();
    this._tremoloOsc.type = 'sine';
    this._tremoloOsc.frequency.value = 4; // 4Hz tremolo

    // LFO → tremolo gain modulation (need a gain node to scale LFO depth)
    var lfoDepth = audioCtx.createGain();
    lfoDepth.gain.value = 0; // 0 = no tremolo; set >0 when energy=1
    this._tremoloOsc.connect(lfoDepth);
    lfoDepth.connect(this._tremoloGain.gain);
    this._tremoloOsc.start();
    this._lfoDepth = lfoDepth;

    // Splice into master chain: waveshaper → tremolo → masterGain
    // Remove any direct waveshaper→masterGain edge first
    try { waveshaper.disconnect(masterGain); } catch(e) {}
    waveshaper.connect(this._tremoloGain);
    this._tremoloGain.connect(masterGain);
  },

  // --- Called every beat from _onBeat ---
  update: function(beatTime) {
    if (this._deathFading) return;

    var intensity = G.intensity;
    var energy    = G.energy;
    var beatCount = G.beatCount;

    // --- Cycle transition: suppress layer management, skip energy/near-miss effects ---
    // Gain ramps are pre-scheduled; _updateLayers would fight them. (SPEC_008 §3/§5)
    if (this._cycleFrozen) return;

    // --- PhaseStagger queue processing (SPEC_010 §2.1) ---
    if (this._staggerActive) {
      this._processStaggerQueue(beatTime);
    }

    // --- Hit strip countdown ---
    if (this._hitStrip) {
      this._hitStripBeatsLeft--;
      if (this._hitStripBeatsLeft <= 0) {
        this._hitStrip = false;
        // Re-entry rebuild: ramp track gains back up over 2 beats (SPEC_020 §3)
        if (typeof NarrativeConductor !== 'undefined') {
          NarrativeConductor.onReentry(beatTime);
        }
      }
    }

    // --- Set sequencer mutes: phase floor + intensity ceiling ---
    this._updateLayers(G.phase, intensity);

    // --- Melody intensity interaction (SPEC_017 §5) ---
    if (typeof MelodyEngine !== 'undefined') MelodyEngine.updateIntensity(intensity);

    // --- Narrative conductor beat tick (SPEC_020 §1) ---
    if (typeof NarrativeConductor !== 'undefined') NarrativeConductor.onBeat(beatTime);

    // --- Energy tension effects ---
    this._updateEnergyEffects(energy);

    // --- Near-miss: expire old entries (keep last 8 beats) ---
    var cutoff = beatCount - 8;
    while (this._nearMisses.length > 0 && this._nearMisses[0] < cutoff) {
      this._nearMisses.shift();
    }

    // --- Near-miss delay feedback spike ---
    this._updateNearMissEffects();

    // --- Post-Storm periodic modulation (SPEC_017 §3): every 64 beats, +2 or +5 semitones ---
    if (this._postStormModRegistered && typeof HarmonyEngine !== 'undefined') {
      var phasesReady = ['storm', 'maelstrom'];
      if (phasesReady.indexOf(G.phase) >= 0 &&
          beatCount > 0 &&
          (beatCount - this._lastPostStormModBeat) >= 64) {
        this._lastPostStormModBeat = beatCount;
        // +2 (whole step) or +5 (perfect 4th)
        var interval = (_songRng || Math.random)() < 0.5 ? 2 : 5;
        HarmonyEngine.modulateTo(HarmonyEngine.root + interval, 'pivot');
      }
    }

    // --- Pre-phase tension: snare+hat drop 4 beats before phase transition (SPEC_020 §8) ---
    if (typeof NarrativeConductor !== 'undefined' && !this._hitStrip) {
      var nextPhaseIdx = -1;
      var phases = CFG.PHASES;
      for (var pi = 0; pi < phases.length; pi++) {
        if (phases[pi].name === G.phase) { nextPhaseIdx = pi + 1; break; }
      }
      if (nextPhaseIdx > 0 && nextPhaseIdx < phases.length) {
        var nextDC = phases[nextPhaseIdx].dc;
        // Estimate beats until phase change (rough: 4 beats ~ 0.05 DC at Normal pace)
        var dcGap = nextDC - G.dc;
        if (dcGap > 0 && dcGap < 0.06) {
          NarrativeConductor.schedulePrePhaseTension(
            audioCtx ? audioCtx.currentTime : 0
          );
        }
      }
    }
  },

  // --- Cycle mode: compute per-track target gain for surge phase (SPEC_008 §5) ---
  _surgeTargetGain: function(track, intensity) {
    var floor = CFG.PHASE_FLOOR.surge;
    var thresh = CFG.INTENSITY_LAYER_THRESHOLDS;
    var inFlr = !!floor[track];
    var intensityThresh = thresh[track] || Infinity;
    var intensityUnlocked = intensity >= intensityThresh;
    if (!inFlr && !intensityUnlocked) return 0.0;
    if (inFlr) {
      return 0.3 + 0.7 * Math.min(intensity / 50, 1.0);
    }
    var above = Math.min(Math.max(intensity - intensityThresh, 0) / 30, 1.0);
    return 0.3 + 0.7 * above;
  },

  // --- Cycle decay: stagger-ramp all non-kick tracks to 0 (SPEC_008 §3) ---
  // Called on first beat of decay. Schedules all ramps upfront using beatTime.
  startCycleDecay: function(beatTime) {
    if (!audioCtx || typeof _trackGains === 'undefined') return;
    this._cycleFrozen = true;
    var t = beatTime || audioCtx.currentTime;
    var beatSec = (CFG.BEAT_MS || (60000 / (G.bpm || 120))) / 1000;
    var barSec = beatSec * 4;

    // Groups with ramp start offsets (bars): melody=0, pad+perc=4, snare+bass=8, hat=12
    // Ramp duration: 4 bars each
    var groups = [
      { tracks: ['melody'],        startBar: 0 },
      { tracks: ['pad', 'perc'],   startBar: 4 },
      { tracks: ['snare', 'bass'], startBar: 8 },
      { tracks: ['hat'],           startBar: 12 },
    ];

    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      var rampStart = t + g.startBar * barSec;
      var rampEnd   = rampStart + 4 * barSec;
      for (var ti = 0; ti < g.tracks.length; ti++) {
        var trk = g.tracks[ti];
        var node = _trackGains[trk];
        if (!node) continue;
        node.gain.cancelScheduledValues(rampStart);
        node.gain.setValueAtTime(node.gain.value, rampStart);
        node.gain.linearRampToValueAtTime(0.0, rampEnd);
      }
    }
    // Kick stays full — explicitly protect it
    if (_trackGains.kick) {
      _trackGains.kick.gain.cancelScheduledValues(t);
      _trackGains.kick.gain.setValueAtTime(_trackGains.kick.gain.value, t);
    }
    console.log('[StateMapper] Cycle decay ramps scheduled at t=' + t.toFixed(3));
  },

  // --- Cycle rebuild: stagger-ramp tracks from 0 to surge targets (SPEC_008 §5) ---
  // Called on first beat of rebuild. All non-kick tracks should already be at 0 (post-bridge).
  startCycleRebuild: function(beatTime, frozenIntensity) {
    if (!audioCtx || typeof _trackGains === 'undefined') return;
    this._cycleFrozen = true;  // still frozen during rebuild
    var t = beatTime || audioCtx.currentTime;
    var intensity = (typeof frozenIntensity === 'number') ? frozenIntensity : (G.intensity || 0);
    var beatSec = (CFG.BEAT_MS || (60000 / (G.bpm || 120))) / 1000;
    var barSec = beatSec * 4;

    // Groups with ramp start offsets (bars): hat=0, snare+bass=4, pad+perc=8, melody=12
    var groups = [
      { tracks: ['hat'],           startBar: 0 },
      { tracks: ['snare', 'bass'], startBar: 4 },
      { tracks: ['pad', 'perc'],   startBar: 8 },
      { tracks: ['melody'],        startBar: 12 },
    ];

    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      var rampStart = t + g.startBar * barSec;
      var rampEnd   = rampStart + 4 * barSec;
      for (var ti = 0; ti < g.tracks.length; ti++) {
        var trk = g.tracks[ti];
        var node = _trackGains[trk];
        if (!node) continue;
        var target = this._surgeTargetGain(trk, intensity);
        node.gain.cancelScheduledValues(rampStart);
        node.gain.setValueAtTime(0.0, rampStart);
        node.gain.linearRampToValueAtTime(target, rampEnd);
      }
    }
    // Kick: already at full — ensure it stays there
    if (_trackGains.kick) {
      _trackGains.kick.gain.cancelScheduledValues(t);
      _trackGains.kick.gain.setValueAtTime(_trackGains.kick.gain.value, t);
    }
    // Unmute all tracks in sequencer so they produce sound
    if (typeof Sequencer !== 'undefined') {
      var m = Sequencer._mute;
      var allTracks = ['hat', 'snare', 'bass', 'pad', 'perc', 'melody'];
      for (var i = 0; i < allTracks.length; i++) m[allTracks[i]] = false;
      m.kick = false;
    }
    console.log('[StateMapper] Cycle rebuild ramps scheduled at t=' + t.toFixed(3));
  },

  // --- Cycle rebuild complete: hand control back to _updateLayers (SPEC_008 §5) ---
  endCycleRebuild: function() {
    this._cycleFrozen = false;
    console.log('[StateMapper] Cycle rebuild done — _updateLayers resumed');
  },

  // --- Layer activation: continuous arrangement engine (SPEC_020 §6) ---
  // Phase floor = minimum 0.3 gain. Intensity ramps gain from floor→1.0.
  // Hit-strip: snap to floor gains for 4 beats.
  // Track gains ramp smoothly via AudioParam.setTargetAtTime.
  _updateLayers: function(phase, intensity) {
    if (typeof Sequencer === 'undefined') return;
    var m = Sequencer._mute;
    // During stagger, use _effectiveFloor (per-track overrides) instead of phase floor
    var floor = this._effectiveFloor || CFG.PHASE_FLOOR[phase] || CFG.PHASE_FLOOR.pulse;
    var thresh = CFG.INTENSITY_LAYER_THRESHOLDS;
    var tracks = ['hat', 'snare', 'bass', 'pad', 'perc', 'melody'];
    var hasGainNodes = (typeof _trackGains !== 'undefined');
    var t = (audioCtx) ? audioCtx.currentTime : 0;
    var rampTau = 0.15; // ~150ms smooth ramp time constant

    // Kick is always unmuted, full gain
    m.kick = false;

    if (this._hitStrip) {
      // After hit: only floor tracks audible, at floor gain
      for (var i = 0; i < tracks.length; i++) {
        var tk = tracks[i];
        var inFloor = !!floor[tk];
        m[tk] = !inFloor;
        if (hasGainNodes && _trackGains[tk]) {
          var floorGain = inFloor ? 0.3 : 0.0;
          _trackGains[tk].gain.setTargetAtTime(floorGain, t, 0.02);
        }
      }
      return;
    }

    // Capture previous mute state for transition detection (SPEC_020 §3)
    var prevMute = {};
    for (var p = 0; p < tracks.length; p++) prevMute[tracks[p]] = m[tracks[p]];

    // For each track: compute continuous gain based on floor + intensity
    for (var j = 0; j < tracks.length; j++) {
      var trk = tracks[j];
      var inFlr = !!floor[trk];
      var intensityThresh = thresh[trk] || Infinity;
      var intensityUnlocked = intensity >= intensityThresh;

      // Track is audible if in floor or intensity-unlocked
      m[trk] = !(inFlr || intensityUnlocked);

      // Continuous gain: smooth ramp from floor (0.3) to full (1.0) over intensity range
      if (hasGainNodes && _trackGains[trk]) {
        var targetGain;
        if (m[trk]) {
          // Track is muted — gain to 0
          targetGain = 0.0;
        } else if (inFlr) {
          // In phase floor: ramp from 0.3 (threshold) to 1.0 over intensity 0→50
          var intensityNorm = Math.min(intensity / 50, 1.0);
          targetGain = 0.3 + 0.7 * intensityNorm;
        } else {
          // Intensity-unlocked (above threshold): ramp from 0.3 at threshold to 1.0 over next 30
          var intensityAbove = intensity - intensityThresh;
          var aboveNorm = Math.min(Math.max(intensityAbove, 0) / 30, 1.0);
          targetGain = 0.3 + 0.7 * aboveNorm;
        }
        _trackGains[trk].gain.setTargetAtTime(targetGain, t, rampTau);
      }
    }

    // Detect muted→unmuted transitions → trigger introduction (SPEC_020 §3)
    if (typeof NarrativeConductor !== 'undefined') {
      var beatTime = audioCtx ? audioCtx.currentTime : 0;
      for (var k = 0; k < tracks.length; k++) {
        if (prevMute[tracks[k]] && !m[tracks[k]]) {
          NarrativeConductor.onTrackIntro(tracks[k], beatTime);
        }
      }
    }

    // Pattern complexity tiers: select simple/base/complex based on intensity (SPEC_020 §6)
    if (typeof Sequencer !== 'undefined') {
      Sequencer._intensityComplexity = (intensity >= 25) ? 'complex' : (intensity >= 10) ? 'base' : 'simple';
    }

  },

  // --- Energy effects: filter + tremolo ---
  _updateEnergyEffects: function(energy) {
    if (!this._energyFilter || !audioCtx) return;
    var t = audioCtx.currentTime;

    if (energy >= 3) {
      // Normal: energy filter off, no tremolo
      this._energyFilter.frequency.setTargetAtTime(10, t, 0.1);
      if (this._lfoDepth) this._lfoDepth.gain.setTargetAtTime(0, t, 0.1);
    } else if (energy === 2) {
      // Tension: high-pass rises to 200Hz, no tremolo yet
      this._energyFilter.frequency.setTargetAtTime(200, t, 0.15);
      if (this._lfoDepth) this._lfoDepth.gain.setTargetAtTime(0, t, 0.1);
    } else {
      // Danger (energy=1): high-pass at 400Hz + tremolo active
      this._energyFilter.frequency.setTargetAtTime(400, t, 0.15);
      if (this._lfoDepth) this._lfoDepth.gain.setTargetAtTime(0.3, t, 0.2);
    }
  },

  // --- Near-miss feedback: spike delay feedback briefly ---
  _updateNearMissEffects: function() {
    if (!_delayFeedback || !audioCtx) return;
    var recentCount = this._nearMisses.length;
    var t = audioCtx.currentTime;

    if (recentCount > 0) {
      // Spike delay feedback proportional to recent near-misses
      var spikedFeedback = Math.min(0.25 + recentCount * 0.08, 0.6);
      _delayFeedback.gain.setTargetAtTime(spikedFeedback, t, 0.05);
    } else {
      // Return to baseline
      _delayFeedback.gain.setTargetAtTime(0.25, t, 0.15);
    }
  },

  // --- Stinger gain node: dedicated one-shot path → submixGain ---
  _initStingerGain: function() {
    if (!audioCtx || !submixGain) return;
    if (this._stingerGain) {
      try { this._stingerGain.disconnect(); } catch(e) {}
    }
    this._stingerGain = audioCtx.createGain();
    this._stingerGain.gain.value = CFG.GAIN.stinger;
    this._stingerGain.connect(sfxGain);
  },

  // --- Apply phase FX: ramp reverb/delay/dist/sidechain over 2 beats (SPEC_011 §3.4, SPEC_016 §7) ---
  _applyPhaseEffects: function(newPhase, beatTime) {
    if (!audioCtx || !this._fxBaselines) return;
    var t = beatTime || audioCtx.currentTime;
    var rampSec = (CFG.BEAT_MS * 2) / 1000; // 2 beats

    // Try palette-specific phase FX first (SPEC_016 §7), fall back to CFG.PHASE_FX
    var paletteFx = null;
    if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine._palette &&
        HarmonyEngine._palette.effects && HarmonyEngine._palette.effects.phases) {
      paletteFx = HarmonyEngine._palette.effects.phases[newPhase];
    }

    if (paletteFx) {
      // ── Palette-driven FX (SPEC_016 §7) ──

      // Reverb send amounts on per-track sends
      if (typeof _trackReverbSends !== 'undefined') {
        var revTarget = Math.min(paletteFx.reverbSend, 0.70); // cap to prevent wet buildup
        var sendNames = ['pad', 'snare'];
        var sendMults = { pad: 1.0, snare: 0.4 }; // relative send levels
        for (var ri = 0; ri < sendNames.length; ri++) {
          var sn = sendNames[ri];
          if (_trackReverbSends[sn]) {
            var rv = revTarget * (sendMults[sn] || 1.0);
            _trackReverbSends[sn].gain.cancelScheduledValues(t);
            _trackReverbSends[sn].gain.setValueAtTime(_trackReverbSends[sn].gain.value, t);
            _trackReverbSends[sn].gain.linearRampToValueAtTime(rv, t + rampSec);
          }
        }
      }

      // Delay feedback + time
      if (_delayFeedback) {
        _delayFeedback.gain.cancelScheduledValues(t);
        _delayFeedback.gain.setValueAtTime(_delayFeedback.gain.value, t);
        _delayFeedback.gain.linearRampToValueAtTime(Math.min(paletteFx.delayFb, 0.55), t + rampSec);
      }
      if (_delay && paletteFx.delayTime && typeof G !== 'undefined' && G.bpm) {
        var beatSec = 60 / G.bpm;
        var dMap = { '4n': beatSec, '8n': beatSec / 2, '16n': beatSec / 4 };
        var dTime = dMap[paletteFx.delayTime] || (beatSec / 2);
        _delay.delayTime.cancelScheduledValues(t);
        _delay.delayTime.setValueAtTime(_delay.delayTime.value, t);
        _delay.delayTime.linearRampToValueAtTime(dTime, t + rampSec);
      }

      // Delay send amounts
      if (typeof _trackDelaySends !== 'undefined') {
        var dlTarget = paletteFx.delaySend;
        if (_trackDelaySends.sfx) {
          _trackDelaySends.sfx.gain.cancelScheduledValues(t);
          _trackDelaySends.sfx.gain.setValueAtTime(_trackDelaySends.sfx.gain.value, t);
          _trackDelaySends.sfx.gain.linearRampToValueAtTime(dlTarget * 0.3, t + rampSec);
        }
      }

      // Distortion (legacy waveshaper — still drives soft saturation feel)
      if (waveshaper && paletteFx.dist > 0) {
        waveshaper.curve = _makeDistortionCurve(paletteFx.dist);
      }

      // Per-track sidechain intensity scaling
      if (typeof _SIDECHAIN_PROFILES !== 'undefined' && paletteFx.sidechainMult) {
        StateMapper._sidechainPhaseMult = paletteFx.sidechainMult;
      }
    } else {
      // ── Legacy fallback: CFG.PHASE_FX additive system ──
      var fx = CFG.PHASE_FX[newPhase];
      if (!fx) return;
      var base = this._fxBaselines;

      if (_reverbWet) {
        var targetWet = Math.min(base.reverbWet + fx.reverbAdd, 0.85);
        _reverbWet.gain.cancelScheduledValues(t);
        _reverbWet.gain.setValueAtTime(_reverbWet.gain.value, t);
        _reverbWet.gain.linearRampToValueAtTime(targetWet, t + rampSec);
        if (_reverbDry) {
          _reverbDry.gain.cancelScheduledValues(t);
          _reverbDry.gain.setValueAtTime(_reverbDry.gain.value, t);
          _reverbDry.gain.linearRampToValueAtTime(Math.max(1 - targetWet, 0.2), t + rampSec);
        }
      }
      if (_delayFeedback) {
        var targetFb = Math.min(base.delayFb + fx.delayFbAdd, 0.55);
        _delayFeedback.gain.cancelScheduledValues(t);
        _delayFeedback.gain.setValueAtTime(_delayFeedback.gain.value, t);
        _delayFeedback.gain.linearRampToValueAtTime(targetFb, t + rampSec);
      }
      if (waveshaper && fx.distAdd > 0) {
        waveshaper.curve = _makeDistortionCurve(base.dist + fx.distAdd);
      }
      if (typeof _pumpSidechain === 'function' && fx.sidechainAdd > 0) {
        StateMapper._sidechainTarget = 0.6 + fx.sidechainAdd;
      }
    }

    // Pad detune: doubles at Maelstrom (SPEC_011 §3.2) — applies regardless of path
    var phaseFxCfg = CFG.PHASE_FX[newPhase];
    if (typeof PadTrack !== 'undefined' && PadTrack._palette && phaseFxCfg) {
      PadTrack._detuneOverride = phaseFxCfg.detuneAdd > 0
        ? (PadTrack._palette.detune || 12) + phaseFxCfg.detuneAdd
        : 0;
    }
  },

  // --- Play transition stinger: short one-shot sound (SPEC_011 §3.3) ---
  _playStinger: function(newPhase, beatTime) {
    if (!audioCtx || !this._stingerGain) return;
    var t = beatTime || audioCtx.currentTime;
    var g = this._stingerGain;

    if (newPhase === 'swell') {
      // Rising bass sweep: low→mid sine, 300ms
      var osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(55, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.3);
      var env = audioCtx.createGain();
      env.gain.setValueAtTime(CFG.GAIN.stinger, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(env);
      env.connect(g);
      osc.start(t);
      osc.stop(t + 0.4);
    } else if (newPhase === 'surge') {
      // Crash cymbal (noise burst) + chord stab
      if (typeof _getNoiseBuffer === 'function') {
        var nb = _getNoiseBuffer();
        if (nb) {
          var src = audioCtx.createBufferSource();
          src.buffer = nb;
          var bp = audioCtx.createBiquadFilter();
          bp.type = 'highpass';
          bp.frequency.value = 3000;
          var env2 = audioCtx.createGain();
          env2.gain.setValueAtTime(CFG.GAIN.stinger, t);
          env2.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
          src.connect(bp);
          bp.connect(env2);
          env2.connect(g);
          src.start(t);
          src.stop(t + 0.45);
        }
      }
      // Chord stab (root + 5th)
      if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine._currentChord) {
        var root = HarmonyEngine._currentChord.rootSemitone + 48;
        [root, root + 7].forEach(function(midi) {
          var o = audioCtx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = midiToFreq(midi);
          var eg = audioCtx.createGain();
          eg.gain.setValueAtTime(CFG.GAIN.stinger * 0.6, t);
          eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
          o.connect(eg);
          eg.connect(g);
          o.start(t);
          o.stop(t + 0.3);
        });
      }
    } else if (newPhase === 'storm') {
      // Descending chromatic run (3 notes, 100ms each) + sub drop
      if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine._currentChord) {
        var base = HarmonyEngine._currentChord.rootSemitone + 60;
        [0, -1, -2].forEach(function(off, i) {
          var o = audioCtx.createOscillator();
          o.type = 'square';
          o.frequency.value = midiToFreq(base + off);
          var eg = audioCtx.createGain();
          eg.gain.setValueAtTime(0.0001, t + i * 0.1);
          eg.gain.linearRampToValueAtTime(CFG.GAIN.stinger * 0.7, t + i * 0.1 + 0.01);
          eg.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.1 + 0.1);
          o.connect(eg);
          eg.connect(g);
          o.start(t + i * 0.1);
          o.stop(t + i * 0.1 + 0.12);
        });
      }
      // Sub drop
      var sub = audioCtx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(80, t);
      sub.frequency.exponentialRampToValueAtTime(30, t + 0.3);
      var subEnv = audioCtx.createGain();
      subEnv.gain.setValueAtTime(CFG.GAIN.stinger, t);
      subEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      sub.connect(subEnv);
      subEnv.connect(g);
      sub.start(t);
      sub.stop(t + 0.4);
    } else if (newPhase === 'maelstrom') {
      // Reverse cymbal swell (200ms) into distorted chord hit
      if (typeof _getNoiseBuffer === 'function') {
        var nb2 = _getNoiseBuffer();
        if (nb2) {
          var src2 = audioCtx.createBufferSource();
          src2.buffer = nb2;
          var bp2 = audioCtx.createBiquadFilter();
          bp2.type = 'bandpass';
          bp2.frequency.value = 2000;
          bp2.Q.value = 0.5;
          var env3 = audioCtx.createGain();
          env3.gain.setValueAtTime(0.0001, t);
          env3.gain.exponentialRampToValueAtTime(CFG.GAIN.stinger * 1.2, t + 0.2);
          env3.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
          src2.connect(bp2);
          bp2.connect(env3);
          env3.connect(g);
          src2.start(t);
          src2.stop(t + 0.45);
        }
      }
      // Distorted chord hit (root + tritone for tension)
      if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine._currentChord) {
        var rt = HarmonyEngine._currentChord.rootSemitone + 48;
        [rt, rt + 6].forEach(function(midi) {
          var o = audioCtx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = midiToFreq(midi);
          var eg = audioCtx.createGain();
          eg.gain.setValueAtTime(CFG.GAIN.stinger * 0.8, t + 0.2);
          eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
          o.connect(eg);
          eg.connect(g);
          o.start(t + 0.2);
          o.stop(t + 0.55);
        });
      }
    }
  },

  // --- Swell bass fill: rising octave on transition (SPEC_011 §3.2) ---
  _playBassFill: function(beatTime) {
    if (!audioCtx || !submixGain) return;
    if (typeof HarmonyEngine === 'undefined' || !HarmonyEngine._currentChord) return;
    var t = beatTime || audioCtx.currentTime;
    var rootSemi = HarmonyEngine._currentChord.rootSemitone;
    var baseMidi = rootSemi + 36; // octave 3
    var stepDur = 0.12;
    // Rising octave fill: root, 5th, octave, 5th (one bar)
    var notes = [baseMidi, baseMidi + 7, baseMidi + 12, baseMidi + 7];
    for (var i = 0; i < notes.length; i++) {
      var osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(notes[i]);
      var filt = audioCtx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 600;
      filt.Q.value = 2;
      var env = audioCtx.createGain();
      var noteStart = t + i * stepDur;
      env.gain.setValueAtTime(0.0001, noteStart);
      env.gain.linearRampToValueAtTime(CFG.GAIN.bass_fill, noteStart + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, noteStart + stepDur - 0.01);
      osc.connect(filt);
      filt.connect(env);
      env.connect(sfxGain);
      osc.start(noteStart);
      osc.stop(noteStart + stepDur + 0.02);
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PhaseStagger — scheduler + group dispatch (SPEC_010)
  // ══════════════════════════════════════════════════════════════════════════

  // --- Resolve the stagger profile to use (override → palette → default) ---
  _resolveStagger: function() {
    if (CFG.STAGGER_OVERRIDE) return CFG.STAGGER_OVERRIDE;
    if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine._palette && HarmonyEngine._palette.stagger) {
      return HarmonyEngine._palette.stagger;
    }
    return CFG.STAGGER_DEFAULT;
  },

  // --- Cancel any active stagger (SPEC_010 §5.1, §5.4) ---
  cancelStagger: function() {
    if (!this._staggerActive) return;
    this._staggerQueue = [];
    this._staggerActive = false;
    this._effectiveFloor = null;
    console.log('[StateMapper] Stagger cancelled');
  },

  // --- Process stagger queue: fire groups whose beat has arrived ---
  _processStaggerQueue: function(beatTime) {
    var fired = false;
    var bc = G.beatCount;
    for (var i = this._staggerQueue.length - 1; i >= 0; i--) {
      var entry = this._staggerQueue[i];
      if (bc >= entry.triggerBeat) {
        this._staggerQueue.splice(i, 1);
        this._fireStaggerGroup(entry.group, entry.phase, entry.oldPhase, beatTime);
        fired = true;
      }
    }
    if (this._staggerQueue.length === 0 && fired) {
      this._staggerActive = false;
      this._effectiveFloor = null;
      console.log('[StateMapper] Stagger complete');
    }
  },

  // --- Fire a single stagger group's subsystems ---
  _fireStaggerGroup: function(group, phase, oldPhase, beatTime) {
    console.log('[StateMapper] Stagger group: ' + group + ' → ' + phase);
    if (group === 'rhythm') {
      this._dispatchRhythm(phase, oldPhase, beatTime);
    } else if (group === 'harmony') {
      this._dispatchHarmony(phase, oldPhase, beatTime);
    } else if (group === 'texture') {
      this._dispatchTexture(phase, beatTime);
    } else if (group === 'melody') {
      this._dispatchMelody(phase, beatTime);
    }
    // Update _effectiveFloor for this group's tracks
    this._updateEffectiveFloor(group, phase);
  },

  // --- Update _effectiveFloor for tracks belonging to a group ---
  _updateEffectiveFloor: function(group, phase) {
    if (!this._effectiveFloor) return;
    var newFloor = CFG.PHASE_FLOOR[phase] || CFG.PHASE_FLOOR.pulse;
    var trackMap = {
      rhythm:  ['kick', 'hat', 'snare', 'perc'],
      harmony: ['bass'],
      texture: ['pad'],
      melody:  ['melody']
    };
    var tracks = trackMap[group] || [];
    for (var i = 0; i < tracks.length; i++) {
      this._effectiveFloor[tracks[i]] = !!newFloor[tracks[i]];
    }
  },

  // --- Group dispatch: rhythm (SPEC_010 §2.2) ---
  _dispatchRhythm: function(phase, oldPhase, beatTime) {
    // Stinger + fill fire with rhythm group (transition audio cue)
    if (oldPhase) this._playStinger(phase, beatTime);
    if (phase === 'swell') this._playBassFill(beatTime);

    // Groove phase scaling (SPEC_018 §1)
    if (typeof GrooveEngine !== 'undefined') GrooveEngine.onPhaseChange(phase);

    // Drum fill on phase transition (SPEC_018 §2)
    if (typeof FillSystem !== 'undefined' && oldPhase) FillSystem.triggerPhaseFill(phase, G.beatCount);

    // Pattern mutations revert (SPEC_018 §6)
    if (typeof PatternMutator !== 'undefined' && typeof Sequencer !== 'undefined') {
      PatternMutator.revertToOriginals(Sequencer._drumPatterns);
    }

    // Maelstrom: double-time hat (SPEC_019 §2)
    if (phase === 'maelstrom' && typeof Sequencer !== 'undefined') Sequencer.switchHatDouble();
  },

  // --- Group dispatch: harmony (SPEC_010 §2.2) ---
  _dispatchHarmony: function(phase, oldPhase, beatTime) {
    // HarmonyEngine progression advance (SPEC_017 §1)
    if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine.onPhaseChange) {
      HarmonyEngine.onPhaseChange(phase);
    }

    // Storm entry: bass pattern switch + key modulation (SPEC_017 §3)
    if (phase === 'storm') {
      if (typeof Sequencer !== 'undefined') Sequencer.switchBassPattern();
      if (!this._modulatedUp && typeof HarmonyEngine !== 'undefined') {
        this._modulatedUp = true;
        HarmonyEngine.modulateTo(HarmonyEngine.root + 1, 'direct');
      }
    }

    // Maelstrom entry: tritone modulation + reset mod counter
    if (phase === 'maelstrom' && typeof HarmonyEngine !== 'undefined') {
      HarmonyEngine.resetModulationCount();
      HarmonyEngine.modulateTo(HarmonyEngine.root + 6, 'direct');
    }

    // Post-Storm periodic modulation registration
    if (oldPhase && typeof HarmonyEngine !== 'undefined' && G.beatCount > 0) {
      var phaseOrder = ['pulse', 'swell', 'surge', 'storm', 'maelstrom'];
      var pIdx = phaseOrder.indexOf(phase);
      if (pIdx < 0) pIdx = phaseOrder.indexOf(G.phase);
      if (pIdx >= 3 && !this._postStormModRegistered) {
        this._postStormModRegistered = true;
      }
    }
  },

  // --- Group dispatch: texture (SPEC_010 §2.2) ---
  _dispatchTexture: function(phase, beatTime) {
    // Phase FX ramping (SPEC_011 §3.4)
    this._applyPhaseEffects(phase, beatTime);

    // Narrative conductor (SPEC_020 §2)
    if (typeof NarrativeConductor !== 'undefined') {
      NarrativeConductor.onPhaseChange(phase, null, beatTime);
    }
  },

  // --- Group dispatch: melody (SPEC_010 §2.2) ---
  _dispatchMelody: function(phase, beatTime) {
    // Melody resolution phrase (SPEC_017 §5)
    if (typeof MelodyEngine !== 'undefined' && MelodyEngine.onPhaseChange) {
      MelodyEngine.onPhaseChange(phase, beatTime);
    }

    // Polyrhythm tracks: unmute at phase gates (SPEC_018 §5)
    if (typeof PolyTrack !== 'undefined') PolyTrack.onPhaseChange(phase);

    // Maelstrom: palette blending (SPEC_019 §2)
    if (phase === 'maelstrom' && typeof PaletteBlender !== 'undefined') {
      PaletteBlender.onMaelstromEntry();
    }
  },

  // --- Phase transition handler (registered via onPhaseChange) ---
  _onPhaseChange: function(newPhase, oldPhase, beatTime) {
    console.log('[StateMapper] Phase: ' + (oldPhase || 'none') + ' → ' + newPhase +
                ' (beat ' + G.beatCount + ', DC ' + G.dc.toFixed(2) + ')');

    // --- Cycle mode active: bypass stagger entirely (SPEC_010 §5.5) ---
    if (this._cycleFrozen) {
      this._fireAllGroups(newPhase, oldPhase, beatTime);
      return;
    }

    // --- Cancel any in-progress stagger (SPEC_010 §5.1, §5.4) ---
    if (this._staggerActive) {
      this.cancelStagger();
    }

    // --- Resolve stagger profile ---
    var stagger = this._resolveStagger();

    // --- Check direction for reverse stagger (SPEC_010 §6) ---
    var phaseOrder = ['pulse', 'swell', 'surge', 'storm', 'maelstrom'];
    var newIdx = phaseOrder.indexOf(newPhase);
    var oldIdx = oldPhase ? phaseOrder.indexOf(oldPhase) : -1;
    var isDownward = (oldIdx >= 0 && newIdx < oldIdx);

    // Group order: normal = rhythm→harmony→texture→melody; downward = reversed
    var groups = isDownward
      ? ['melody', 'texture', 'harmony', 'rhythm']
      : ['rhythm', 'harmony', 'texture', 'melody'];

    // Map group names to their beat offsets (for downward: re-assign offsets in reverse order)
    var offsets;
    if (isDownward) {
      // Reverse: melody gets rhythm's offset (0), texture gets harmony's, etc.
      offsets = {
        melody:  stagger.rhythm,
        texture: stagger.harmony,
        harmony: stagger.texture,
        rhythm:  stagger.melody
      };
    } else {
      offsets = {
        rhythm:  stagger.rhythm,
        harmony: stagger.harmony,
        texture: stagger.texture,
        melody:  stagger.melody
      };
    }

    // --- Zero-offset fast path: all offsets 0 → fire everything immediately (SPEC_010 §5.6) ---
    var allZero = true;
    for (var gi = 0; gi < groups.length; gi++) {
      if (offsets[groups[gi]] !== 0) { allZero = false; break; }
    }
    if (allZero) {
      this._fireAllGroups(newPhase, oldPhase, beatTime);
      return;
    }

    // --- Build stagger queue ---
    this._staggerActive = true;
    this._staggerBaseBeat = G.beatCount;

    // Initialize _effectiveFloor from old phase (tracks stay at old floor until their group fires)
    var oldFloor = CFG.PHASE_FLOOR[oldPhase || 'pulse'] || CFG.PHASE_FLOOR.pulse;
    this._effectiveFloor = {};
    var allTracks = ['kick', 'hat', 'snare', 'bass', 'pad', 'perc', 'melody'];
    for (var ti = 0; ti < allTracks.length; ti++) {
      this._effectiveFloor[allTracks[ti]] = !!oldFloor[allTracks[ti]];
    }

    this._staggerQueue = [];
    for (var qi = 0; qi < groups.length; qi++) {
      var grp = groups[qi];
      var offset = offsets[grp];
      if (offset === 0) {
        // Fire immediately
        this._fireStaggerGroup(grp, newPhase, oldPhase, beatTime);
      } else {
        this._staggerQueue.push({
          group: grp,
          triggerBeat: G.beatCount + offset,
          phase: newPhase,
          oldPhase: oldPhase
        });
      }
    }

    // If queue ended up empty (all were offset 0), finalize
    if (this._staggerQueue.length === 0) {
      this._staggerActive = false;
      this._effectiveFloor = null;
    }
  },

  // --- Fire all groups synchronously (no stagger) ---
  _fireAllGroups: function(phase, oldPhase, beatTime) {
    this._dispatchRhythm(phase, oldPhase, beatTime);
    this._dispatchHarmony(phase, oldPhase, beatTime);
    this._dispatchTexture(phase, beatTime);
    this._dispatchMelody(phase, beatTime);
  },

  // --- Register a graze event (called from GameScene collision check) ---
  // tier: 'normal' | 'tight' | 'perfect'
  registerNearMiss: function(tier) {
    tier = tier || 'normal';
    this._nearMisses.push(G.beatCount);

    // Play tier-based graze SFX (replaces old sine blip)
    if (typeof playGrazeSFX === 'function') playGrazeSFX(tier);


    // Detune active voice pool voices ±25 cents for tension (tight/perfect only)
    if (tier !== 'normal' && typeof VoicePool !== 'undefined') {
      var pool = VoicePool._pool;
      var detAmt = tier === 'perfect' ? 40 : 25;
      for (var i = 0; i < pool.length; i++) {
        var v = pool[i];
        if (v.active && v.osc) {
          var detune = ((_songRng || Math.random)() < 0.5 ? -detAmt : detAmt);
          try { v.osc.detune.setValueAtTime(detune, audioCtx.currentTime); } catch(e) {}
          try { v.osc.detune.setTargetAtTime(0, audioCtx.currentTime + 0.3, 0.05); } catch(e) {}
        }
      }
    }
  },

  // --- Register a slash event (Voice Slash perk, SPEC_012 §2.1, §6) ---
  // tier: 'normal' | 'tight' | 'perfect'
  registerSlash: function(tier) {
    if (typeof playSlashSFX === 'function') playSlashSFX(tier);
  },

  // --- Register a streak increment (Graze Streak perk, SPEC_012 §2.2, §6) ---
  // streak: current streak count after incrementing
  registerStreak: function(streak) {
    if (typeof GrazeStreakTrack !== 'undefined') GrazeStreakTrack.tick(streak);
  },

  // --- Register a pulse fire event (Beat Pulse perk, SPEC_012 §2.3, §6) ---
  // Triggers bass boom + sidechain pump
  registerPulse: function() {
    if (typeof playPulseSFX === 'function') playPulseSFX();
  },

  // --- Key darken on energy=1 (SPEC_017 §3) ---
  _checkKeyDarken: function() {
    if (typeof HarmonyEngine === 'undefined') return;
    if (G.energy === 1 && !this._darkenedKey) {
      this._darkenedKey = true;
      HarmonyEngine.modulateTo(HarmonyEngine.root - 1, 'direct');
    }
  },

  // --- Key restore on energy regen from 1 (SPEC_017 §3) ---
  _checkKeyRestore: function() {
    if (typeof HarmonyEngine === 'undefined') return;
    if (this._darkenedKey && G.energy > 1) {
      this._darkenedKey = false;
      // Restore previous key via pivot if possible
      if (HarmonyEngine._prevRoot !== null) {
        HarmonyEngine.modulateTo(HarmonyEngine._prevRoot, 'pivot');
      }
    }
  },

  // --- Called on player hit (energy loss) ---
  onHit: function() {
    // Exit figures BEFORE muting (SPEC_020 §3) — instruments depart musically
    if (typeof NarrativeConductor !== 'undefined') {
      NarrativeConductor.playExitFigures(audioCtx ? audioCtx.currentTime : 0);
    }

    this._hitStrip = true;
    this._hitStripBeatsLeft = 4; // floor-only for 4 beats

    // energy=1 key darken (SPEC_017 §3)
    this._checkKeyDarken();

    // Immediate layer strip: mute above floor + gain drop (SPEC_020 §6)
    if (typeof Sequencer !== 'undefined') {
      var floor = CFG.PHASE_FLOOR[G.phase] || CFG.PHASE_FLOOR.pulse;
      var m = Sequencer._mute;
      var hitT = audioCtx ? audioCtx.currentTime : 0;
      var hitTracks = ['hat', 'snare', 'bass', 'pad', 'perc', 'melody'];
      for (var hi = 0; hi < hitTracks.length; hi++) {
        var ht = hitTracks[hi];
        var inF = !!floor[ht];
        m[ht] = !inF;
        // Gain: floor tracks at 0.3, non-floor at 0
        if (typeof _trackGains !== 'undefined' && _trackGains[ht]) {
          _trackGains[ht].gain.setTargetAtTime(inF ? 0.3 : 0.0, hitT, 0.02);
        }
      }
    }

    // Melody hit: octave drop + volume halve for 4 beats (SPEC_017 §5)
    if (typeof MelodyEngine !== 'undefined') MelodyEngine.onHit();

    // Narrative motif fragment on hit (SPEC_020 §2)
    if (typeof NarrativeConductor !== 'undefined') NarrativeConductor.onHit();

    // Fade out pad voices if pad is not in floor
    if (typeof PadTrack !== 'undefined') {
      var padFloor = (CFG.PHASE_FLOOR[G.phase] || CFG.PHASE_FLOOR.pulse).pad;
      if (!padFloor) {
        PadTrack._muted = true;
        PadTrack._fadeOutVoices();
      }
    }
  },

  // --- Death audio: fade everything, reverb tail, final low note ---
  // Phase-aware death sequence (SPEC_020 §4)
  onDeath: function() {
    if (!audioCtx || this._deathFading) return;
    this._deathFading = true;

    // Narrative: phase-aware death sequence (SPEC_020 §4)
    var deathOpts = null;
    if (typeof NarrativeConductor !== 'undefined') {
      deathOpts = NarrativeConductor.onDeath();
    }
    var fadeDur = (deathOpts && deathOpts.fadeDur) || 2.5;
    var silenceFirst = (deathOpts && deathOpts.silenceFirst) || 0;

    var t = audioCtx.currentTime;
    var fadeStart = t + silenceFirst;

    // Maelstrom: brief silence before fade (SPEC_020 §4)
    if (silenceFirst > 0 && masterGain) {
      masterGain.gain.cancelScheduledValues(t);
      masterGain.gain.setValueAtTime(0.0001, t);
      masterGain.gain.setValueAtTime(masterGain.gain.value || 0.5, fadeStart);
    }

    // Fade master gain to zero
    if (masterGain) {
      masterGain.gain.cancelScheduledValues(fadeStart);
      masterGain.gain.setValueAtTime(masterGain.gain.value || 1.0, fadeStart);
      masterGain.gain.linearRampToValueAtTime(0, fadeStart + fadeDur);
    }

    // Increase reverb wet for lingering tail
    if (_reverbWet) {
      _reverbWet.gain.setTargetAtTime(0.8, fadeStart, 0.3);
    }
    if (_reverbDry) {
      _reverbDry.gain.setTargetAtTime(0.2, fadeStart, 0.3);
    }

    // Kill delay feedback (don't let echoes persist into silence)
    if (_delayFeedback) {
      _delayFeedback.gain.setTargetAtTime(0.05, fadeStart, 0.2);
    }

    // Remove energy effects (tremolo + filter)
    if (this._lfoDepth) this._lfoDepth.gain.setTargetAtTime(0, fadeStart, 0.05);
    if (this._energyFilter) this._energyFilter.frequency.setTargetAtTime(10, fadeStart, 0.1);

    // Reverse reverb swell: noise crescendo simulating reversed reverb tail
    if (typeof _getNoiseBuffer === 'function') {
      var nb = _getNoiseBuffer();
      if (nb) {
        var nSrc = audioCtx.createBufferSource();
        nSrc.buffer = nb;
        nSrc.loop = true;
        var nBp = audioCtx.createBiquadFilter();
        nBp.type = 'bandpass';
        nBp.frequency.value = 400;
        nBp.Q.value = 0.5;
        var nGain = audioCtx.createGain();
        nGain.gain.setValueAtTime(0.0001, fadeStart);
        nGain.gain.exponentialRampToValueAtTime(CFG.GAIN.death_swell, fadeStart + fadeDur * 0.6);
        nGain.gain.exponentialRampToValueAtTime(0.0001, fadeStart + fadeDur);
        nSrc.connect(nBp);
        nBp.connect(nGain);
        nGain.connect(sfxGain);
        nSrc.start(fadeStart);
        nSrc.stop(fadeStart + fadeDur + 0.1);
      }
    }

    // Final low root note — the song's last breath (duration scales with fade)
    if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine._currentChord) {
      var rootMidi = 2 * 12 + HarmonyEngine._currentChord.rootSemitone; // octave 2
      var freq = midiToFreq(rootMidi);
      _playNote('sine', freq, CFG.GAIN.death_note, fadeDur, fadeStart);
    }
  },

  // --- Shutdown: disconnect custom nodes ---
  shutdown: function() {
    this._deathFading = false;
    this._cycleFrozen = false;
    this._staggerQueue = [];
    this._staggerActive = false;
    this._effectiveFloor = null;

    // --- Narrative conductor cleanup (SPEC_020) ---
    if (typeof NarrativeConductor !== 'undefined') NarrativeConductor.shutdown();

    // --- Tear down tremolo: disconnect from graph, restore direct path ---
    if (this._tremoloOsc) {
      try { this._tremoloOsc.stop(); } catch(e) {}
      try { this._tremoloOsc.disconnect(); } catch(e) {}
      this._tremoloOsc = null;
    }
    if (this._lfoDepth) {
      try { this._lfoDepth.disconnect(); } catch(e) {}
      this._lfoDepth = null;
    }
    if (this._tremoloGain) {
      try { waveshaper.disconnect(this._tremoloGain); } catch(e) {}
      try { this._tremoloGain.disconnect(); } catch(e) {}
      this._tremoloGain = null;
    }
    // Always restore the direct path — prevents silent audio if tremolo teardown
    // was incomplete, and prevents duplicate paths by disconnecting first.
    if (waveshaper && masterGain) {
      try { waveshaper.disconnect(masterGain); } catch(e) {}  // remove any stale edge
      try { waveshaper.connect(masterGain); } catch(e) {}
    }

    // --- Tear down energy filter: disconnect from graph, restore direct path ---
    var _upstream = (typeof _sidechainGain !== 'undefined' && _sidechainGain) ? _sidechainGain : submixGain;
    if (this._energyFilter) {
      try { _upstream.disconnect(this._energyFilter); } catch(e) {}
      try { this._energyFilter.disconnect(); } catch(e) {}
      this._energyFilter = null;
    }
    // Always restore upstream → compressor directly, preventing parallel paths.
    if (_upstream && _compressor) {
      try { _upstream.disconnect(_compressor); } catch(e) {}  // remove stale direct edge
      try { _upstream.connect(_compressor); } catch(e) {}
    }
    // Tear down stinger gain
    if (this._stingerGain) {
      try { this._stingerGain.disconnect(); } catch(e) {}
      this._stingerGain = null;
    }
    this._fxBaselines   = null;
    this._sidechainTarget = null;
    this._nearMisses  = [];
    this._hitStrip    = false;
    this._hitStripBeatsLeft = 0;
    this._modulatedUp = false;

    // Reset all audio graph nodes modified during play/death to baseline.
    // Without this, each retry inherits the previous run's final state and
    // values compound — reverb wet accumulates toward 1.0, masterGain has
    // pending ramp automation that fights the next applyVolumeSetting() call.
    if (audioCtx) {
      var t = audioCtx.currentTime;
      if (masterGain) {
        masterGain.gain.cancelScheduledValues(t);
        masterGain.gain.setValueAtTime(masterGain.gain.value, t);
      }
      if (_reverbWet) {
        _reverbWet.gain.cancelScheduledValues(t);
        _reverbWet.gain.setValueAtTime(0.3, t);
      }
      if (_reverbDry) {
        _reverbDry.gain.cancelScheduledValues(t);
        _reverbDry.gain.setValueAtTime(0.7, t);
      }
      if (_delayFeedback) {
        _delayFeedback.gain.cancelScheduledValues(t);
        _delayFeedback.gain.setValueAtTime(0.25, t);
      }
    }
  },
};
