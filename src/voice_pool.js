// ========== VOICE POOL ==========
// 16-voice polyphonic pool. Each voice is an instrument.
// On spawn: request voice → assign chord tone → play.
// On death: trigger release envelope → return voice to pool after tail.
// On shutdown: hard-stop all voices immediately (no hang on death).

var VoicePool = {
  _pool:        [],     // array of voice objects
  _palette:     null,   // current palette.voiceConfig
  _size:        16,
  _timeouts:    [],     // all pending setTimeout handles (cleared on shutdown)

  // --- Voice object factory ---
  // Per spec §7: Oscillator → Filter (LP) → Gain (ADSR) → submixGain
  _makeVoice: function() {
    return {
      osc:    null,
      filter: null,
      gain:   null,
      active: false,
    };
  },

  // --- Tracked setTimeout: clears on shutdown ---
  _setTimeout: function(fn, ms) {
    var self = this;
    var h = setTimeout(function() {
      // Remove from list when it fires
      var idx = self._timeouts.indexOf(h);
      if (idx !== -1) self._timeouts.splice(idx, 1);
      fn();
    }, ms);
    this._timeouts.push(h);
    return h;
  },

  // --- Init per run ---
  initRun: function(palette) {
    this.shutdown();           // clean up any previous run nodes
    this._palette = palette.voiceConfig;
    this._paletteName = palette.name || null;  // for wavetable lookup (SPEC_016)
    this._pool = [];
    this._streakDetune = 0;  // SPEC_020 §5: streak milestone octave shift (cents)
    for (var i = 0; i < this._size; i++) {
      this._pool.push(this._makeVoice());
    }
    console.log('[VP] initRun: ' + this._size + ' voices, wave=' +
                this._palette.wave + ' oct=' + this._palette.octave);
  },

  // --- Allocate a free voice ---
  _allocate: function() {
    for (var i = 0; i < this._pool.length; i++) {
      if (!this._pool[i].active) return this._pool[i];
    }
    return null; // pool exhausted — silent fallback
  },

  // --- Build and start audio graph for a voice ---
  // Pure AD envelope: attack → decay to near-zero. No sustain plateau.
  // Max lifetime ~350ms regardless of how long the source lives.
  _startVoice: function(voice, midiNote, scheduledTime) {
    if (!audioCtx || !submixGain) return;
    var cfg  = this._palette;
    var freq = midiToFreq(midiNote);
    var t    = (scheduledTime !== undefined && scheduledTime > audioCtx.currentTime)
               ? scheduledTime : audioCtx.currentTime;

    var osc    = audioCtx.createOscillator();
    var filter = audioCtx.createBiquadFilter();
    var gain   = audioCtx.createGain();

    // Wavetable for palette-specific voice timbre (SPEC_016)
    var wt = (typeof Wavetables !== 'undefined' && this._paletteName)
      ? Wavetables.get(this._paletteName, 'voice') : null;
    if (wt) {
      osc.setPeriodicWave(wt);
    } else {
      osc.type = cfg.wave || 'square';
    }
    osc.frequency.value = freq;

    // Maelstrom: wider random detune ±50 cents (SPEC_011 §3.2)
    if (typeof G !== 'undefined' && G.phase === 'maelstrom') {
      osc.detune.value = (Math.random() * 100) - 50;
    }

    // Streak milestone: octave shift on active voices (SPEC_020 §5)
    if (this._streakDetune) {
      osc.detune.value = (osc.detune.value || 0) + this._streakDetune;
    }

    filter.type = 'lowpass';
    var cutoffHigh = Math.min(freq * 8, 8000);
    var cutoffLow  = Math.min(freq * 2.5, 3000);
    if (cfg.filterSweep) {
      filter.frequency.setValueAtTime(cutoffHigh, t);
      filter.frequency.exponentialRampToValueAtTime(cutoffLow, t + 0.12);
    } else {
      filter.frequency.value = cutoffLow;
    }
    filter.Q.value = 3.0;

    // AD-only envelope: attack → decay all the way to silence.
    // Voice is "musically dead" by t+attack+decay regardless of source lifetime.
    var attack    = cfg.attack || 0.01;
    var decay     = cfg.decay  || 0.15;
    // Maelstrom: longer decay → more lingering, chaotic (SPEC_011 §3.2)
    if (typeof G !== 'undefined' && G.phase === 'maelstrom') {
      decay = Math.min(decay * 1.8, 0.35);
    }
    var peakGain  = CFG.GAIN.voice;
    var totalTime = attack + decay;

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peakGain, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + totalTime);

    // Schedule hard stop slightly after envelope finishes
    var stopAt = t + totalTime + 0.02;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    try { osc.stop(stopAt); } catch(e) {}

    voice.osc    = osc;
    voice.filter = filter;
    voice.gain   = gain;
    voice.active = true;

    // Auto-recycle voice after envelope completes (no release step needed)
    var delay = Math.max(50, (stopAt - audioCtx.currentTime) * 1000 + 20);
    this._setTimeout(function() {
      voice.osc    = null;
      voice.filter = null;
      voice.gain   = null;
      voice.active = false;
    }, delay);
  },

  // --- Release: called on source death ---
  // AD envelope already scheduled to silence itself — release just cuts osc early
  // if the source dies before the envelope finishes (e.g. off-screen quickly).
  // harsh=true (player hit): also plays a distinct hit SFX via 03_audio.js.
  release: function(source, harsh) {
    if (!source || !source._voice) return;
    var voice = source._voice;
    source._voice = null;

    if (!voice.active || !voice.gain || !audioCtx) return;

    var t = audioCtx.currentTime;
    // Short cut-off: cancel remaining envelope, fast ramp to zero
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), t);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    try { voice.osc.stop(t + 0.05); } catch(e) {}

    // Recycle shortly after cut
    var self = this;
    this._setTimeout(function() {
      voice.osc    = null;
      voice.filter = null;
      voice.gain   = null;
      voice.active = false;
    }, 80);
  },

  // --- Public: spawn voice ---
  spawn: function(source, scheduledTime) {
    if (!audioCtx || !this._palette) return null;
    var voice = this._allocate();
    if (!voice) {
      console.warn('[VP] pool exhausted');
      return null;
    }

    var cfg        = this._palette;
    // Source type → preferred octave register (SPEC_017 §6)
    var typeRegisters = {
      dart: 5, wave: 4, bloom: 5, snap: 3, drift: 3
    };
    var sourceType = (source && source.type) || 'dart';
    var baseOctave = typeRegisters[sourceType] || cfg.octave || 5;
    // ambient_dread: drop all registers one octave — high partials scratch
    if (this._paletteName === 'ambient_dread') baseOctave = Math.max(3, baseOctave - 1);
    var midiNote   = HarmonyEngine.getNextChordTone(baseOctave);

    // Bloom gets occasional octave-up shimmer (skip for ambient_dread — already lowered)
    if (sourceType === 'bloom' && Math.random() < 0.3 && this._paletteName !== 'ambient_dread') {
      midiNote += 12;
    }
    // Octave doubling at high density (5+ sources on screen)
    if ((source._voiceCount || 0) >= 5 && Math.random() < 0.4) {
      midiNote += 12;
    }

    this._startVoice(voice, midiNote, scheduledTime);
    source._voice    = voice;
    source._midiNote = midiNote;
    return voice;
  },

  // --- Diagnostic accessors (SPEC_042 §5) ---
  stealCount: 0,  // incremented on voice steal, reset each beat by diagnostic
  activeCount: function() {
    var n = 0;
    for (var i = 0; i < this._pool.length; i++) {
      if (this._pool[i].active) n++;
    }
    return n;
  },

  // --- Hard stop all voices immediately (called on scene death/shutdown) ---
  // Cancels all pending timeouts to prevent post-death callbacks.
  shutdown: function() {
    // Cancel all pending recycle timeouts
    for (var i = 0; i < this._timeouts.length; i++) {
      clearTimeout(this._timeouts[i]);
    }
    this._timeouts = [];

    // Hard-stop all active voices
    var now = audioCtx ? audioCtx.currentTime : 0;
    for (var j = 0; j < this._pool.length; j++) {
      var v = this._pool[j];
      if (v && v.active) {
        if (v.gain && audioCtx) {
          try {
            v.gain.gain.cancelScheduledValues(now);
            v.gain.gain.setValueAtTime(0.0001, now);
          } catch(e) {}
        }
        if (v.osc) {
          try { v.osc.stop(now + 0.005); } catch(e) {}
        }
        v.osc    = null;
        v.filter = null;
        v.gain   = null;
        v.active = false;
      }
    }
    this._pool    = [];
    this._palette = null;
  },
};
