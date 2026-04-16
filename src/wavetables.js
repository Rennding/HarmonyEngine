// ── 03e_wavetables.js — Wavetable library (SPEC_016 §1) ──────────────────────
// Builds PeriodicWave objects from harmonic recipes.  Each palette × role
// combination gets a unique timbre.  Waves are lazily built on first request
// and cached for the run.
//
// Roles: kick, bass, snare, perc, pad, voice, melody
// Palettes: dark_techno, synthwave, glitch, ambient_dread, lo_fi_chill, chiptune

var Wavetables = (function() {
  'use strict';

  var _cache = {};  // key = 'paletteName:role' → PeriodicWave

  // ── Harmonic recipes ──────────────────────────────────────────────────────
  // Each recipe = { real: [...], imag: [...] }
  // Index 0 = DC offset (always 0), index 1 = fundamental, 2 = 2nd harmonic…
  // Amplitudes normalized — the Web Audio API normalizes PeriodicWave by default.

  // Helper: generate a recipe from a compact descriptor
  function _harmonics(partials) {
    // partials = array of [harmonicNumber, amplitude] pairs
    var maxN = 0;
    for (var i = 0; i < partials.length; i++) {
      if (partials[i][0] > maxN) maxN = partials[i][0];
    }
    var real = new Float32Array(maxN + 1);
    var imag = new Float32Array(maxN + 1);
    real[0] = 0; imag[0] = 0;
    for (var j = 0; j < partials.length; j++) {
      imag[partials[j][0]] = partials[j][1];
    }
    return { real: real, imag: imag };
  }

  // Helper: thick saw (all harmonics with 1/n rolloff, configurable brightness)
  function _thickSaw(nPartials, brightnessExp) {
    var p = [];
    var exp = brightnessExp || 1.0;
    for (var n = 1; n <= nPartials; n++) {
      p.push([n, Math.pow(1.0 / n, exp)]);
    }
    return _harmonics(p);
  }

  // Helper: hollow wave (odd harmonics only — square-ish)
  function _hollow(nPartials, rolloff) {
    var p = [];
    var ro = rolloff || 1.0;
    for (var n = 1; n <= nPartials; n += 2) {
      p.push([n, Math.pow(1.0 / n, ro)]);
    }
    return _harmonics(p);
  }

  // Helper: organ-like (select harmonics with drawbar amplitudes)
  function _organ(drawbars) {
    // drawbars = object { harmonicN: amplitude }
    var p = [];
    for (var h in drawbars) {
      if (drawbars.hasOwnProperty(h)) {
        p.push([parseInt(h, 10), drawbars[h]]);
      }
    }
    return _harmonics(p);
  }

  // Helper: pulse wave (NES-style, duty cycle 0–1; 0.5 = square, 0.25 = 25%, 0.125 = 12.5%)
  function _pulse(duty, nPartials) {
    // Fourier series for a pulse wave with given duty cycle:
    // b_n = (2 / (n * pi)) * sin(n * pi * duty)
    var p = [];
    var n = nPartials || 32;
    for (var k = 1; k <= n; k++) {
      var amp = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      if (Math.abs(amp) > 0.001) p.push([k, Math.abs(amp)]);
    }
    return _harmonics(p);
  }

  // ── Per-palette × role recipes ────────────────────────────────────────────

  var RECIPES = {
    // ── dark_techno ─────────────────────────────────────────────────────────
    dark_techno: {
      kick:   _harmonics([[1, 1.0], [2, 0.5], [3, 0.1]]),           // sub-heavy, tight
      bass:   _thickSaw(24, 0.85),                                    // bright aggressive saw
      snare:  _harmonics([[1, 0.3], [3, 0.5], [5, 0.7], [7, 0.9], [9, 0.6], [11, 0.4]]),  // metallic odd partials
      perc:   _harmonics([[1, 0.8], [4, 0.6], [7, 0.4], [11, 0.3]]), // bell-like inharmonic
      pad:    _hollow(16, 1.2),                                        // dark hollow pad
      voice:_thickSaw(12, 0.9),                                     // buzzy but not piercing
      melody: _harmonics([[1, 1.0], [3, 0.7], [5, 0.4]]),             // acid lead — resonant nasal, strong odd partials
      perk:   _hollow(12, 0.8),                                        // detuned square — industrial, cold (SPEC_025 §3.2)
    },

    // ── synthwave ───────────────────────────────────────────────────────────
    synthwave: {
      kick:   _harmonics([[1, 1.0], [2, 0.3]]),                       // round sub kick
      bass:   _thickSaw(20, 1.0),                                     // classic analog saw
      snare:  _harmonics([[1, 0.2], [2, 0.4], [4, 0.6], [6, 0.5], [8, 0.3]]),  // snappy even partials
      perc:   _organ({1: 0.9, 3: 0.5, 5: 0.3}),                     // mellow triangle-ish
      pad:    _thickSaw(12, 1.4),                                     // warm saw pad (rolled off)
      voice:_hollow(10, 0.8),                                       // square-ish chiptune feel
      melody: _thickSaw(8, 1.0),                                      // analog mono lead — warm, fewer harmonics than pad
      perk:   _pulse(0.25, 16),                                        // warm pulse — analog character (SPEC_025 §3.2)
    },

    // ── glitch ──────────────────────────────────────────────────────────────
    glitch: {
      kick:   _harmonics([[1, 1.0], [2, 0.7], [4, 0.3], [8, 0.15]]), // punchy, distorted character
      bass:   _hollow(20, 0.7),                                        // aggressive hollow square
      snare:  _harmonics([[1, 0.2], [3, 0.3], [5, 0.5], [7, 0.7], [9, 0.8], [13, 0.6], [17, 0.4]]),  // harsh metallic
      perc:   _harmonics([[1, 0.5], [5, 0.8], [9, 0.6], [13, 0.7]]), // inharmonic, noisy character
      pad:    _harmonics([[1, 0.6], [2, 0.3], [5, 0.5], [7, 0.4], [11, 0.3]]),  // dissonant partials
      voice:_thickSaw(16, 0.7),                                     // very bright, aggressive
      melody: _harmonics([[1, 1.0], [2, 0.15], [6, 0.2]]),             // bitcrushed sine — digital, clean core + faint upper partial
      perk:   _harmonics([[1, 0.6], [3, 0.4], [5, 0.8], [7, 0.3]]),  // formant-ish — digital, vocal (SPEC_025 §3.2)
    },

    // ── ambient_dread ───────────────────────────────────────────────────────
    ambient_dread: {
      kick:   _harmonics([[1, 1.0], [2, 0.15]]),                      // deep, almost pure sine
      bass:   _harmonics([[1, 1.0], [2, 0.2], [3, 0.05]]),           // near-sine, subby
      snare:  _harmonics([[1, 0.1], [2, 0.2], [5, 0.4], [7, 0.3], [11, 0.2]]),  // ghostly, breathy
      perc:   _organ({1: 0.7, 2: 0.3, 4: 0.2}),                     // soft, glass-like
      pad:    _harmonics([[1, 1.0], [2, 0.4], [3, 0.15], [5, 0.08]]), // warm sine-ish
      voice:_harmonics([[1, 1.0], [3, 0.2], [5, 0.05]]),           // pure, eerie
      melody: _harmonics([[1, 1.0], [3, 0.08]]),                      // bowed glass — near-sine, very faint 3rd partial
      perk:   _harmonics([[1, 1.0], [2, 0.08]]),                      // pure sine + sub — ethereal (SPEC_025 §3.2)
    },

    // ── lo_fi_chill (SPEC_019 §1.1) ────────────────────────────────────────
    lo_fi_chill: {
      kick:   _harmonics([[1, 1.0], [2, 0.25]]),                      // soft, boomy — near-sine with warm 2nd
      bass:   _harmonics([[1, 1.0], [2, 0.3], [3, 0.08]]),           // warm sine with gentle harmonics
      snare:  _harmonics([[1, 0.15], [2, 0.25], [4, 0.35], [6, 0.25], [8, 0.15]]),  // brushy, mellow even harmonics
      perc:   _organ({1: 0.6, 3: 0.3, 5: 0.15}),                    // soft triangle-ish, vinyl crackle sim
      pad:    _harmonics([[1, 1.0], [2, 0.4], [3, 0.15], [4.54, 0.08]]),  // rhodes-like: sine + bell partial at ~4.54×
      voice:_harmonics([[1, 1.0], [2, 0.1]]),                       // mellow sine, gentle
      melody: _harmonics([[1, 1.0], [2, 0.4], [3, 0.15], [5, 0.08]]),  // rhodes bell — same partials as pad, emphasize bell character
      perk:   _harmonics([[1, 1.0], [2, 0.3], [3, 0.08]]),            // rounded triangle — mellow, vinyl (SPEC_025 §3.2)
    },

    // ── chiptune (SPEC_019 §1.3) ──────────────────────────────────────────
    chiptune: {
      kick:   _harmonics([[1, 1.0], [2, 0.15]]),                      // pure sine thump — NES DPCM-style
      bass:   _pulse(0.25, 24),                                        // 25% pulse wave — classic NES bass
      snare:  _pulse(0.5, 16),                                        // 50% square — noise burst approximation
      perc:   _pulse(0.125, 20),                                       // 12.5% pulse — thin, piercing
      pad:    _pulse(0.5, 12),                                         // 50% square — hollow chiptune pad
      voice:_pulse(0.125, 16),                                       // 12.5% pulse — classic SFX territory
      melody: _pulse(0.125, 20),                                       // 12.5% pulse — thin, cutting NES lead channel
      perk:   _pulse(0.25, 16),                                        // 25% pulse — NES lead (SPEC_025 §3.2)
    },

    // ── noir_jazz (SPEC_019 §1.4) ─────────────────────────────────────────
    noir_jazz: {
      kick:   _harmonics([[1, 1.0], [2, 0.12]]),                      // very soft sine — brush-kick feel
      bass:   _harmonics([[1, 1.0], [3, 0.25], [5, 0.06]]),           // upright bass: sine + 3rd harmonic body
      snare:  _harmonics([[1, 0.1], [2, 0.2], [3, 0.3], [5, 0.4], [7, 0.2]]),  // breathy brush sweep
      perc:   _harmonics([[1, 0.5], [5.4, 0.3], [8.2, 0.15]]),       // brush on snare head — inharmonic
      pad:    _harmonics([[1, 1.0], [5.4, 0.2], [11, 0.05]]),         // vibraphone-like: sine + inharmonic partial
      voice:_harmonics([[1, 1.0], [2, 0.15], [3, 0.05]]),           // warm, muted trumpet-like
      melody: _harmonics([[1, 1.0], [2, 0.5], [3, 0.2]]),             // muted trumpet / flute — odd-partial rolloff, breathy
      perk:   _hollow(10, 1.0),                                        // hollow odd harmonics — muted trumpet (SPEC_025 §3.2)
    },

    // ── industrial (SPEC_019 §1.2) ─────────────────────────────────────────
    industrial: {
      kick:   _harmonics([[1, 1.0], [2, 0.7], [3, 0.4], [5, 0.2]]),  // distorted, harmonically rich
      bass:   _thickSaw(28, 0.6),                                      // aggressive, FM-like growl
      snare:  _harmonics([[1, 0.3], [2, 0.5], [4, 0.7], [6, 0.8], [8, 0.6], [12, 0.4]]),  // metallic clang
      perc:   _harmonics([[1, 0.4], [3, 0.6], [7, 0.8], [11, 0.5], [15, 0.3]]),  // anvil hits — dense odd partials
      pad:    _thickSaw(16, 0.8),                                      // harsh saw pad
      voice:_thickSaw(20, 0.7),                                     // aggressive, cutting
      melody: _hollow(12, 0.7),                                        // detuned square — aggressive, tighter than pad
      perk:   _thickSaw(16, 0.6),                                     // harsh saw — distorted, aggressive (SPEC_025 §3.2)
    },

    // ── vaporwave (SPEC_019 §1.5) ──────────────────────────────────────────
    vaporwave: {
      kick:   _harmonics([[1, 1.0], [2, 0.2]]),                        // deep sub boom, near-sine
      bass:   _harmonics([[1, 1.0], [2, 0.35], [3, 0.1]]),            // detuned sub: warm with chorused character
      snare:  _harmonics([[1, 0.15], [2, 0.3], [4, 0.4], [6, 0.3], [8, 0.15]]),  // soft, muted snare
      perc:   _organ({1: 0.5, 3: 0.25, 5: 0.12}),                    // mellow, glassy
      pad:    _thickSaw(20, 1.6),                                      // lush supersaw — many partials, rolled off for shimmer
      voice:_harmonics([[1, 1.0], [2, 0.15], [3, 0.05]]),           // warm, dreamy sine
      melody: _harmonics([[1, 1.0], [3, 0.3], [5, 0.15]]),            // detuned FM bell — dreamy, FM piano character
      perk:   _thickSaw(20, 1.4),                                     // thick detuned saw — dreamy (SPEC_025 §3.2)
    },

    // ── breakbeat (SPEC_019 §1.6) ──────────────────────────────────────────
    breakbeat: {
      kick:   _harmonics([[1, 1.0], [2, 0.6], [3, 0.25], [4, 0.1]]), // punchy, presence in mids
      bass:   _thickSaw(24, 0.7),                                      // Reese bass: FM-modulated saw growl
      snare:  _harmonics([[1, 0.25], [3, 0.45], [5, 0.6], [7, 0.5], [9, 0.35], [13, 0.2]]),  // crispy, snappy — amen-like
      perc:   _harmonics([[1, 0.5], [4, 0.7], [7, 0.5], [11, 0.3]]), // metallic percussion
      pad:    _thickSaw(14, 0.9),                                      // dark, edgy pad
      voice:_thickSaw(16, 0.8),                                     // aggressive, biting
      melody: _thickSaw(10, 0.8),                                     // hoover / reese lead — mid-weight saw, darker than pad
      perk:   _hollow(14, 0.7),                                        // bright square — jungle stab (SPEC_025 §3.2)
    },
  };

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    /**
     * Get (or build+cache) a PeriodicWave for the given palette + role.
     * @param {string} paletteName - e.g. 'dark_techno'
     * @param {string} role        - 'kick'|'bass'|'snare'|'perc'|'pad'|'voice'|'melody'|'perk'
     * @returns {PeriodicWave|null}
     */
    get: function(paletteName, role) {
      if (!audioCtx) return null;
      var key = paletteName + ':' + role;
      if (_cache[key]) return _cache[key];

      var paletteRecipes = RECIPES[paletteName];
      if (!paletteRecipes) return null;
      var recipe = paletteRecipes[role];
      if (!recipe) return null;

      var wave = audioCtx.createPeriodicWave(recipe.real, recipe.imag);
      _cache[key] = wave;
      return wave;
    },

    /**
     * Clear the cache (call on run reset / palette change).
     */
    clearCache: function() {
      _cache = {};
    },

    /**
     * Check if a palette has wavetable recipes.
     * @param {string} paletteName
     * @returns {boolean}
     */
    has: function(paletteName) {
      return !!RECIPES[paletteName];
    },
  };
})();
