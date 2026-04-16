// ========== PROCEDURAL AUDIO — RHYTHM ENGINE ==========

var audioCtx = null;
var masterGain = null;
var _limiter = null;
var submixGain = null;   // music bus — Sequencer, PadTrack, ArpTrack, GrazeStreakTrack
var sfxGain = null;      // SFX bus — bullet voices, perk effects, one-shots (muted during pause/perk)
var waveshaper = null;
var _compressor = null;
var _delay = null;
var _delayFeedback = null;
var _reverbDry = null;
var _reverbWet = null;
var _reverb = null;
var _beatCallback = null;
var _beatScheduler = null;
var _nextBeatTime = 0;
// audioLevel removed — legacy combo-tier system replaced by ArpTrack/Sequencer

var _LOOKAHEAD_S = 0.1;   // 100ms lookahead window
var _SCHEDULER_MS = 25;   // scheduler tick interval

// ── Per-track mix nodes (SPEC_016 §4) ──────────────────────────────────────
var _trackGains = {};     // { kick, bass, snare, hat, pad, arp, perc, sfx } → GainNode
var _trackEQs   = {};     // { kick, bass, snare, hat, pad, arp, perc, sfx } → array of BiquadFilterNode
var _mixBus     = null;   // all tracks merge here → sidechain → master chain
var _reverbSend = null;   // GainNode bus → shared reverb
var _delaySend  = null;   // GainNode bus → shared delay
var _softClip   = null;   // WaveShaperNode with tanh curve (replaces waveshaper)
var _masterEQ   = {};     // { low, mid, high } → BiquadFilterNode (3-band post-comp)
var _transientBuffers = {};  // { kick_click, snare_rattle, hat_body, clap, rim } → AudioBuffer
var _analyser = null;        // AnalyserNode on _mixBus for FFT visualizer (SPEC_028 §3)

// Per-track sidechain gains (SPEC_016 §5)
var _trackSidechains = {};  // { bass, pad, arp, perc, sfx } → GainNode (kick doesn't duck itself)

// Per-track send amounts (overridden per palette)
var _trackReverbSends = {}; // { pad, snare, arp } → GainNode (send to reverb bus)
var _trackDelaySends  = {}; // { arp, sfx } → GainNode (send to delay bus)

// --- Distortion curve for level 4 (legacy — kept for _applyPhaseEffects dist ramp) ---
function _makeDistortionCurve(amount) {
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

// --- Soft clipper: smooth tanh saturation (SPEC_016 §4) ---
function _makeSoftClipCurve() {
  var samples = 256;
  var curve = new Float32Array(samples);
  for (var i = 0; i < samples; i++) {
    var x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * 1.5); // gentle saturation, warm at all levels
  }
  return curve;
}

// --- EQ helper: create a filter chain for a track (SPEC_016 §4) ---
function _makeTrackEQ(specs) {
  // specs: array of { type, freq, gain?, Q? }
  var filters = [];
  for (var i = 0; i < specs.length; i++) {
    var f = audioCtx.createBiquadFilter();
    f.type = specs[i].type;
    f.frequency.value = specs[i].freq;
    if (specs[i].gain !== undefined) f.gain.value = specs[i].gain;
    if (specs[i].Q !== undefined) f.Q.value = specs[i].Q;
    filters.push(f);
  }
  // Chain filters together
  for (var j = 0; j < filters.length - 1; j++) {
    filters[j].connect(filters[j + 1]);
  }
  return filters;
}

// --- Pre-render transient buffer via OfflineAudioContext (SPEC_016 §6) ---
function _prerenderTransient(spec) {
  var dur = spec.duration;
  var sampleRate = audioCtx.sampleRate;
  var offCtx = new OfflineAudioContext(1, Math.ceil(sampleRate * dur), sampleRate);

  // White noise source
  var bufLen = Math.ceil(sampleRate * dur);
  var nBuf = offCtx.createBuffer(1, bufLen, sampleRate);
  var data = nBuf.getChannelData(0);
  for (var i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  var src = offCtx.createBufferSource();
  src.buffer = nBuf;

  // Bandpass filter to shape spectrum
  var bp = offCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = (spec.freqLo + spec.freqHi) / 2;
  bp.Q.value = spec.Q || 1.0;

  // Envelope
  var env = offCtx.createGain();
  env.gain.setValueAtTime(spec.peakGain || 1.0, 0);
  env.gain.exponentialRampToValueAtTime(0.001, dur);

  src.connect(bp);
  bp.connect(env);
  env.connect(offCtx.destination);
  src.start(0);

  return offCtx.startRendering();
}

// --- Synthetic reverb impulse response ---
function _makeImpulse(duration, decay) {
  const rate = audioCtx.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = audioCtx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function initAudio() {
  if (audioCtx) {
    // Already exists — resume if suspended (autoplay policy or after stop)
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // --- Final output stage ---
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 1.0;

  // ── Legacy aliases (backward compat — submixGain/sfxGain still referenced) ──
  submixGain = audioCtx.createGain();
  submixGain.gain.value = 1.0;
  sfxGain = audioCtx.createGain();
  sfxGain.gain.value = 1.0;

  // ── Legacy waveshaper (kept for _applyPhaseEffects dist ramp) ──
  waveshaper = audioCtx.createWaveShaper();
  waveshaper.curve = _makeDistortionCurve(0);
  waveshaper.oversample = '2x';

  // ══════════════════════════════════════════════════════════════════
  // SPEC_016 §4 — Per-track mix chain
  // ══════════════════════════════════════════════════════════════════

  // --- Mix bus: all tracks merge here ---
  _mixBus = audioCtx.createGain();
  _mixBus.gain.value = 1.0;

  // --- Per-track gain nodes ---
  var trackNames = ['kick', 'bass', 'snare', 'hat', 'pad', 'arp', 'perc', 'sfx', 'melody', 'perk'];
  for (var i = 0; i < trackNames.length; i++) {
    _trackGains[trackNames[i]] = audioCtx.createGain();
    _trackGains[trackNames[i]].gain.value = 1.0;
  }

  // --- Per-track EQ chains (SPEC_016 §4) ---
  _trackEQs.kick = _makeTrackEQ([
    { type: 'lowpass', freq: 200, Q: 0.7 }
  ]);
  _trackEQs.bass = _makeTrackEQ([
    { type: 'highpass', freq: 40, Q: 0.7 },
    { type: 'peaking', freq: 80, gain: 3, Q: 1.0 },
    { type: 'lowpass', freq: 400, Q: 0.7 }
  ]);
  _trackEQs.snare = _makeTrackEQ([
    { type: 'highpass', freq: 100, Q: 0.7 },
    { type: 'peaking', freq: 2000, gain: 2, Q: 1.0 },
    { type: 'lowpass', freq: 8000, Q: 0.7 }
  ]);
  _trackEQs.hat = _makeTrackEQ([
    { type: 'highpass', freq: 3000, Q: 0.7 }
  ]);
  _trackEQs.pad = _makeTrackEQ([
    { type: 'highpass', freq: 200, Q: 0.7 },
    { type: 'peaking', freq: 500, gain: -2, Q: 1.0 },
    { type: 'lowpass', freq: 3000, Q: 0.7 }
  ]);
  _trackEQs.arp = _makeTrackEQ([
    { type: 'highpass', freq: 1000, Q: 0.7 },
    { type: 'peaking', freq: 4000, gain: 2, Q: 1.0 },
    { type: 'lowpass', freq: 8000, Q: 0.7 }
  ]);
  _trackEQs.perc = _makeTrackEQ([
    { type: 'highpass', freq: 400, Q: 0.7 },
    { type: 'lowpass', freq: 6000, Q: 0.7 }
  ]);
  _trackEQs.sfx = _makeTrackEQ([
    { type: 'highpass', freq: 100, Q: 0.7 },
    { type: 'peaking', freq: 500, gain: -2, Q: 1.0 },  // scoop mud range, clear of bass
    { type: 'lowpass', freq: 8000, Q: 0.7 }             // tighter LP — bullets/graze don't need >8kHz
  ]);
  // Melody: warm mid-range, below bullets (SPEC_017 §5/§9)
  _trackEQs.melody = _makeTrackEQ([
    { type: 'highpass', freq: 200, Q: 0.7 },
    { type: 'peaking', freq: 800, gain: 1, Q: 1.0 },   // +1dB warmth in melody range
    { type: 'peaking', freq: 2000, gain: -3, Q: 1.0 },  // -3dB above 2kHz to sit below bullets
    { type: 'lowpass', freq: 4000, Q: 0.7 }
  ]);

  // Perk: mid-range, between bass and arp (SPEC_025 §3.1)
  _trackEQs.perk = _makeTrackEQ([
    { type: 'highpass', freq: 150, Q: 0.7 },
    { type: 'peaking', freq: 600, gain: 1, Q: 1.0 },   // +1dB gentle presence
    { type: 'lowpass', freq: 5000, Q: 0.7 }
  ]);

  // --- Per-track sidechain gains (SPEC_016 §5) ---
  var scTracks = ['bass', 'pad', 'arp', 'perc', 'sfx', 'melody', 'perk'];
  for (var si = 0; si < scTracks.length; si++) {
    _trackSidechains[scTracks[si]] = audioCtx.createGain();
    _trackSidechains[scTracks[si]].gain.value = 1.0;
  }

  // --- Wire per-track: gain → EQ → [sidechain] → mixBus ---
  for (var ti = 0; ti < trackNames.length; ti++) {
    var tn = trackNames[ti];
    var gain = _trackGains[tn];
    var eqChain = _trackEQs[tn];

    // gain → first EQ filter
    gain.connect(eqChain[0]);

    // last EQ filter → sidechain (if track has one) → mixBus
    var eqOut = eqChain[eqChain.length - 1];
    if (_trackSidechains[tn]) {
      eqOut.connect(_trackSidechains[tn]);
      _trackSidechains[tn].connect(_mixBus);
    } else {
      // kick, snare, hat go direct to mixBus (no sidechain on themselves)
      eqOut.connect(_mixBus);
    }
  }

  // --- Send buses (SPEC_016 §4) ---
  // Reverb send bus → shared reverb
  _reverb = audioCtx.createConvolver();
  _reverb.buffer = _makeImpulse(0.8, 2.0);
  _reverbSend = audioCtx.createGain();
  _reverbSend.gain.value = 1.0;
  _reverbWet = audioCtx.createGain();
  _reverbWet.gain.value = 0.3;
  _reverbDry = audioCtx.createGain();
  _reverbDry.gain.value = 0.7;
  _reverbSend.connect(_reverb);
  _reverb.connect(_reverbWet);
  _reverbWet.connect(_mixBus);

  // Per-track reverb sends: pad (wet), snare (light), arp (medium)
  _trackReverbSends.pad = audioCtx.createGain();
  _trackReverbSends.pad.gain.value = 0.28;   // default, overridden per palette at run start
  _trackReverbSends.snare = audioCtx.createGain();
  _trackReverbSends.snare.gain.value = 0.15;
  _trackReverbSends.arp = audioCtx.createGain();
  _trackReverbSends.arp.gain.value = 0.25;
  // Melody reverb send (SPEC_017 §5)
  _trackReverbSends.melody = audioCtx.createGain();
  _trackReverbSends.melody.gain.value = 0.22;
  // Melody delay send
  _trackDelaySends.melody = audioCtx.createGain();
  _trackDelaySends.melody.gain.value = 0.15;
  // Perk reverb + delay sends (SPEC_025 §3.1 — subtle: close/present feel)
  _trackReverbSends.perk = audioCtx.createGain();
  _trackReverbSends.perk.gain.value = 0.15;
  _trackDelaySends.perk = audioCtx.createGain();
  _trackDelaySends.perk.gain.value = 0.10;

  // Wire: track EQ output → send gain → reverb bus
  _trackEQs.pad[_trackEQs.pad.length - 1].connect(_trackReverbSends.pad);
  _trackReverbSends.pad.connect(_reverbSend);
  _trackEQs.snare[_trackEQs.snare.length - 1].connect(_trackReverbSends.snare);
  _trackReverbSends.snare.connect(_reverbSend);
  _trackEQs.arp[_trackEQs.arp.length - 1].connect(_trackReverbSends.arp);
  _trackReverbSends.arp.connect(_reverbSend);
  _trackEQs.melody[_trackEQs.melody.length - 1].connect(_trackReverbSends.melody);
  _trackReverbSends.melody.connect(_reverbSend);
  _trackEQs.perk[_trackEQs.perk.length - 1].connect(_trackReverbSends.perk);
  _trackReverbSends.perk.connect(_reverbSend);

  // Delay send bus → shared delay
  _delay = audioCtx.createDelay(1.0);
  _delay.delayTime.value = (CFG.BEAT_MS / 2) / 1000;
  _delayFeedback = audioCtx.createGain();
  _delayFeedback.gain.value = 0.25;
  _delaySend = audioCtx.createGain();
  _delaySend.gain.value = 1.0;
  var _delayOut = audioCtx.createGain();
  _delayOut.gain.value = 0.5;
  _delaySend.connect(_delay);
  _delay.connect(_delayFeedback);
  _delayFeedback.connect(_delay);
  _delay.connect(_delayOut);
  _delayOut.connect(_mixBus);

  // Per-track delay sends: arp (8th note), sfx/bullets (16th note, low feedback)
  _trackDelaySends.arp = audioCtx.createGain();
  _trackDelaySends.arp.gain.value = 0.2;
  _trackDelaySends.sfx = audioCtx.createGain();
  _trackDelaySends.sfx.gain.value = 0.1;
  _trackEQs.arp[_trackEQs.arp.length - 1].connect(_trackDelaySends.arp);
  _trackDelaySends.arp.connect(_delaySend);
  _trackEQs.sfx[_trackEQs.sfx.length - 1].connect(_trackDelaySends.sfx);
  _trackDelaySends.sfx.connect(_delaySend);
  // Melody delay send (wired after _delaySend is created)
  _trackEQs.melody[_trackEQs.melody.length - 1].connect(_trackDelaySends.melody);
  _trackDelaySends.melody.connect(_delaySend);
  // Perk delay send (SPEC_025 §3.1)
  _trackEQs.perk[_trackEQs.perk.length - 1].connect(_trackDelaySends.perk);
  _trackDelaySends.perk.connect(_delaySend);

  // ── Master chain: mixBus → compressor → softClip → masterEQ → limiter → dest ──

  // Compressor: glue + clip prevention
  _compressor = audioCtx.createDynamicsCompressor();
  _compressor.threshold.value = -14;   // relaxed: per-track EQ reduces inter-track masking
  _compressor.ratio.value = 2.5;       // gentler ratio — per-track sidechain handles dynamics
  _compressor.attack.value = 0.003;
  _compressor.release.value = 0.25;

  // Soft clipper (SPEC_016 §4 — replaces waveshaper in signal path)
  _softClip = audioCtx.createWaveShaper();
  _softClip.curve = _makeSoftClipCurve();
  _softClip.oversample = '2x';

  // Master EQ: 3-band post-compression (SPEC_016 §4)
  _masterEQ.low = audioCtx.createBiquadFilter();
  _masterEQ.low.type = 'lowshelf';
  _masterEQ.low.frequency.value = 80;
  _masterEQ.low.gain.value = 1;     // +1dB sub warmth
  _masterEQ.mid = audioCtx.createBiquadFilter();
  _masterEQ.mid.type = 'peaking';
  _masterEQ.mid.frequency.value = 500;
  _masterEQ.mid.gain.value = -1.5;  // -1.5dB reduce muddiness
  _masterEQ.mid.Q.value = 1.0;
  _masterEQ.high = audioCtx.createBiquadFilter();
  _masterEQ.high.type = 'highshelf';
  _masterEQ.high.frequency.value = 8000;
  _masterEQ.high.gain.value = 1;    // +1dB air/sparkle

  // Limiter: hard ceiling
  _limiter = audioCtx.createDynamicsCompressor();
  _limiter.threshold.value = -2;     // tighter ceiling — soft clip handles saturation below this
  _limiter.knee.value      = 0;
  _limiter.ratio.value     = 20;
  _limiter.attack.value    = 0.001;
  _limiter.release.value   = 0.1;

  // Wire master chain
  _mixBus.connect(_compressor);
  _compressor.connect(_softClip);
  _softClip.connect(_masterEQ.low);
  _masterEQ.low.connect(_masterEQ.mid);
  _masterEQ.mid.connect(_masterEQ.high);
  _masterEQ.high.connect(masterGain);
  masterGain.connect(_limiter);
  _limiter.connect(audioCtx.destination);

  // ── Legacy compat: submixGain → mixBus (for any code still using it) ──
  submixGain.connect(_mixBus);
  // sfxGain → sfx track gain (gets EQ + sidechain from per-track chain)
  sfxGain.connect(_trackGains.sfx);

  // ── Sidechain gain (legacy — still used by _pumpSidechain for global duck) ──
  if (typeof _initSidechain === 'function') _initSidechain();

  // ── AnalyserNode for FFT visualizer (SPEC_028 §3) ──
  _analyser = audioCtx.createAnalyser();
  _analyser.fftSize = 128;                  // → 64 frequency bins
  _analyser.smoothingTimeConstant = 0.82;
  _mixBus.connect(_analyser);               // tap raw mix signal before master chain

  // ── Pre-render transient buffers (SPEC_016 §6) ──
  _prerenderTransient({ duration: 0.005, freqLo: 2000, freqHi: 8000, Q: 0.8, peakGain: 0.8 })
    .then(function(buf) { _transientBuffers.kick_click = buf; });
  _prerenderTransient({ duration: 0.030, freqLo: 3000, freqHi: 6000, Q: 2.0, peakGain: 0.6 })
    .then(function(buf) { _transientBuffers.snare_rattle = buf; });
  _prerenderTransient({ duration: 0.010, freqLo: 6000, freqHi: 12000, Q: 1.5, peakGain: 0.5 })
    .then(function(buf) { _transientBuffers.hat_body = buf; });
  _prerenderTransient({ duration: 0.040, freqLo: 1000, freqHi: 4000, Q: 0.8, peakGain: 0.7 })
    .then(function(buf) { _transientBuffers.clap = buf; });
  _prerenderTransient({ duration: 0.015, freqLo: 800, freqHi: 3000, Q: 1.2, peakGain: 0.6 })
    .then(function(buf) { _transientBuffers.rim = buf; });
}

function applyVolumeSetting() {
  if (!masterGain || !audioCtx) return;
  var vol = (typeof G !== 'undefined') ? (G.settings.volume !== undefined ? G.settings.volume : 0.8) : 0.8;
  // Cancel any pending automation (e.g. death fade) before setting volume,
  // otherwise the scheduled ramp overwrites the assigned value.
  masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
  masterGain.gain.setValueAtTime(vol, audioCtx.currentTime);
}

// ── FFT analyser access for visualizer (SPEC_028 §3) ──────────────────────
function getAnalyser() { return _analyser; }

// ── SFX bus mute/unmute — master switch for all non-music audio ──────────
// Call muteSfx() on pause, perkPause, death. unmuteSfx() on resume/unpause.
function muteSfx() {
  if (!sfxGain || !audioCtx) return;
  sfxGain.gain.cancelScheduledValues(audioCtx.currentTime);
  sfxGain.gain.setValueAtTime(sfxGain.gain.value, audioCtx.currentTime);
  sfxGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.03);
}

function unmuteSfx() {
  if (!sfxGain || !audioCtx) return;
  sfxGain.gain.cancelScheduledValues(audioCtx.currentTime);
  sfxGain.gain.setValueAtTime(sfxGain.gain.value, audioCtx.currentTime);
  sfxGain.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + 0.05);
}

function startBeatClock(callback) {
  stopBeatClock();
  initAudio();
  applyVolumeSetting();
  _beatCallback = callback;
  _nextBeatTime = audioCtx.currentTime + 0.05; // small start offset
  _beatScheduler = setInterval(() => {
    if (!_beatCallback) return;
    const lookAhead = audioCtx.currentTime + _LOOKAHEAD_S;
    while (_nextBeatTime < lookAhead) {
      _beatCallback(_nextBeatTime); // pass scheduled beat time to caller
      // Use G.bpm if available (palette-driven), else fall back to CFG
      const beatMs = (typeof G !== 'undefined' && G.bpm) ? (60000 / G.bpm) : CFG.BEAT_MS;
      _nextBeatTime += beatMs / 1000;
    }
  }, _SCHEDULER_MS);
}

function stopBeatClock() {
  if (_beatScheduler) clearInterval(_beatScheduler);
  _beatScheduler = null;
  _beatCallback = null;
  _nextBeatTime = 0;
}


function resetAudioLevel() {
  // Legacy waveshaper reset (still used by _applyPhaseEffects dist ramp)
  if (waveshaper) {
    waveshaper.curve = _makeDistortionCurve(0);
    waveshaper._currentDist = 0;
  }
  // masterGain owned by applyVolumeSetting — not reset here
}

// ── Play a pre-rendered transient buffer on a track (SPEC_016 §6) ──
function _playTransient(name, trackGain, time, gainMult) {
  if (!audioCtx || !_transientBuffers[name] || !trackGain) return;
  var src = audioCtx.createBufferSource();
  src.buffer = _transientBuffers[name];
  var g = audioCtx.createGain();
  g.gain.value = gainMult || 1.0;
  src.connect(g);
  g.connect(trackGain);
  src.start(time);
}

// ── Per-track sidechain pump (SPEC_016 §5) ──
// Each track ducks with its own amount/release. Called from _synthKick.
var _SIDECHAIN_PROFILES = {
  bass: { duck: 0.80, attack: 0.005, release: 0.120 },
  pad:  { duck: 0.40, attack: 0.010, release: 0.200 },
  arp:  { duck: 0.50, attack: 0.005, release: 0.100 },
  perc: { duck: 0.30, attack: 0.005, release: 0.100 },
  sfx:    { duck: 0.20, attack: 0.010, release: 0.080 },
  melody: { duck: 0.35, attack: 0.010, release: 0.150 },
  perk:   { duck: 0.30, attack: 0.010, release: 0.180 },  // light duck, same as pad profile (SPEC_025 §3.1)
};

function _pumpTrackSidechains(t) {
  // Apply per-phase sidechain multiplier from StateMapper (SPEC_016 §5/§7)
  var phaseMult = (typeof StateMapper !== 'undefined' && StateMapper._sidechainPhaseMult)
    ? StateMapper._sidechainPhaseMult : 1.0;
  var tracks = ['bass', 'pad', 'arp', 'perc', 'sfx', 'melody', 'perk'];
  for (var i = 0; i < tracks.length; i++) {
    var sc = _trackSidechains[tracks[i]];
    if (!sc) continue;
    var prof = _SIDECHAIN_PROFILES[tracks[i]];
    var scaledDuck = Math.min(prof.duck * phaseMult, 0.95);
    var duckVal = 1 - scaledDuck;
    sc.gain.cancelScheduledValues(t);
    sc.gain.setValueAtTime(1.0, t);
    sc.gain.linearRampToValueAtTime(duckVal, t + prof.attack);
    sc.gain.linearRampToValueAtTime(1.0, t + prof.attack + prof.release);
  }
}

// --- Helper: create a short oscillator routed through SFX bus ---
function _playNote(type, freq, gainPeak, duration, startTime) {
  if (!audioCtx || !sfxGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(gainPeak, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// playBeatTick removed — Sequencer kick handles beat marking now

function playHitSFX() {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;

  // --- Root pitch from HarmonyEngine (in key), fallback to A2 ---
  var rootMidi = 45; // A2 fallback
  if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine._currentChord) {
    // Chord root in octave 3 — low register, clearly distinct from bullet voices
    rootMidi = (3 + 1) * 12 + HarmonyEngine._currentChord.rootSemitone;
  }
  var rootFreq  = midiToFreq(rootMidi);
  var fifthFreq = midiToFreq(rootMidi - 7); // descending fifth (in key)

  // --- HP varies character: 3HP=punch, 2HP=grind, 1HP=alarm ---
  var hp = (typeof G !== 'undefined') ? G.hp : 3;

  if (hp >= 3) {
    // Full HP: sharp sawtooth punch — root → fifth descent
    _playNote('sawtooth', rootFreq,  CFG.GAIN.hit_hp3,  0.08, t);
    _playNote('sawtooth', fifthFreq, CFG.GAIN.hit_hp3b, 0.12, t + 0.06);
  } else if (hp === 2) {
    // Mid-damage: harsher, square wave, faster descent + noise burst
    _playNote('square', rootFreq,        CFG.GAIN.hit_hp2,  0.06, t);
    _playNote('square', fifthFreq,       CFG.GAIN.hit_hp2b, 0.10, t + 0.04);
    _playNote('square', fifthFreq * 0.5, CFG.GAIN.hit_hp2c, 0.14, t + 0.10); // sub octave kick
  } else {
    // Last HP: stacked tritone — dissonant, urgent, unmissable
    var tritone = midiToFreq(rootMidi - 6); // flat fifth = danger tone
    _playNote('sawtooth', rootFreq,  CFG.GAIN.hit_hp1,  0.05, t);
    _playNote('sawtooth', tritone,   CFG.GAIN.hit_hp1b, 0.08, t + 0.03);
    _playNote('sawtooth', fifthFreq, CFG.GAIN.hit_hp1c, 0.12, t + 0.08);
    _playNote('sawtooth', tritone,   CFG.GAIN.hit_hp1d, 0.16, t + 0.16); // echo
  }
}

function playComboSFX(combo) {
  if (!audioCtx) return;
  // Only fire on milestones
  if (combo !== 5 && combo !== 10 && combo !== 20 && combo !== 50) return;
  var t = audioCtx.currentTime;

  // Ascending arpeggio of current chord tones (in key)
  var tones;
  if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine._currentChord) {
    tones = HarmonyEngine.getChordTones(5); // octave 5
    // For x50: add octave above for extra sparkle
    if (combo >= 50) {
      var highTones = HarmonyEngine.getChordTones(6);
      if (highTones.length > 0) tones.push(highTones[0]);
    }
  } else {
    // Fallback: generic ascending
    tones = [440, 554, 659];
  }

  // Scale gain by milestone
  var gainScale = combo >= 50 ? CFG.GAIN.combo_hi : combo >= 20 ? CFG.GAIN.combo_mid : CFG.GAIN.combo_lo;
  var spacing   = combo >= 50 ? 0.06 : 0.08;

  // Duck delay feedback briefly to prevent combo SFX from recirculating
  if (_delayFeedback && combo >= 20) {
    var savedFb = _delayFeedback.gain.value;
    _delayFeedback.gain.setValueAtTime(savedFb * 0.3, t);
    _delayFeedback.gain.linearRampToValueAtTime(savedFb, t + 0.4);
  }

  for (var i = 0; i < tones.length; i++) {
    var freq = (typeof tones[i] === 'number' && tones[i] > 100)
      ? tones[i]                          // already Hz (fallback)
      : midiToFreq(tones[i]);             // MIDI note
    // midiToFreq always used since getChordTones returns MIDI
    freq = midiToFreq(tones[i]);
    _playNote('sine', freq, gainScale - i * 0.01, 0.15, t + i * spacing);
  }
}

function playNearMissSFX() {
  // Legacy wrapper — routes to normal graze
  playGrazeSFX('normal');
}

// ── Tier-based graze SFX (SPEC_012) ──────────────────────────────────
// Each tier is percussive (attack <5ms, decay 60–120ms), uses chord tones.
function playGrazeSFX(tier) {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;

  // Chord-tone frequency (5th of current chord, octave 6)
  var freq = 1200;
  if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine._currentChord) {
    var root = HarmonyEngine._currentChord.rootSemitone;
    freq = midiToFreq((6 + 1) * 12 + root + 7);
  }

  if (tier === 'perfect') {
    // Full slash: noise burst + pitched resonance + short reverb tail
    var gain = CFG.GAIN.graze_perfect;
    // Pitched resonance (bandpass-filtered oscillator)
    _playNote('sine', freq, gain, 0.12, t);
    _playNote('triangle', freq * 1.5, gain * 0.5, 0.08, t);
    // Noise burst via short filtered click
    var bufLen = audioCtx.sampleRate * 0.015;
    var buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.8;
    var noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    var noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(gain * 0.7, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    var bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 3;
    noise.connect(bp).connect(noiseGain).connect(sfxGain);
    noise.start(t); noise.stop(t + 0.06);
  } else if (tier === 'tight') {
    // Sharper transient + harmonic overtone
    var gain = CFG.GAIN.graze_tight;
    _playNote('triangle', freq, gain, 0.08, t);
    _playNote('square', freq * 2, gain * 0.3, 0.04, t);
  } else {
    // Normal: filtered click, in-key
    _playNote('sine', freq, CFG.GAIN.graze_normal, 0.06, t);
  }
}

// ── Slash SFX (SPEC_012 §2.1, §6) ────────────────────────────────────
// Metallic slice transient layered on top of graze SFX.
// Short, bright, percussive. Scales with tier.
function playSlashSFX(tier) {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  var gain = CFG.GAIN.slash_layer;
  var isPerfect = tier === 'perfect';
  var isTight   = tier === 'tight';

  // High-pitched metallic ping (bandpass noise burst)
  var slashLen = isPerfect ? 0.04 : (isTight ? 0.03 : 0.02);
  var slashGain = isPerfect ? gain : (isTight ? gain * 0.75 : gain * 0.5);
  var bufLen2 = Math.floor(audioCtx.sampleRate * slashLen);
  var buf2 = audioCtx.createBuffer(1, bufLen2, audioCtx.sampleRate);
  var data2 = buf2.getChannelData(0);
  for (var i = 0; i < bufLen2; i++) data2[i] = (Math.random() * 2 - 1);
  var noiseSrc = audioCtx.createBufferSource();
  noiseSrc.buffer = buf2;
  // Bandpass centered at a high metallic frequency
  var slashBP = audioCtx.createBiquadFilter();
  slashBP.type = 'bandpass';
  slashBP.frequency.value = 3200 + (isPerfect ? 800 : 0);
  slashBP.Q.value = 6;
  var slashGainNode = audioCtx.createGain();
  slashGainNode.gain.setValueAtTime(slashGain, t);
  slashGainNode.gain.exponentialRampToValueAtTime(0.001, t + slashLen);
  // Route to perk track (SPEC_025 §8 — Edge family SFX through mix chain)
  var slashDest = (typeof _trackGains !== 'undefined' && _trackGains.perk) ? _trackGains.perk : sfxGain;
  noiseSrc.connect(slashBP).connect(slashGainNode).connect(slashDest);
  noiseSrc.start(t); noiseSrc.stop(t + slashLen);

  // Add a brief high sine ping for metal ring on tight/perfect
  if (isTight || isPerfect) {
    var pingFreq = isPerfect ? 2800 : 2200;
    // Inline to route to perk track
    var pingOsc = audioCtx.createOscillator();
    var pingGain = audioCtx.createGain();
    pingOsc.type = 'sine';
    pingOsc.frequency.value = pingFreq;
    pingGain.gain.setValueAtTime(slashGain * 0.4, t);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, t + slashLen * 0.8);
    pingOsc.connect(pingGain).connect(slashDest);
    pingOsc.start(t); pingOsc.stop(t + slashLen * 0.8);
  }
}

// ── Beat Pulse SFX (SPEC_012 §2.3, §6) ─────────────────────────────────
// Bass-heavy boom: sub-bass thump (root note octave 2, 0.1s) + noise burst
// + sidechain pump on all other audio (100ms duck).
function playPulseSFX() {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  var gain = CFG.GAIN.pulse_boom;

  // Sub-bass thump — root note of current chord, octave 2
  var rootFreq = 65; // fallback ~C2
  if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine._currentChord) {
    rootFreq = midiToFreq(2 * 12 + HarmonyEngine._currentChord.rootSemitone);
  }
  // Pitch envelope: start slightly higher for punch
  var subOsc = audioCtx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(rootFreq * 1.5, t);
  subOsc.frequency.exponentialRampToValueAtTime(rootFreq, t + 0.03);
  var subGain = audioCtx.createGain();
  subGain.gain.setValueAtTime(gain, t);
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  // Sub-bass (65Hz root) routes to bass track — perk EQ has 150Hz HP which would gut it.
  // SPEC_025 §8: Beat Pulse is a musical event; sub-bass lives naturally in bass lane.
  var subDest = (typeof _trackGains !== 'undefined' && _trackGains.bass) ? _trackGains.bass : sfxGain;
  subOsc.connect(subGain).connect(subDest);
  subOsc.start(t); subOsc.stop(t + 0.12);

  // Noise transient burst (800Hz LP — mid-range content) routes to perk track
  var pulseDest = (typeof _trackGains !== 'undefined' && _trackGains.perk) ? _trackGains.perk : sfxGain;
  var bufLen = Math.floor(audioCtx.sampleRate * 0.03);
  var buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);
  var noiseSrc = audioCtx.createBufferSource();
  noiseSrc.buffer = buf;
  var noiseBP = audioCtx.createBiquadFilter();
  noiseBP.type = 'lowpass';
  noiseBP.frequency.value = 800;
  var noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(gain * 0.6, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  noiseSrc.connect(noiseBP).connect(noiseGain).connect(pulseDest);
  noiseSrc.start(t); noiseSrc.stop(t + 0.05);

  // Sidechain pump: duck ALL other audio for 100ms via _pumpSidechain
  if (typeof _pumpSidechain === 'function') {
    _pumpSidechain(t, 0.85); // deep duck — 85% reduction
  }
}

// ── HP Regen SFX (SPEC_013 §3) ──────────────────────────────────────────────
// Ascending 3-note chime (root, +4st, +7st). Warm triangle wave, gentle attack.
function playRegenSFX() {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  var gain = CFG.GAIN.regen || 0.08;

  // Root frequency from current palette
  var rootFreq = 261.63; // fallback C4
  if (typeof HarmonyEngine !== 'undefined' && HarmonyEngine._currentChord) {
    rootFreq = midiToFreq(4 * 12 + HarmonyEngine._currentChord.rootSemitone);
  }

  var intervals = [0, 4, 7]; // root, +4 semitones, +7 semitones
  intervals.forEach(function(semis, i) {
    var freq = rootFreq * Math.pow(2, semis / 12);
    var noteT = t + i * 0.15;
    var osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, noteT);
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0, noteT);
    g.gain.linearRampToValueAtTime(gain, noteT + 0.02);   // gentle attack
    g.gain.exponentialRampToValueAtTime(0.001, noteT + 0.15);
    osc.connect(g).connect(sfxGain);
    osc.start(noteT); osc.stop(noteT + 0.18);
  });
}
