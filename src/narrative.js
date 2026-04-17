// ========== NARRATIVE CONDUCTOR (SPEC_020 §1–§2) ==========
// High-level musical narrative state machine. Sits above StateMapper.
// Generates a 4-note theme motif per run and plays variations at phase transitions.
// Dependencies: HarmonyEngine, MelodyEngine, audioCtx, G (global state)

var NarrativeConductor = {

  // ── State ──────────────────────────────────────────────────────────────────
  _act: 'intro',            // current narrative act (maps to phase)
  _motif: null,             // { degrees: [4 ints], rhythm: [4 floats], octave: int }
  _motifMidi: null,         // cached [4 MIDI notes] at current key
  _palette: null,
  _paletteName: null,
  _active: false,
  _introPlayed: false,      // has Pulse intro motif been played?
  _swellPlayed: false,
  _stormPlayed: false,
  _maelstromPlayed: false,
  _surgeLastBeat: 0,        // beat count of last Surge motif
  _canonVoiceTimeout: null,  // timeout ID for Maelstrom canon 2nd voice
  _deathPlayed: false,

  // ── Instrument introduction tracking (SPEC_020 §3) ──
  _introduced: {},          // track → true once intro has been triggered
  _introTimeouts: [],       // setTimeout IDs for cleanup
  _reentryUntil: 0,         // beat count when re-entry gain ramp ends

  // Phase → act mapping
  _PHASE_ACT: {
    pulse: 'intro', swell: 'build', surge: 'peak',
    storm: 'crisis', maelstrom: 'transcendence'
  },

  // ── Init ───────────────────────────────────────────────────────────────────
  initRun: function(palette) {
    this._palette = palette;
    this._paletteName = palette ? (palette.name || null) : null;
    this._act = 'intro';
    this._active = true;
    this._introPlayed = false;
    this._swellPlayed = false;
    this._stormPlayed = false;
    this._maelstromPlayed = false;
    this._surgeLastBeat = -999;
    this._deathPlayed = false;
    if (this._canonVoiceTimeout) {
      clearTimeout(this._canonVoiceTimeout);
      this._canonVoiceTimeout = null;
    }
    this._clearIntroTimeouts();
    this._introduced = { kick: true }; // kick always present
    this._reentryUntil = 0;
    // Reset streak milestones (SPEC_020 §5)
    this._streakMilestonesHit = {};
    this._streakOctaveShiftActive = false;
    this._streakUnison = false;
    // Reset silence state (SPEC_020 §8)
    this._silenceState = null;
    this._firstHitSilenced = false;
    this._intensity50Silenced = false;
    this._prePhaseDropBeat = 0;
    this._generateThemeMotif(palette);
    console.log('[NarrativeConductor] initRun: motif degrees=' +
      (this._motif ? this._motif.degrees.join(',') : 'none'));
  },

  // ── Motif generation (SPEC_020 §2) ─────────────────────────────────────────
  // Generates a 4-note motif from scale degrees.
  // Constraints:
  //   - first note = root (degree 0) or nearest-to-fifth
  //   - last note = root (degree 0)
  //   - middle notes: prefer stepwise or third intervals (±1 or ±2 degrees)
  //   - rhythm: quarter, 8th, 8th, half (relative to beat duration)
  _generateThemeMotif: function(palette) {
    if (typeof HarmonyEngine === 'undefined') { this._motif = null; return; }

    var scale = HarmonyEngine._melodyScale || [0, 2, 3, 5, 7, 8, 10];
    var scaleLen = scale.length;

    // Find the degree index closest to a perfect fifth (7 semitones)
    var fifthDeg = 0;
    var bestDist = 999;
    for (var i = 0; i < scaleLen; i++) {
      var d = Math.abs(scale[i] - 7);
      if (d < bestDist) { bestDist = d; fifthDeg = i; }
    }

    // First note: root (0) or fifth, weighted 60/40
    var rng = (typeof _songRng === 'function') ? _songRng : Math.random;
    var deg0 = rng() < 0.6 ? 0 : fifthDeg;

    // Last note: always root
    var deg3 = 0;

    // Middle notes: Markov-like stepwise preference
    var deg1 = this._pickNextDegree(deg0, scaleLen);
    var deg2 = this._pickNextDegree(deg1, scaleLen);

    // Avoid deg2 === deg3 (boring resolution) — if same, shift by 1
    if (deg2 === deg3 && scaleLen > 2) {
      deg2 = (deg3 + 1) % scaleLen;
    }

    // Rhythm: quarter, 8th, 8th, half (as beat fractions)
    var rhythm = [1.0, 0.5, 0.5, 2.0];

    this._motif = {
      degrees: [deg0, deg1, deg2, deg3],
      rhythm: rhythm,
      octave: 5  // melody register
    };

    this._refreshMotifMidi();
  },

  // Pick next degree preferring stepwise (±1) or third (±2) motion
  _pickNextDegree: function(currentDeg, scaleLen) {
    // Weights: ±1 = 40% each, ±2 = 10% each
    var candidates = [];
    var weights = [];
    var offsets = [-2, -1, 1, 2];
    var offsetWeights = [0.10, 0.40, 0.40, 0.10];
    for (var i = 0; i < offsets.length; i++) {
      var d = currentDeg + offsets[i];
      if (d >= 0 && d < scaleLen) {
        candidates.push(d);
        weights.push(offsetWeights[i]);
      }
    }
    if (candidates.length === 0) return (currentDeg + 1) % scaleLen;

    // Normalize + pick
    var sum = 0;
    for (var j = 0; j < weights.length; j++) sum += weights[j];
    var rng = (typeof _songRng === 'function') ? _songRng : Math.random;
    var r = rng() * sum;
    var acc = 0;
    for (var k = 0; k < candidates.length; k++) {
      acc += weights[k];
      if (r <= acc) return candidates[k];
    }
    return candidates[candidates.length - 1];
  },

  // Recompute MIDI notes from degrees + current HarmonyEngine key
  _refreshMotifMidi: function() {
    if (!this._motif || typeof HarmonyEngine === 'undefined') {
      this._motifMidi = null;
      return;
    }
    var scale = HarmonyEngine._melodyScale || [0, 2, 3, 5, 7, 8, 10];
    var root = HarmonyEngine.root || 0;
    var octave = this._motif.octave;
    var baseMidi = (octave + 1) * 12;
    var degrees = this._motif.degrees;
    this._motifMidi = [];
    for (var i = 0; i < degrees.length; i++) {
      var deg = degrees[i] % scale.length;
      this._motifMidi.push(baseMidi + root + scale[deg]);
    }
  },

  // ── Motif variation system (SPEC_020 §2) ───────────────────────────────────
  // Returns a transformed MIDI array from the base motif.
  // Variations: original, harmonized_3rds, inverted, transposed, augmented_canon, retrograde
  _getVariation: function(type) {
    if (!this._motifMidi || this._motifMidi.length < 4) return null;

    var midi = this._motifMidi;
    var scale = (typeof HarmonyEngine !== 'undefined') ? HarmonyEngine._melodyScale : [0, 2, 3, 5, 7, 8, 10];
    var root = (typeof HarmonyEngine !== 'undefined') ? HarmonyEngine.root : 0;
    var baseMidi = (this._motif.octave + 1) * 12;
    var result;

    switch (type) {
      case 'original':
        return midi.slice();

      case 'harmonized_3rds':
        // Each note + a third above (2 scale degrees up)
        result = [];
        for (var h = 0; h < midi.length; h++) {
          result.push(midi[h]);
          var degAbove = (this._motif.degrees[h] + 2) % scale.length;
          result.push(baseMidi + root + scale[degAbove]);
        }
        return result; // 8 notes: pairs of [note, third]

      case 'inverted':
        // Intervals flip direction around first note
        var anchor = midi[0];
        result = [anchor];
        for (var v = 1; v < midi.length; v++) {
          var interval = midi[v] - midi[v - 1];
          result.push(result[v - 1] - interval); // flip direction
        }
        return result;

      case 'transposed':
        // Shift all notes by the distance between old root and current root
        // (useful after Storm modulation — refresh first)
        this._refreshMotifMidi();
        return this._motifMidi.slice();

      case 'retrograde':
        // Played backwards
        return midi.slice().reverse();

      default:
        return midi.slice();
    }
  },

  // ── Motif playback ─────────────────────────────────────────────────────────
  // Plays a motif variation through MelodyEngine._playMelodyNote
  _playMotifVariation: function(variation, beatTime, options) {
    if (!this._active || typeof MelodyEngine === 'undefined' || !audioCtx) return;

    var notes = this._getVariation(variation);
    if (!notes || notes.length === 0) return;

    var opts = options || {};
    var volume = opts.volume || null;     // null = MelodyEngine default
    var tempoMult = opts.tempoMult || 1.0; // 2.0 = augmented (double duration)
    var beatDur = 60 / G.bpm;
    var rhythm = this._motif.rhythm;

    // For harmonized_3rds: notes come in pairs, rhythm applies to pairs
    var isHarmonized = (variation === 'harmonized_3rds');
    var rhythmIdx = 0;
    var t = beatTime;

    for (var i = 0; i < notes.length; i++) {
      var midi = notes[i];

      // Revalidate against current chord
      if (typeof MelodyEngine !== 'undefined' && MelodyEngine._revalidateNote) {
        midi = MelodyEngine._revalidateNote(midi);
      }

      var rhythmVal;
      if (isHarmonized) {
        // Pairs share timing — odd indices are the harmony note at same time
        if (i % 2 === 0) {
          rhythmVal = rhythm[rhythmIdx] || 1.0;
        } else {
          // Harmony note plays at same time as root note
          MelodyEngine._playMelodyNote(midi, t, volume, beatDur * (rhythm[rhythmIdx] || 1.0) * tempoMult);
          rhythmIdx++;
          continue;
        }
      } else if (variation === 'retrograde') {
        // Retrograde uses reversed rhythm
        rhythmVal = rhythm[rhythm.length - 1 - (i % rhythm.length)] || 1.0;
      } else {
        rhythmVal = rhythm[i % rhythm.length] || 1.0;
      }

      var dur = beatDur * rhythmVal * tempoMult;
      MelodyEngine._playMelodyNote(midi, t, volume, dur);
      t += dur;
    }

    return t; // return end time for chaining
  },

  // ── Narrative motif enabled for current palette ────────────────────────────
  // Returns false when palette.melody.narrativeMotif === false (legato bloom palettes)
  _narrativeMotifEnabled: function() {
    return !(this._palette && this._palette.melody && this._palette.melody.narrativeMotif === false);
  },

  // ── onBeat — called every beat from StateMapper.update ─────────────────────
  onBeat: function(beatTime) {
    if (!this._active) return;

    this._act = this._PHASE_ACT[G.phase] || 'intro';

    // Pulse intro motif: play at beat 4
    if (!this._introPlayed && G.phase === 'pulse' && G.beatCount === 4) {
      this._introPlayed = true;
      if (this._narrativeMotifEnabled()) {
        this._refreshMotifMidi();
        this._playMotifVariation('original', beatTime, { volume: 0.5 });
      }
    }

    // Surge recurring motif: every 32 beats
    if (G.phase === 'surge' && (G.beatCount - this._surgeLastBeat) >= 32) {
      this._surgeLastBeat = G.beatCount;
      if (this._narrativeMotifEnabled()) {
        this._refreshMotifMidi();
        this._playMotifVariation('inverted', beatTime, { volume: 0.7 });
      }
    }

    // Silence moments + streak unison check (SPEC_020 §8)
    this._checkSilenceMoments(beatTime);
  },

  // ── onPhaseChange — called from StateMapper._onPhaseChange ─────────────────
  onPhaseChange: function(newPhase, oldPhase, beatTime) {
    if (!this._active) return;

    this._act = this._PHASE_ACT[newPhase] || 'intro';

    // 1-beat silence at phase transition (SPEC_020 §8) — skip first phase entry (pulse)
    if (oldPhase) {
      this.schedulePhaseTransitionSilence(beatTime);
    }

    // Maelstrom intimate moment: 4 beats of near-silence with motif (SPEC_020 §8)
    if (newPhase === 'maelstrom') {
      this.scheduleMaelstromIntimacy(beatTime);
    }

    var motifEnabled = this._narrativeMotifEnabled();

    switch (newPhase) {
      case 'swell':
        if (!this._swellPlayed) {
          this._swellPlayed = true;
          if (motifEnabled) {
            // Harmonized in 3rds, one octave up
            var savedOctave = this._motif.octave;
            this._motif.octave = 6;
            this._refreshMotifMidi();
            this._playMotifVariation('harmonized_3rds', beatTime, { volume: 0.6 });
            this._motif.octave = savedOctave;
            this._refreshMotifMidi();
          }
        }
        break;

      case 'surge':
        // First Surge occurrence: inverted motif
        this._surgeLastBeat = G.beatCount;
        if (motifEnabled) {
          this._refreshMotifMidi();
          this._playMotifVariation('inverted', beatTime, { volume: 0.7 });
        }
        break;

      case 'storm':
        if (!this._stormPlayed) {
          this._stormPlayed = true;
          if (motifEnabled) {
            // Transposed to new key (Storm modulation already happened via StateMapper)
            // Wait 1 beat for modulation to settle, then play
            var self = this;
            var delayMs = (60 / G.bpm) * 1000;
            setTimeout(function() {
              if (!self._active) return;
              self._refreshMotifMidi();
              self._playMotifVariation('transposed', audioCtx.currentTime, { volume: 0.75 });
            }, delayMs);
          }
        }
        break;

      case 'maelstrom':
        if (!this._maelstromPlayed) {
          this._maelstromPlayed = true;
          if (!motifEnabled) break;
          // Augmented canon: double duration, then 2nd voice 2 beats behind
          this._refreshMotifMidi();
          var endTime = this._playMotifVariation('original', beatTime, {
            volume: 0.6, tempoMult: 2.0
          });

          // Canon: 2nd voice enters 2 beats later
          var canonDelay = (60 / G.bpm) * 2;
          var canonTime = beatTime + canonDelay;
          var self2 = this;
          var canonDelayMs = canonDelay * 1000;
          this._canonVoiceTimeout = setTimeout(function() {
            if (!self2._active) return;
            self2._playMotifVariation('original', audioCtx.currentTime, {
              volume: 0.45, tempoMult: 2.0
            });
            self2._canonVoiceTimeout = null;
          }, canonDelayMs);
        }
        break;
    }
  },

  // ── onHit — called from StateMapper.onHit ──────────────────────────────────
  // Fragment: only first 2 notes, then silence
  onHit: function() {
    if (!this._active || !audioCtx) return;

    // First hit silence: 1-beat bass+drum cut (SPEC_020 §8)
    this.scheduleFirstHitSilence(audioCtx.currentTime);

    // Reset streak milestones on hit (SPEC_020 §5)
    this.resetStreakMilestones();

    if (typeof MelodyEngine === 'undefined') return;
    if (!this._motifMidi || this._motifMidi.length < 2) return;

    this._refreshMotifMidi();
    var notes = this._motifMidi;
    var t = audioCtx.currentTime;
    var beatDur = 60 / G.bpm;
    var rhythm = this._motif.rhythm;

    // Play only first 2 notes at reduced volume
    MelodyEngine._playMelodyNote(notes[0], t, 0.35, beatDur * rhythm[0]);
    MelodyEngine._playMelodyNote(notes[1], t + beatDur * rhythm[0], 0.25, beatDur * rhythm[1]);
  },

  // ── onDeath — called from StateMapper.onDeath (SPEC_020 §4) ────────────────
  // Phase-aware death sequence: different music reflects how far the player got.
  // Returns { fadeDur, silenceFirst } to tell StateMapper how to adjust its fade.
  onDeath: function() {
    if (!this._active || this._deathPlayed) return null;
    if (!audioCtx) return null;
    this._deathPlayed = true;

    var t = audioCtx.currentTime;
    var beatDur = 60 / (G.bpm || 120);
    var phase = G.phase || 'pulse';
    var hasMelody = (typeof MelodyEngine !== 'undefined');

    this._refreshMotifMidi();

    switch (phase) {
      case 'pulse':
        // Quick fade. Single low note. Brief — "barely started."
        // No motif — too early for the theme to matter.
        return { fadeDur: 1.5, silenceFirst: 0 };

      case 'swell':
        // Instruments drop one by one over 3s. Bass last. Gentle.
        // Play first 2 motif notes as a quiet farewell.
        if (hasMelody && this._motifMidi && this._motifMidi.length >= 2) {
          MelodyEngine._playMelodyNote(this._motifMidi[0], t + 0.2, 0.25, beatDur);
          MelodyEngine._playMelodyNote(this._motifMidi[1], t + 0.2 + beatDur, 0.15, beatDur * 1.5);
        }
        // Stagger track fadeouts: hat first, then snare, melody, pad, bass last
        this._deathStaggerFade(t, ['hat', 'snare', 'melody', 'pad', 'bass'], 3.0);
        return { fadeDur: 3.0, silenceFirst: 0 };

      case 'surge':
        // Theme motif plays retrograde. Instruments fade in reverse order of introduction.
        this._playMotifVariation('retrograde', t + 0.3, { volume: 0.35, tempoMult: 2.0 });
        this._deathStaggerFade(t, ['melody', 'perc', 'pad', 'snare', 'hat', 'bass'], 3.0);
        return { fadeDur: 3.0, silenceFirst: 0 };

      case 'storm':
        // Dissonant cluster chord. Resolves to root over 3s. Dramatic.
        this._deathClusterChord(t, beatDur);
        return { fadeDur: 3.5, silenceFirst: 0 };

      case 'maelstrom':
        // Everything freezes for 0.5s silence. Then motif at half speed, solo melody voice.
        // Return to where it started — original key.
        var self = this;
        var tid = setTimeout(function() {
          if (!audioCtx) return;
          var now = audioCtx.currentTime;
          self._refreshMotifMidi();
          self._playMotifVariation('original', now, { volume: 0.4, tempoMult: 2.0 });
        }, 500);
        this._introTimeouts.push(tid);
        return { fadeDur: 4.0, silenceFirst: 0.5 };

      default:
        // Fallback: original retrograde behavior
        this._playMotifVariation('retrograde', t + 0.3, { volume: 0.35, tempoMult: 2.0 });
        return { fadeDur: 2.5, silenceFirst: 0 };
    }
  },

  // Stagger track gain fadeouts for death sequence
  _deathStaggerFade: function(t, trackOrder, totalDur) {
    if (typeof _trackGains === 'undefined') return;
    var step = totalDur / Math.max(trackOrder.length, 1);
    for (var i = 0; i < trackOrder.length; i++) {
      var tg = _trackGains[trackOrder[i]];
      if (!tg) continue;
      var fadeStart = t + i * step;
      var fadeDur = step * 0.8;
      tg.gain.cancelScheduledValues(fadeStart);
      tg.gain.setValueAtTime(tg.gain.value || 1.0, fadeStart);
      tg.gain.linearRampToValueAtTime(0.0001, fadeStart + fadeDur);
    }
  },

  // Storm death: cluster chord (chord tones + chromatic neighbors) resolving to root
  _deathClusterChord: function(t, beatDur) {
    if (typeof HarmonyEngine === 'undefined') return;
    var chord = HarmonyEngine.getCurrentChord();
    if (!chord) return;
    var dest = (typeof _trackGains !== 'undefined' && _trackGains.pad) ? _trackGains.pad : submixGain;
    if (!dest || !audioCtx) return;

    // Chord tones + chromatic neighbors (±1 semitone each)
    var baseMidi = 3 * 12 + chord.rootSemitone;
    var clusterNotes = [];
    var tones = HarmonyEngine.getChordTones(3);
    for (var i = 0; i < tones.length; i++) {
      clusterNotes.push(tones[i]);
      clusterNotes.push(tones[i] + 1);
      clusterNotes.push(tones[i] - 1);
    }

    // Play cluster, then resolve each voice to nearest chord tone over 3s
    var rootFreq = (typeof midiToFreq === 'function') ? midiToFreq(baseMidi) : 220;
    for (var j = 0; j < clusterNotes.length; j++) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(dest);
      osc.type = 'triangle';

      var freq = (typeof midiToFreq === 'function') ? midiToFreq(clusterNotes[j]) : 220;
      osc.frequency.setValueAtTime(freq, t);
      // Resolve toward root over 3s
      osc.frequency.exponentialRampToValueAtTime(rootFreq, t + 3.0);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.linearRampToValueAtTime(0.0001, t + 3.5);
      osc.start(t);
      osc.stop(t + 3.6);
    }
  },

  // ── Instrument Introduction System (SPEC_020 §3) ───────────────────────────

  _clearIntroTimeouts: function() {
    for (var i = 0; i < this._introTimeouts.length; i++) {
      clearTimeout(this._introTimeouts[i]);
    }
    this._introTimeouts = [];
  },

  // Called from StateMapper when a track transitions muted→unmuted for the first time.
  // Schedules gain ramp + introduction figure per instrument.
  onTrackIntro: function(track, beatTime) {
    if (!this._active || !audioCtx) return;
    if (this._introduced[track]) return; // already introduced
    this._introduced[track] = true;

    var t = beatTime || audioCtx.currentTime;
    var beatDur = 60 / (G.bpm || 120);
    var tg = (typeof _trackGains !== 'undefined') ? _trackGains[track] : null;

    // Gain ramp: start silent, fade in over intro duration
    if (tg) {
      var rampBeats = 4;
      if (track === 'pad') rampBeats = 8;
      if (track === 'snare' || track === 'perc') rampBeats = 2;
      tg.gain.cancelScheduledValues(t);
      tg.gain.setValueAtTime(0.0001, t);
      tg.gain.linearRampToValueAtTime(1.0, t + rampBeats * beatDur);
    }

    // Per-instrument introduction figure
    switch (track) {
      case 'bass':
        this._introBassWalkUp(t, beatDur);
        break;
      case 'snare':
        this._introSnareAccent(t, beatDur);
        break;
      // hat: fade-in via gain ramp is the intro (materializing)
      // pad: 8-beat swell via gain ramp + PadTrack's own attack
      // perc: enters naturally during fill (FillSystem triggers at same time)
      // melody: motif solo already handled by onPhaseChange Swell
    }
  },

  // Bass: 4-note walk-up to root over 4 beats before settling into pattern
  _introBassWalkUp: function(t, beatDur) {
    if (typeof HarmonyEngine === 'undefined' || typeof _synthBass !== 'function') return;
    var pal = (typeof Sequencer !== 'undefined' && Sequencer._palette) ? Sequencer._palette : null;
    if (!pal || !pal.bass) return;

    var octave = pal.bass.octave || 2;
    var tones = HarmonyEngine.getChordTones(octave);
    if (!tones || tones.length === 0) return;
    var root = tones[0];

    // Walk up: root-5, root-3, root-1 semitone, root
    var walkNotes = [root - 5, root - 3, root - 1, root];
    var bassGain = (typeof _trackGains !== 'undefined' && _trackGains.bass) ? _trackGains.bass : null;

    for (var i = 0; i < walkNotes.length; i++) {
      var freq = (typeof midiToFreq === 'function') ? midiToFreq(walkNotes[i]) : 440;
      var vel = 0.4 + i * 0.15; // crescendo
      var noteTime = t + i * beatDur;
      // Temporarily boost bass gain for walk-up audibility during ramp
      if (bassGain) {
        bassGain.gain.cancelScheduledValues(noteTime);
        bassGain.gain.setValueAtTime(Math.max(0.3 + i * 0.2, 0.0001), noteTime);
      }
      _synthBass(noteTime, freq, vel,
        pal.bass.filterCutoff, pal.bass.filterResonance, pal.bass.wave);
    }
    // After walk-up, resume normal gain ramp to 1.0
    if (bassGain) {
      var endTime = t + 4 * beatDur;
      bassGain.gain.setValueAtTime(1.0, endTime);
    }
  },

  // Snare: single accent hit, then normal pattern starts next bar
  _introSnareAccent: function(t, beatDur) {
    if (typeof _dispatchDrumSynth !== 'function') return;
    var pal = (typeof Sequencer !== 'undefined' && Sequencer._palette) ? Sequencer._palette : null;
    if (!pal || !pal.drums || !pal.drums.snare) return;
    // Single accent on beat 2 (one beat after unmute)
    _dispatchDrumSynth('snare', t + beatDur, 0.9, pal.drums.snare);
  },

  // ── Re-entry rebuild (SPEC_020 §3) ────────────────────────────────────────
  // Called when hit-strip ends. Ramps track gains from 0→1 over 2 beats.
  onReentry: function(beatTime) {
    if (!this._active || !audioCtx) return;
    var t = beatTime || audioCtx.currentTime;
    var beatDur = 60 / (G.bpm || 120);
    var rampDur = 2 * beatDur;
    this._reentryUntil = G.beatCount + 2;

    var tracks = ['hat', 'snare', 'bass', 'pad', 'perc', 'melody'];
    for (var i = 0; i < tracks.length; i++) {
      var tg = (typeof _trackGains !== 'undefined') ? _trackGains[tracks[i]] : null;
      if (!tg) continue;
      // Only ramp tracks that are about to be unmuted
      var floor = CFG.PHASE_FLOOR[G.phase] || CFG.PHASE_FLOOR.pulse;
      var thresh = CFG.INTENSITY_LAYER_THRESHOLDS;
      var inFloor = !!floor[tracks[i]];
      var intensityUnlocked = G.intensity >= (thresh[tracks[i]] || Infinity);
      if (inFloor || intensityUnlocked) {
        tg.gain.cancelScheduledValues(t);
        tg.gain.setValueAtTime(0.0001, t);
        tg.gain.linearRampToValueAtTime(1.0, t + rampDur);
      }
    }
  },

  // ── Exit Figures (SPEC_020 §3 — hit-strip departure) ──────────────────────
  // Called from StateMapper.onHit before tracks are muted.
  playExitFigures: function(beatTime) {
    if (!this._active || !audioCtx) return;
    var t = beatTime || audioCtx.currentTime;
    var beatDur = 60 / (G.bpm || 120);
    var m = (typeof Sequencer !== 'undefined') ? Sequencer._mute : null;
    if (!m) return;
    var floor = CFG.PHASE_FLOOR[G.phase] || CFG.PHASE_FLOOR.pulse;

    // Only play exit for tracks that are currently unmuted and will be muted
    // Bass exit: bend down a semitone
    if (!m.bass && !floor.bass) {
      this._exitBassBend(t, beatDur);
    }
    // Hat exit: open hat (extended decay)
    if (!m.hat && !floor.hat) {
      this._exitHatOpen(t);
    }
    // Pad: already handled by PadTrack._fadeOutVoices()
  },

  // Bass: final note bends down a semitone
  _exitBassBend: function(t, beatDur) {
    if (typeof _synthBass !== 'function') return;
    var pal = (typeof Sequencer !== 'undefined' && Sequencer._palette) ? Sequencer._palette : null;
    if (!pal || !pal.bass) return;
    if (typeof HarmonyEngine === 'undefined') return;
    var tones = HarmonyEngine.getChordTones(pal.bass.octave || 2);
    if (!tones || tones.length === 0) return;

    // Play root, then bend down (use bass track gain which will be fading)
    var rootFreq = (typeof midiToFreq === 'function') ? midiToFreq(tones[0]) : 110;
    var bentFreq = rootFreq * 0.9439; // down 1 semitone
    // Create the bent bass note directly
    if (!audioCtx) return;
    var dest = (typeof _trackGains !== 'undefined' && _trackGains.bass) ? _trackGains.bass : submixGain;
    if (!dest) return;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(dest);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(rootFreq, t);
    osc.frequency.exponentialRampToValueAtTime(bentFreq, t + beatDur * 0.5);
    gain.gain.setValueAtTime(0.3 * CFG.GAIN.bass, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + beatDur * 0.6);
    osc.start(t);
    osc.stop(t + beatDur * 0.7);
  },

  // Hat: extended decay open hat sound
  _exitHatOpen: function(t) {
    if (typeof _dispatchDrumSynth !== 'function') return;
    var pal = (typeof Sequencer !== 'undefined' && Sequencer._palette) ? Sequencer._palette : null;
    if (!pal || !pal.drums || !pal.drums.hat) return;
    // Play an open hat (high vel, the synth naturally decays longer at higher vel)
    _dispatchDrumSynth('hat', t, 1.0, pal.drums.hat);
  },

  // ── Expose motif for MelodyEngine phrase seeding ───────────────────────────
  // Returns current motif degrees for MelodyEngine to use as phrase source material
  getMotifDegrees: function() {
    return this._motif ? this._motif.degrees.slice() : null;
  },

  getMotifMidi: function() {
    if (!this._motifMidi) this._refreshMotifMidi();
    return this._motifMidi ? this._motifMidi.slice() : null;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // STREAK MILESTONES (SPEC_020 §5) — narrative-level graze streak rewards
  // Milestones at 3/5/8/12/20+. Reset on hit via resetStreakMilestones().
  // ══════════════════════════════════════════════════════════════════════════

  _streakMilestonesHit: {},   // { 3: true, 5: true, ... } per-run
  _streakOctaveShiftActive: false,
  _streakUnison: false,       // true when next-downbeat unison is armed

  resetStreakMilestones: function() {
    this._streakMilestonesHit = {};
    // Restore voice pool octave if shifted
    if (this._streakOctaveShiftActive) {
      this._streakOctaveShiftActive = false;
      this._restoreVoiceOctave();
    }
    this._streakUnison = false;
  },

  // Called from StateMapper.registerNearMiss
  onGrazeStreak: function(streak) {
    if (!this._active || !audioCtx) return;
    var t = audioCtx.currentTime;
    var beatDur = 60 / G.bpm;

    // Streak 3: rising 3-note figure (confirmation)
    if (streak >= 3 && !this._streakMilestonesHit[3]) {
      this._streakMilestonesHit[3] = true;
      this._playRisingFigure(t, beatDur);
    }

    // Streak 5: voice pool shifts up an octave (brightening)
    if (streak >= 5 && !this._streakMilestonesHit[5]) {
      this._streakMilestonesHit[5] = true;
      this._shiftVoiceOctave(12); // +12 semitones = 1 octave
      this._streakOctaveShiftActive = true;
    }

    // Streak 8: bass fill figure (celebration)
    if (streak >= 8 && !this._streakMilestonesHit[8]) {
      this._streakMilestonesHit[8] = true;
      this._playBassCelebration(t, beatDur);
    }

    // Streak 12: arm unison hit on next downbeat (punctuation)
    if (streak >= 12 && !this._streakMilestonesHit[12]) {
      this._streakMilestonesHit[12] = true;
      this._streakUnison = true; // consumed in onBeat → _fireStreakUnison
    }

    // Streak 20+: motif transposed up a 4th (triumph)
    if (streak >= 20 && !this._streakMilestonesHit[20]) {
      this._streakMilestonesHit[20] = true;
      this._playStreakMotif(t, beatDur);
    }
  },

  // Streak 3: rising 3-note melody figure
  _playRisingFigure: function(t, beatDur) {
    if (typeof MelodyEngine === 'undefined' || typeof HarmonyEngine === 'undefined') return;
    var tones = HarmonyEngine.getChordTones(5);
    if (!tones || tones.length < 3) return;
    // Pick root, 3rd, 5th ascending
    var dur = beatDur * 0.2;
    var gain = 0.45;
    for (var i = 0; i < 3; i++) {
      MelodyEngine._playMelodyNote(tones[i], t + i * dur, gain, dur * 0.8);
    }
  },

  // Streak 5: shift active voice pool up 12 semitones
  _shiftVoiceOctave: function(semitones) {
    if (typeof VoicePool === 'undefined') return;
    var pool = VoicePool._pool;
    for (var i = 0; i < pool.length; i++) {
      var v = pool[i];
      if (v.active && v.osc) {
        try {
          v.osc.detune.setTargetAtTime(semitones * 100, audioCtx.currentTime, 0.05);
        } catch(e) {}
      }
    }
    // Store shift so new spawns also get it
    VoicePool._streakDetune = semitones * 100;
  },

  _restoreVoiceOctave: function() {
    if (typeof VoicePool === 'undefined') return;
    var pool = VoicePool._pool;
    for (var i = 0; i < pool.length; i++) {
      var v = pool[i];
      if (v.active && v.osc) {
        try {
          v.osc.detune.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        } catch(e) {}
      }
    }
    VoicePool._streakDetune = 0;
  },

  // Streak 8: bass celebration fill — root→5th→octave→5th descending
  _playBassCelebration: function(t, beatDur) {
    if (!audioCtx || typeof HarmonyEngine === 'undefined') return;
    var tones = HarmonyEngine.getChordTones(2); // octave 2 for bass
    if (!tones || tones.length < 2) return;
    var root = tones[0];
    var fifth = tones.length >= 2 ? tones[1] : root + 7;
    var notes = [root, fifth, root + 12, fifth];
    var stepDur = beatDur * 0.2;
    var gain = CFG.GAIN.bass_fill || 0.12;
    for (var i = 0; i < notes.length; i++) {
      var freq = (typeof midiToFreq === 'function') ? midiToFreq(notes[i]) : 65.4;
      var osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      var filt = audioCtx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 800;
      var env = audioCtx.createGain();
      var noteStart = t + i * stepDur;
      env.gain.setValueAtTime(0.0001, noteStart);
      env.gain.linearRampToValueAtTime(gain, noteStart + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, noteStart + stepDur - 0.01);
      osc.connect(filt);
      filt.connect(env);
      env.connect(_trackGains.bass || submixGain);
      osc.start(noteStart);
      osc.stop(noteStart + stepDur + 0.02);
    }
  },

  // Streak 12: unison hit — all instruments sync on next downbeat
  _fireStreakUnison: function(beatTime) {
    if (!audioCtx) return;
    var t = beatTime;
    var beatDur = 60 / G.bpm;

    // Short 0.05s silence (micro-gap for dramatic effect)
    // Then all drums fire simultaneously with accent velocity
    if (typeof Sequencer !== 'undefined' && Sequencer._palette) {
      var d = Sequencer._palette.drums;
      _dispatchDrumSynth('kick', t + 0.05, 1.0, d.kick);
      _dispatchDrumSynth('snare', t + 0.05, 0.9, d.snare);
      _dispatchDrumSynth('hat', t + 0.05, 0.8, d.hat);
    }

    // Bass root note accent
    if (typeof HarmonyEngine !== 'undefined') {
      var tones = HarmonyEngine.getChordTones(2);
      if (tones && tones.length > 0) {
        var freq = (typeof midiToFreq === 'function') ? midiToFreq(tones[0]) : 65.4;
        var osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        var env = audioCtx.createGain();
        env.gain.setValueAtTime(0.15, t + 0.05);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + beatDur * 0.5);
        osc.connect(env);
        env.connect(_trackGains.bass || submixGain);
        osc.start(t + 0.05);
        osc.stop(t + 0.05 + beatDur * 0.6);
      }
    }

    // Pad chord stab
    if (typeof PadTrack !== 'undefined' && !Sequencer._mute.pad) {
      PadTrack.tick(t + 0.05);
    }
  },

  // Streak 20+: motif transposed up a perfect 4th (5 semitones)
  _playStreakMotif: function(t, beatDur) {
    if (!this._motifMidi) this._refreshMotifMidi();
    if (!this._motifMidi) return;
    // Transpose up a 4th (5 semitones)
    var transposed = [];
    for (var i = 0; i < this._motifMidi.length; i++) {
      transposed.push(this._motifMidi[i] + 5);
    }
    var rhythm = this._motif.rhythm;
    for (var j = 0; j < transposed.length; j++) {
      var dur = beatDur * (rhythm[j] || 1.0);
      if (typeof MelodyEngine !== 'undefined') {
        MelodyEngine._playMelodyNote(transposed[j], t, 0.65, dur);
      }
      t += dur;
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DELIBERATE SILENCE (SPEC_020 §8) — dramatic pauses in the arrangement
  // ══════════════════════════════════════════════════════════════════════════

  _silenceState: null,  // { type, endBeat } when a silence is active
  _firstHitSilenced: false,
  _intensity50Silenced: false,
  _prePhaseDropBeat: 0,

  // Check & schedule silence on beat (called from onBeat)
  _checkSilenceMoments: function(beatTime) {
    var beatDur = 60 / G.bpm;

    // Active silence: restore when endBeat reached
    if (this._silenceState && G.beatCount >= this._silenceState.endBeat) {
      this._endSilence(beatTime);
    }

    // Intensity 50: 2-beat drum cut, pad sustains (SPEC_020 §8)
    if (G.intensity === 50 && !this._intensity50Silenced) {
      this._intensity50Silenced = true;
      this._beginSilence('intensity_50', G.beatCount + 2, beatTime);
    }

    // Streak 12 unison: fire on downbeat if armed
    if (this._streakUnison && G.beatCount % 4 === 0) {
      this._streakUnison = false;
      this._fireStreakUnison(beatTime);
    }
  },

  // Phase transition silence: 1-beat full stop (called from onPhaseChange)
  schedulePhaseTransitionSilence: function(beatTime) {
    this._beginSilence('phase_pause', G.beatCount + 1, beatTime);
  },

  // Pre-phase tension: snare+hat drop 4 beats before phase transition
  // Called from StateMapper.update when approaching phase threshold
  schedulePrePhaseTension: function(beatTime) {
    if (this._prePhaseDropBeat > 0 && G.beatCount < this._prePhaseDropBeat + 4) return; // already active
    this._prePhaseDropBeat = G.beatCount;
    this._beginSilence('pre_phase', G.beatCount + 4, beatTime);
  },

  // First hit in a run: 1-beat bass+drum cut (called from onHit)
  scheduleFirstHitSilence: function(beatTime) {
    if (this._firstHitSilenced) return;
    this._firstHitSilenced = true;
    this._beginSilence('first_hit', G.beatCount + 1, beatTime);
  },

  // Maelstrom intimate moment: 4 beats everything except motif at half volume
  scheduleMaelstromIntimacy: function(beatTime) {
    this._beginSilence('maelstrom_intimate', G.beatCount + 4, beatTime);
  },

  _beginSilence: function(type, endBeat, beatTime) {
    if (this._silenceState) return; // don't stack silences
    this._silenceState = { type: type, endBeat: endBeat };

    if (typeof Sequencer === 'undefined' || !audioCtx) return;
    var t = beatTime || audioCtx.currentTime;

    switch (type) {
      case 'phase_pause':
        // Full stop: all track gains → 0 for 1 beat
        this._duckAllTracks(t, 0.01);
        break;

      case 'combo_50':
        // Drums cut, pad sustains alone
        this._duckTracks(['kick', 'snare', 'hat', 'perc'], t, 0.01);
        break;

      case 'first_hit':
        // Bass + drums cut for 1 beat (shock)
        this._duckTracks(['kick', 'snare', 'hat', 'bass', 'perc'], t, 0.01);
        break;

      case 'maelstrom_intimate':
        // Everything to half volume except melody (motif plays through)
        this._duckTracks(['kick', 'snare', 'hat', 'bass', 'pad', 'perc'], t, 0.5);
        break;

      case 'pre_phase':
        // Snare + hat drop out
        this._duckTracks(['snare', 'hat'], t, 0.01);
        break;
    }
  },

  _endSilence: function(beatTime) {
    if (!this._silenceState || typeof Sequencer === 'undefined' || !audioCtx) {
      this._silenceState = null;
      return;
    }
    var t = beatTime || audioCtx.currentTime;
    var type = this._silenceState.type;
    this._silenceState = null;

    // Restore all track gains over 0.5 beats
    var rampTime = (60 / G.bpm) * 0.5;
    var tracks = ['kick', 'snare', 'hat', 'bass', 'pad', 'perc', 'melody'];
    for (var i = 0; i < tracks.length; i++) {
      var g = _trackGains[tracks[i]];
      if (g) {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(1.0, t, rampTime * 0.3);
      }
    }
  },

  // Duck specific tracks to a target gain
  _duckTracks: function(trackNames, t, targetGain) {
    for (var i = 0; i < trackNames.length; i++) {
      var g = _trackGains[trackNames[i]];
      if (g) {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(targetGain, t, 0.02);
      }
    }
  },

  // Duck all tracks
  _duckAllTracks: function(t, targetGain) {
    var tracks = ['kick', 'snare', 'hat', 'bass', 'pad', 'perc', 'melody'];
    this._duckTracks(tracks, t, targetGain);
  },

  // ── Shutdown ───────────────────────────────────────────────────────────────
  shutdown: function() {
    this._active = false;
    this._motif = null;
    this._motifMidi = null;
    this._palette = null;
    this._introduced = {};
    this._reentryUntil = 0;
    this._streakMilestonesHit = {};
    this._streakOctaveShiftActive = false;
    this._streakUnison = false;
    this._silenceState = null;
    this._firstHitSilenced = false;
    this._intensity50Silenced = false;
    this._prePhaseDropBeat = 0;
    if (this._canonVoiceTimeout) {
      clearTimeout(this._canonVoiceTimeout);
      this._canonVoiceTimeout = null;
    }
    this._clearIntroTimeouts();
  }
};
