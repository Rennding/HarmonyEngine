// ========== AUDIO DIAGNOSTIC SYSTEM (SPEC_042) ==========
// Shared vocabulary + real-time anomaly overlay for QA communication.
// Purely observational — reads existing state, never modifies audio.

// ── DIAGNOSTIC_VOCAB — 17 terms ─────────────────────────────────────────────
var DIAGNOSTIC_VOCAB = {
  muddy:     { label: 'Muddy',     description: 'Thick, indistinct low end — instruments blur together', technicalHint: 'Too much energy 200–500 Hz; voices overlapping in low-mids', freqRange: '200–500 Hz' },
  boomy:     { label: 'Boomy',     description: 'Excessive bass resonance, one-note rumble', technicalHint: 'Energy pileup 80–200 Hz from bass + kick stacking', freqRange: '80–200 Hz' },
  harsh:     { label: 'Harsh',     description: 'Piercing, fatiguing upper range', technicalHint: 'Excessive 2–5 kHz energy from saw-wave overtones', freqRange: '2–5 kHz' },
  brittle:   { label: 'Brittle',   description: 'Sharp, spiky transients that stick out', technicalHint: 'High-freq transient spikes >5 kHz, short attack envelopes', freqRange: '>5 kHz' },
  thin:      { label: 'Thin',      description: 'Sounds empty, missing body', technicalHint: 'Low end absent below 200 Hz — bass too quiet or filtered', freqRange: '<200 Hz' },
  honky:     { label: 'Honky',     description: 'Nasal, boxy mid-range buildup', technicalHint: 'Resonance at 800 Hz–1.5 kHz', freqRange: '800–1500 Hz' },
  dull:      { label: 'Dull',      description: 'Sounds muffled, lifeless, missing sparkle', technicalHint: 'High-freq energy absent above 4 kHz', freqRange: '>4 kHz' },
  clipping:  { label: 'Clipping',  description: 'Crackling, distortion, digital crunch', technicalHint: 'Gain exceeds 1.0 at any node; waveform flat-tops', freqRange: 'all' },
  pumping:   { label: 'Pumping',   description: 'Rhythmic volume ducking that sounds unnatural', technicalHint: 'Sidechain over-ducking or slow release', freqRange: 'all' },
  silenceGap:{ label: 'Silence gap',description: 'Unexpected quiet moment, dropout', technicalHint: 'Track gain drops to 0 unexpectedly; voice pool exhaustion', freqRange: 'all' },
  monotone:  { label: 'Monotone',  description: 'Same note/pattern repeating, no movement', technicalHint: 'Melody stuck or chord not progressing', freqRange: 'all' },
  cluttered: { label: 'Cluttered', description: 'Too many things happening, can\'t pick out parts', technicalHint: 'Voice count too high, too many tracks at full gain', freqRange: 'all' },
  poppy:     { label: 'Poppy',     description: 'Click or pop on note start/end', technicalHint: 'Envelope too short, osc start/stop discontinuity', freqRange: 'all' },
  washy:     { label: 'Washy',     description: 'Everything blends into reverb soup', technicalHint: 'Reverb send too high, too many overlapping release tails', freqRange: 'all' },
  flat:      { label: 'Flat',      description: 'No dynamics, no movement, everything same volume', technicalHint: 'All track gains similar, DC not progressing', freqRange: 'all' },
  dissonant: { label: 'Dissonant', description: 'A note that sounds wrong against the chord', technicalHint: 'Sustained non-chord, non-scale tone', freqRange: 'all' },
  jarring:   { label: 'Jarring',   description: 'Sudden uncomfortable shift', technicalHint: 'Distant modulation without pivot, unexpected phase regression', freqRange: 'all' },
  sloppy:    { label: 'Sloppy',    description: 'Rhythm feels loose, unintentional swing', technicalHint: 'Notes landing >25ms off grid after groove + swing stack', freqRange: 'all' },
};

// ── NoteEventBus — lightweight pub/sub for note-on/note-off timestamps ──────
var NoteEventBus = {
  _listeners: [],
  subscribe: function(fn) { this._listeners.push(fn); },
  emit: function(type, midi, time, track) {
    for (var i = 0; i < this._listeners.length; i++) {
      this._listeners[i](type, midi, time, track);
    }
  },
};

// ── DiagnosticLog — ring buffer + clipboard formatter ───────────────────────
var DiagnosticLog = {
  _entries: [],
  _maxEntries: 50,

  init: function() {
    this._maxEntries = (typeof CFG !== 'undefined' && CFG.DIAGNOSTIC) ? CFG.DIAGNOSTIC.LOG_MAX : 50;
    this._entries = [];
  },

  push: function(entry) {
    // entry: { beat, severity, vocabTerm, message, context }
    this._entries.unshift(entry); // newest first
    if (this._entries.length > this._maxEntries) {
      this._entries.length = this._maxEntries;
    }
  },

  getEntries: function() { return this._entries; },

  clear: function() { this._entries = []; },

  // Format for clipboard (paste-ready for GitHub/Cowork)
  formatForClipboard: function() {
    var lines = [];
    for (var i = 0; i < this._entries.length; i++) {
      var e = this._entries[i];
      var sev = e.severity === 'error' ? '\uD83D\uDD34' : e.severity === 'warning' ? '\uD83D\uDFE1' : '\uD83D\uDD35';
      lines.push('[Beat ' + e.beat + '] ' + sev + ' ' + e.vocabTerm + ': ' + e.message);
      var ctx = e.context;
      if (ctx) {
        lines.push('  Phase: ' + (ctx.phase || '—') + ' | DC: ' + (ctx.dc != null ? ctx.dc.toFixed(2) : '—') +
          ' | Palette: ' + (ctx.palette || '—') + ' | Seed: ' + (ctx.seed || '—'));
      }
    }
    return lines.join('\n');
  },
};

// ── AnomalyDetector — per-beat detector runner (9 detectors for #42) ────────
var AnomalyDetector = {
  // Accumulated state for multi-beat detectors
  _prevTrackGains: {},    // { trackName: gainValue } from previous beat
  _pumpHistory: {},       // { trackName: [gain, gain, ...] } last N beats
  _voiceCountHistory: [], // last N voice counts for leak detection
  _dcHistory: [],         // last N DC values for flat detection

  init: function() {
    this._prevTrackGains = {};
    this._pumpHistory = { bass: [], pad: [] };
    this._voiceCountHistory = [];
    this._dcHistory = [];
  },

  // Run all enabled detectors — called once per beat
  runAll: function() {
    if (typeof G === 'undefined' || typeof CFG === 'undefined' || !CFG.DIAGNOSTIC) return;
    var cfg = CFG.DIAGNOSTIC;
    var beat = G.beatCount;
    var ctx = this._makeContext();

    if (cfg.enabled.clipWatch)       this._clipWatch(beat, ctx, cfg);
    if (cfg.enabled.gainSpike)       this._gainSpike(beat, ctx, cfg);
    if (cfg.enabled.silenceDrop)     this._silenceDrop(beat, ctx, cfg);
    if (cfg.enabled.pumpDetect)      this._pumpDetect(beat, ctx, cfg);
    if (cfg.enabled.voiceFlood)      this._voiceFlood(beat, ctx, cfg);
    if (cfg.enabled.voiceStealStorm) this._voiceStealStorm(beat, ctx, cfg);
    if (cfg.enabled.voiceLeak)       this._voiceLeak(beat, ctx, cfg);
    if (cfg.enabled.lowEndStack)     this._lowEndStack(beat, ctx, cfg);
    if (cfg.enabled.flatDynamics)    this._flatDynamics(beat, ctx, cfg);

    // Snapshot current gains for next beat's delta checks
    this._snapshotGains();

    // Reset per-beat counters
    if (typeof VoicePool !== 'undefined') VoicePool.stealCount = 0;
  },

  _makeContext: function() {
    return {
      phase: G.phase || '—',
      dc: G.dc,
      palette: (typeof HarmonyEngine !== 'undefined' && HarmonyEngine.getPalette)
        ? (HarmonyEngine.getPalette() || {}).name || '—' : '—',
      seed: G.songSeed || '—',
    };
  },

  _log: function(beat, severity, vocabTerm, message, ctx) {
    DiagnosticLog.push({ beat: beat, severity: severity, vocabTerm: vocabTerm, message: message, context: ctx });
    // Flash panel on error
    if (severity === 'error' && typeof DiagnosticPanel !== 'undefined') {
      DiagnosticPanel._flashError();
    }
  },

  _snapshotGains: function() {
    if (typeof _trackGains === 'undefined') return;
    var tracks = ['kick', 'bass', 'snare', 'hat', 'pad', 'perc', 'melody', 'chord'];
    for (var i = 0; i < tracks.length; i++) {
      var node = _trackGains[tracks[i]];
      this._prevTrackGains[tracks[i]] = node ? node.gain.value : 0;
    }
  },

  _getTrackGain: function(name) {
    if (typeof _trackGains === 'undefined' || !_trackGains[name]) return 0;
    return _trackGains[name].gain.value;
  },

  // ── Detector: Clip watch ──────────────────────────────────────────────────
  _clipWatch: function(beat, ctx, cfg) {
    var tracks = ['kick', 'bass', 'snare', 'hat', 'pad', 'perc', 'melody', 'chord'];
    for (var i = 0; i < tracks.length; i++) {
      var g = this._getTrackGain(tracks[i]);
      if (g > cfg.CLIP_TRACK_MAX) {
        this._log(beat, 'error', 'Clipping', tracks[i] + ' track gain ' + g.toFixed(2), ctx);
        return; // one per beat
      }
    }
    // Master gain check
    if (typeof masterGain !== 'undefined' && masterGain && masterGain.gain.value > cfg.CLIP_MASTER_MAX) {
      this._log(beat, 'error', 'Clipping', 'master gain ' + masterGain.gain.value.toFixed(2), ctx);
      return;
    }
    // Limiter reduction check
    if (typeof getLimiterReduction === 'function') {
      var reduction = getLimiterReduction();
      // reduction is negative dB (e.g. -8 means 8dB of reduction)
      if (reduction < -cfg.CLIP_LIMITER_DB) {
        this._log(beat, 'error', 'Clipping', 'limiter reducing ' + Math.abs(reduction).toFixed(1) + 'dB', ctx);
      }
    }
  },

  // ── Detector: Gain spike ──────────────────────────────────────────────────
  _gainSpike: function(beat, ctx, cfg) {
    var tracks = ['kick', 'bass', 'snare', 'hat', 'pad', 'perc', 'melody', 'chord'];
    for (var i = 0; i < tracks.length; i++) {
      var cur = this._getTrackGain(tracks[i]);
      var prev = this._prevTrackGains[tracks[i]];
      if (prev !== undefined && Math.abs(cur - prev) > cfg.GAIN_SPIKE_DELTA) {
        this._log(beat, 'warning', 'Brittle', tracks[i] + ' gain jumped ' +
          prev.toFixed(2) + '\u2192' + cur.toFixed(2), ctx);
      }
    }
  },

  // ── Detector: Silence drop ────────────────────────────────────────────────
  _silenceDrop: function(beat, ctx, cfg) {
    // Skip during phase changes or stagger transitions
    if (typeof StateMapper !== 'undefined' && StateMapper._staggerActive) return;

    var tracks = ['bass', 'snare', 'hat', 'pad', 'perc', 'melody', 'chord'];
    for (var i = 0; i < tracks.length; i++) {
      var cur = this._getTrackGain(tracks[i]);
      var prev = this._prevTrackGains[tracks[i]];
      if (prev !== undefined && prev > cfg.SILENCE_DROP_THRESHOLD && cur < 0.01) {
        this._log(beat, 'warning', 'Silence gap', tracks[i] + ' dropped from ' +
          prev.toFixed(2) + ' to 0', ctx);
      }
    }
  },

  // ── Detector: Pump detect ─────────────────────────────────────────────────
  _pumpDetect: function(beat, ctx, cfg) {
    var pumpTracks = ['bass', 'pad'];
    for (var i = 0; i < pumpTracks.length; i++) {
      var t = pumpTracks[i];
      var g = this._getTrackGain(t);
      if (!this._pumpHistory[t]) this._pumpHistory[t] = [];
      this._pumpHistory[t].push(g);
      if (this._pumpHistory[t].length > cfg.PUMP_WINDOW) {
        this._pumpHistory[t].shift();
      }
      if (this._pumpHistory[t].length >= cfg.PUMP_WINDOW) {
        var min = Infinity, max = -Infinity;
        for (var j = 0; j < this._pumpHistory[t].length; j++) {
          if (this._pumpHistory[t][j] < min) min = this._pumpHistory[t][j];
          if (this._pumpHistory[t][j] > max) max = this._pumpHistory[t][j];
        }
        if (max - min > cfg.PUMP_RANGE) {
          this._log(beat, 'warning', 'Pumping', t + ' gain swing ' +
            min.toFixed(2) + '\u2192' + max.toFixed(2) + ' in ' + cfg.PUMP_WINDOW + ' beats', ctx);
          this._pumpHistory[t] = []; // reset after logging to avoid spam
        }
      }
    }
  },

  // ── Detector: Voice flood ─────────────────────────────────────────────────
  _voiceFlood: function(beat, ctx, cfg) {
    if (typeof VoicePool === 'undefined') return;
    var count = VoicePool.activeCount();
    if (count > cfg.VOICE_FLOOD_THRESHOLD) {
      this._log(beat, 'warning', 'Cluttered', count + '/' + VoicePool._size + ' voices active', ctx);
    }
  },

  // ── Detector: Voice steal storm ───────────────────────────────────────────
  _voiceStealStorm: function(beat, ctx, cfg) {
    if (typeof VoicePool === 'undefined') return;
    if (VoicePool.stealCount > cfg.VOICE_STEAL_MAX) {
      this._log(beat, 'error', 'Poppy', VoicePool.stealCount + ' voice steals this beat', ctx);
    }
  },

  // ── Detector: Voice leak ──────────────────────────────────────────────────
  _voiceLeak: function(beat, ctx, cfg) {
    if (typeof VoicePool === 'undefined') return;
    var count = VoicePool.activeCount();
    this._voiceCountHistory.push(count);
    if (this._voiceCountHistory.length > cfg.VOICE_LEAK_BEATS + 1) {
      this._voiceCountHistory.shift();
    }
    if (this._voiceCountHistory.length >= cfg.VOICE_LEAK_BEATS) {
      var rising = true;
      for (var i = 1; i < this._voiceCountHistory.length; i++) {
        if (this._voiceCountHistory[i] <= this._voiceCountHistory[i - 1]) {
          rising = false;
          break;
        }
      }
      if (rising) {
        this._log(beat, 'warning', 'Cluttered', 'voice count rising for ' +
          cfg.VOICE_LEAK_BEATS + '+ beats (leak?): ' + count + '/' + VoicePool._size, ctx);
        this._voiceCountHistory = []; // reset after logging
      }
    }
  },

  // ── Detector: Low-end stack ───────────────────────────────────────────────
  _lowEndStack: function(beat, ctx, cfg) {
    var phaseOrder = ['pulse', 'swell', 'surge', 'storm', 'maelstrom'];
    var maxIdx = phaseOrder.indexOf(cfg.LOW_END_STACK_MAX_PHASE);
    var curIdx = phaseOrder.indexOf(G.phase);
    if (maxIdx < 0 || curIdx < 0 || curIdx > maxIdx) return;

    var bassG = this._getTrackGain('bass');
    var kickG = this._getTrackGain('kick');
    var padG  = this._getTrackGain('pad');
    if (bassG > cfg.LOW_END_STACK_GAIN && kickG > cfg.LOW_END_STACK_GAIN && padG > cfg.LOW_END_STACK_GAIN) {
      this._log(beat, 'warning', 'Boomy', 'bass(' + bassG.toFixed(2) + ') + kick(' +
        kickG.toFixed(2) + ') + pad(' + padG.toFixed(2) + ') all >' +
        cfg.LOW_END_STACK_GAIN + ' in ' + G.phase, ctx);
    }
  },

  // ── Detector: Flat dynamics ───────────────────────────────────────────────
  _flatDynamics: function(beat, ctx, cfg) {
    // Skip during Maelstrom sustain or intentional plateau (TensionMap)
    if (G.phase === 'maelstrom') return;
    if (typeof TensionMap !== 'undefined' && TensionMap._activeEvent &&
        TensionMap._activeEvent.type === 'plateau') return;

    this._dcHistory.push(G.dc);
    if (this._dcHistory.length > cfg.FLAT_DC_BEATS + 1) {
      this._dcHistory.shift();
    }
    if (this._dcHistory.length >= cfg.FLAT_DC_BEATS) {
      var min = Infinity, max = -Infinity;
      for (var i = 0; i < this._dcHistory.length; i++) {
        if (this._dcHistory[i] < min) min = this._dcHistory[i];
        if (this._dcHistory[i] > max) max = this._dcHistory[i];
      }
      if (max - min < cfg.FLAT_DC_DELTA) {
        this._log(beat, 'info', 'Flat', 'DC unchanged (' + min.toFixed(2) + '–' +
          max.toFixed(2) + ') for ' + cfg.FLAT_DC_BEATS + ' beats', ctx);
        this._dcHistory = []; // reset after logging
      }
    }
  },
};

// ── DiagnosticPanel — DOM construction + update loop ────────────────────────
var DiagnosticPanel = {
  _visible: false,
  _root: null,
  _stateEl: null,
  _tracksEl: null,
  _logEl: null,
  _glossaryEl: null,
  _badgeEl: null,
  _hasUnseenError: false,
  _flashTimeout: null,

  init: function() {
    DiagnosticLog.init();
    AnomalyDetector.init();

    this._buildDOM();
    this._bindKeys();
    this._bindBeat();
  },

  _buildDOM: function() {
    var root = document.getElementById('diagnosticRoot');
    if (!root) return;
    this._root = root;

    // Panel container
    root.innerHTML =
      '<div id="diagPanel" style="display:none; position:fixed; right:0; top:0; width:350px; height:100vh; ' +
      'background:rgba(10,10,15,0.92); border-left:1px solid #1a1a3a; font-family:\'Courier New\',monospace; ' +
      'font-size:12px; color:#aaaacc; z-index:9999; overflow:hidden; display:flex; flex-direction:column;">' +
        // Header
        '<div id="diagHeader" style="padding:10px 12px; border-bottom:1px solid #1a1a3a; display:flex; ' +
        'justify-content:space-between; align-items:center; flex-shrink:0;">' +
          '<span style="color:#00ffcc; font-weight:bold;">\uD83D\uDD27 DIAGNOSTIC</span>' +
          '<span>' +
            '<button id="diagBtnGlossary" style="background:none; border:1px solid #1a1a3a; color:#555577; ' +
            'cursor:pointer; padding:2px 8px; margin-right:4px; font-family:inherit; font-size:12px;">?</button>' +
            '<button id="diagBtnCopy" style="background:none; border:1px solid #1a1a3a; color:#555577; ' +
            'cursor:pointer; padding:2px 8px; margin-right:4px; font-family:inherit; font-size:12px;">' +
            '\uD83D\uDCCB</button>' +
            '<button id="diagBtnClose" style="background:none; border:1px solid #1a1a3a; color:#555577; ' +
            'cursor:pointer; padding:2px 8px; font-family:inherit; font-size:12px;">\u00D7</button>' +
          '</span>' +
        '</div>' +
        // State section
        '<div style="padding:8px 12px; border-bottom:1px solid #1a1a3a; flex-shrink:0;">' +
          '<div style="color:#555577; font-size:11px; margin-bottom:4px;">STATE</div>' +
          '<div id="diagState" style="line-height:1.6;"></div>' +
        '</div>' +
        // Tracks section
        '<div style="padding:8px 12px; border-bottom:1px solid #1a1a3a; flex-shrink:0;">' +
          '<div style="color:#555577; font-size:11px; margin-bottom:4px;">TRACKS' +
          '<span style="float:right; color:#555577;">gain &nbsp; target &nbsp; state</span></div>' +
          '<div id="diagTracks" style="line-height:1.5;"></div>' +
        '</div>' +
        // Anomaly log section
        '<div style="padding:8px 12px; flex:1; overflow-y:auto;">' +
          '<div style="color:#555577; font-size:11px; margin-bottom:4px;">ANOMALY LOG (newest first)</div>' +
          '<div id="diagLog"></div>' +
        '</div>' +
      '</div>' +
      // Glossary popup (hidden)
      '<div id="diagGlossary" style="display:none; position:fixed; right:0; top:0; width:350px; height:100vh; ' +
      'background:rgba(10,10,15,0.96); border-left:1px solid #1a1a3a; font-family:\'Courier New\',monospace; ' +
      'font-size:12px; color:#aaaacc; z-index:10000; overflow-y:auto; padding:12px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
          '<span style="color:#00ffcc; font-weight:bold;">VOCABULARY</span>' +
          '<button id="diagGlossaryClose" style="background:none; border:1px solid #1a1a3a; color:#555577; ' +
          'cursor:pointer; padding:2px 8px; font-family:inherit; font-size:12px;">\u00D7</button>' +
        '</div>' +
        '<div id="diagGlossaryBody"></div>' +
      '</div>';

    // Cache elements
    this._stateEl = document.getElementById('diagState');
    this._tracksEl = document.getElementById('diagTracks');
    this._logEl = document.getElementById('diagLog');
    this._glossaryEl = document.getElementById('diagGlossary');

    // Build glossary body
    var glossaryBody = document.getElementById('diagGlossaryBody');
    if (glossaryBody) {
      var html = '';
      var keys = Object.keys(DIAGNOSTIC_VOCAB);
      for (var i = 0; i < keys.length; i++) {
        var v = DIAGNOSTIC_VOCAB[keys[i]];
        html += '<div style="margin-bottom:10px; padding:6px 8px; border:1px solid #1a1a3a; border-radius:4px;">' +
          '<span style="color:#00ffcc; font-weight:bold;">' + v.label + '</span>' +
          '<div style="color:#aaaacc; margin-top:2px;">' + v.description + '</div>' +
          '<div style="color:#555577; font-size:11px; margin-top:2px;">' + v.technicalHint + '</div>' +
          '<div style="color:#555577; font-size:10px; margin-top:1px;">Range: ' + v.freqRange + '</div>' +
          '</div>';
      }
      glossaryBody.innerHTML = html;
    }

    // Button handlers
    var self = this;
    document.getElementById('diagBtnClose').onclick = function() { self.hide(); };
    document.getElementById('diagBtnCopy').onclick = function() { self._copyLog(); };
    document.getElementById('diagBtnGlossary').onclick = function() { self._toggleGlossary(); };
    document.getElementById('diagGlossaryClose').onclick = function() { self._toggleGlossary(); };

    // Create badge (shown when panel closed + error detected)
    var badge = document.createElement('div');
    badge.id = 'diagBadge';
    badge.style.cssText = 'display:none; position:fixed; right:12px; top:12px; width:18px; height:18px; ' +
      'border-radius:50%; background:#ff3366; z-index:9998; cursor:pointer; ' +
      'font-size:10px; text-align:center; line-height:18px; color:#0a0a0f; font-weight:bold;';
    badge.textContent = 'D';
    badge.onclick = function() { self.show(); };
    document.body.appendChild(badge);
    this._badgeEl = badge;
  },

  _bindKeys: function() {
    var self = this;
    window.addEventListener('keydown', function(e) {
      if (e.key === 'd' || e.key === 'D') {
        // Don't toggle if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        if (self._visible) self.hide(); else self.show();
      }
    });
  },

  _bindBeat: function() {
    var self = this;
    window.addEventListener('conductor:beat', function() {
      // Run detectors
      AnomalyDetector.runAll();
      // Update display if visible
      if (self._visible) self._updateDisplay();
    });
  },

  show: function() {
    var panel = document.getElementById('diagPanel');
    if (panel) panel.style.display = 'flex';
    this._visible = true;
    this._hasUnseenError = false;
    if (this._badgeEl) this._badgeEl.style.display = 'none';
    this._updateDisplay();
  },

  hide: function() {
    var panel = document.getElementById('diagPanel');
    if (panel) panel.style.display = 'none';
    this._visible = false;
    if (this._glossaryEl) this._glossaryEl.style.display = 'none';
  },

  _flashError: function() {
    // Flash header red on error
    var header = document.getElementById('diagHeader');
    if (header && this._visible) {
      header.style.background = '#ff336644';
      if (this._flashTimeout) clearTimeout(this._flashTimeout);
      this._flashTimeout = setTimeout(function() {
        header.style.background = 'transparent';
      }, 200);
    }
    // Badge when closed
    if (!this._visible) {
      this._hasUnseenError = true;
      if (this._badgeEl) this._badgeEl.style.display = 'block';
    }
  },

  _updateDisplay: function() {
    if (!this._stateEl) return;
    this._updateState();
    this._updateTracks();
    this._updateLog();
  },

  _updateState: function() {
    if (typeof G === 'undefined') return;

    var phase = G.phase || '—';
    var dc = G.dc != null ? G.dc.toFixed(2) : '—';
    var beat = G.beatCount || 0;

    var key = '—', chord = '—', chordCountdown = '—';
    if (typeof HarmonyEngine !== 'undefined') {
      if (HarmonyEngine.rootName) key = HarmonyEngine.rootName;
      if (HarmonyEngine.scaleName) key += ' ' + HarmonyEngine.scaleName;
      if (HarmonyEngine.getCurrentChord) {
        var c = HarmonyEngine.getCurrentChord();
        chord = c ? (c.display || c.name || JSON.stringify(c)) : '—';
      }
      if (HarmonyEngine._beatsPerChord && HarmonyEngine._beatsInChord != null) {
        chordCountdown = (HarmonyEngine._beatsPerChord - HarmonyEngine._beatsInChord);
      }
    }

    var palette = '—', seed = '—';
    if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine.getPalette) {
      var pal = HarmonyEngine.getPalette();
      if (pal) palette = pal.name;
    }
    if (G.songSeed != null) seed = G.songSeed;

    var cycleState = '—';
    if (typeof Conductor !== 'undefined' && Conductor.getCycleState) {
      cycleState = Conductor.getCycleState() || 'off';
    }

    var voiceCount = '—';
    if (typeof VoicePool !== 'undefined') {
      voiceCount = VoicePool.activeCount() + '/' + VoicePool._size;
    }

    this._stateEl.innerHTML =
      '<div>Phase: <span style="color:#7b2fff;">' + phase + '</span> &nbsp; DC: <span style="color:#00ffcc;">' + dc + '</span> &nbsp; Beat: <span style="color:#00ffcc;">' + beat + '</span></div>' +
      '<div>Key: <span style="color:#00ffcc;">' + key + '</span></div>' +
      '<div>Chord: <span style="color:#00ffcc;">' + chord + '</span> &nbsp; next in <span style="color:#00ffcc;">' + chordCountdown + '</span> beats</div>' +
      '<div>Palette: <span style="color:#00ffcc;">' + palette + '</span> &nbsp; Seed: <span style="color:#00ffcc;">' + seed + '</span></div>' +
      '<div>Cycle: <span style="color:#00ffcc;">' + cycleState + '</span> &nbsp; Voices: <span style="color:#00ffcc;">' + voiceCount + '</span></div>';
  },

  _updateTracks: function() {
    var trackNames = ['kick', 'bass', 'snare', 'hat', 'pad', 'chord', 'melody', 'perc'];
    var html = '';
    for (var i = 0; i < trackNames.length; i++) {
      var tn = trackNames[i];
      var gain = 0, target = '—', state = '—';

      if (typeof _trackGains !== 'undefined' && _trackGains[tn]) {
        gain = _trackGains[tn].gain.value;
      }
      if (typeof StateMapper !== 'undefined' && StateMapper._lastTargetGains[tn] != null) {
        target = StateMapper._lastTargetGains[tn].toFixed(2);
      }

      // Determine state indicator
      var targetNum = parseFloat(target);
      if (gain < 0.01 && targetNum <= 0.01) {
        state = '<span style="color:#555577;">muted</span>';
      } else if (gain > 0.95) {
        state = '<span style="color:#ff3366;">\u26A0</span>';
      } else if (!isNaN(targetNum) && Math.abs(gain - targetNum) > 0.03) {
        state = gain < targetNum
          ? '<span style="color:#00ffcc;">\u2191</span>'
          : '<span style="color:#ffcc00;">\u2193</span>';
      } else {
        state = '<span style="color:#00ffcc;">\u2713</span>';
      }

      // Pad names for alignment
      var padded = (tn + '        ').slice(0, 8);
      html += '<div style="font-family:monospace;">' +
        '<span style="color:#aaaacc;">' + padded + '</span>' +
        '<span style="color:#00ffcc; min-width:40px; display:inline-block; text-align:right;">' + gain.toFixed(2) + '</span>' +
        '<span style="min-width:50px; display:inline-block; text-align:right; margin-left:8px;">' + target + '</span>' +
        '<span style="min-width:30px; display:inline-block; text-align:center; margin-left:8px;">' + state + '</span>' +
        '</div>';
    }
    // Master
    var masterG = (typeof masterGain !== 'undefined' && masterGain) ? masterGain.gain.value : 0;
    var masterState = masterG > 0.95
      ? '<span style="color:#ff3366;">\u26A0</span>'
      : '<span style="color:#00ffcc;">\u2713</span>';
    html += '<div style="font-family:monospace; border-top:1px solid #1a1a3a; margin-top:2px; padding-top:2px;">' +
      '<span style="color:#aaaacc;">master  </span>' +
      '<span style="color:#00ffcc; min-width:40px; display:inline-block; text-align:right;">' + masterG.toFixed(2) + '</span>' +
      '<span style="min-width:50px; display:inline-block; text-align:right; margin-left:8px;">\u2014</span>' +
      '<span style="min-width:30px; display:inline-block; text-align:center; margin-left:8px;">' + masterState + '</span>' +
      '</div>';

    this._tracksEl.innerHTML = html;
  },

  _updateLog: function() {
    var entries = DiagnosticLog.getEntries();
    var html = '';
    var maxShow = 20; // visible in panel
    var count = Math.min(entries.length, maxShow);
    for (var i = 0; i < count; i++) {
      var e = entries[i];
      var sevColor = e.severity === 'error' ? '#ff3366' : e.severity === 'warning' ? '#ffcc00' : '#00aaff';
      var sevIcon = e.severity === 'error' ? '\uD83D\uDD34' : e.severity === 'warning' ? '\uD83D\uDFE1' : '\uD83D\uDD35';
      html += '<div style="margin-bottom:4px; padding:3px 0; border-bottom:1px solid #0f0f1a;">' +
        '<span style="color:#555577;">[' + e.beat + ']</span> ' +
        '<span style="color:' + sevColor + ';">' + sevIcon + ' ' + e.vocabTerm + '</span>: ' +
        '<span style="color:#aaaacc;">' + e.message + '</span>' +
        '</div>';
    }
    if (entries.length === 0) {
      html = '<div style="color:#555577;">No anomalies detected yet</div>';
    }
    this._logEl.innerHTML = html;
  },

  _copyLog: function() {
    var text = DiagnosticLog.formatForClipboard();
    if (!text) { text = '(no anomalies logged)'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      // Fallback
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    // Brief visual feedback
    var btn = document.getElementById('diagBtnCopy');
    if (btn) {
      var orig = btn.textContent;
      btn.textContent = '\u2713';
      setTimeout(function() { btn.textContent = orig; }, 800);
    }
  },

  _toggleGlossary: function() {
    if (!this._glossaryEl) return;
    var shown = this._glossaryEl.style.display !== 'none';
    this._glossaryEl.style.display = shown ? 'none' : 'block';
  },
};

// ── Auto-init on load ──────────────────────────────────────────────────────
(function() {
  // Defer init until DOM is ready (diagnostic.js loads inside <script> via build)
  if (document.getElementById('diagnosticRoot')) {
    DiagnosticPanel.init();
  } else {
    // Fallback: wait for DOMContentLoaded (shouldn't be needed with build order)
    window.addEventListener('DOMContentLoaded', function() {
      DiagnosticPanel.init();
    });
  }
})();
