# SPEC_028 — Per-Palette Storm/Maelstrom Personality

**Issue:** #28 — Per-palette high-phase instrument behavior
**Model:** Opus (judgment — timbre choices, genre-appropriate bass behavior, mix balance tuning)
**Status:** Draft

---

## 1 · Problem

At Storm and Maelstrom, the WalkingBass engine activates tier 3–4 (stepwise scale motion, chromatic approach) identically across all 10 palettes. The bass timbre changes per palette (wavetables), but the **musical behavior, gain, and filtering are palette-agnostic**. This creates two problems:

1. **Genre mismatch.** Chiptune bass "walking" like a jazz upright doesn't sound like chiptune — it sounds like jazz played through a square wave. Ambient_dread bass doing chromatic approaches sounds frantic, not dread-like.

2. **Mix overwhelm.** Gain is a flat `CFG.GAIN.bass = 0.20` for all palettes. Chiptune's 25% pulse wave (bright, harmonically rich, cuts through everything) hits the mix at the same volume as ambient_dread's near-sine. At Storm/Maelstrom intensity levels (40+), track gain ramps to ~0.95, and aggressive timbres dominate the mix.

The result: Storm/Maelstrom sounds "the same" across palettes — the WalkingBass overrides genre identity exactly when the music should be at peak distinctiveness.

---

## 2 · Mental model

Each palette already defines its own drums, chord progressions, melody rhythm, stagger timing, effects, and voicing. The bass track is the last major element with **no per-palette behavioral tuning** at high intensity.

The fix adds three per-palette knobs to the existing `bass` section in each PALETTES entry:

1. **Tier cap** — which WalkingBass tiers this palette is allowed to reach
2. **Gain scalar** — multiplier on `CFG.GAIN.bass` for this palette (tame bright timbres, boost subby ones)
3. **Phase filter envelope** — per-phase lowpass cutoff to control spectral buildup at Storm/Maelstrom

Think of it as: the palette already tells the bass **what to sound like** (wavetable) — now it also tells the bass **how to behave** (tier cap), **how loud to be** (gain scalar), and **how bright to get** (filter envelope).

---

## 3 · Per-palette bass profiles

### 3.1 New fields in `PALETTES[n].bass`

```js
bass: {
  // existing fields unchanged:
  wave, octave, patterns, filterCutoff, filterResonance,

  // NEW:
  tierCap: 4,           // max WalkingBass tier (0–4). Default 4 if omitted.
  gainScalar: 1.0,      // multiplier on CFG.GAIN.bass. Default 1.0 if omitted.
  phaseFilter: {        // per-phase lowpass cutoff (Hz). null = use existing filterCutoff.
    pulse: null,
    swell: null,
    surge: null,
    storm: null,
    maelstrom: null,
  },
}
```

### 3.2 Palette-by-palette tuning

| Palette | tierCap | gainScalar | Storm filter | Maelstrom filter | Rationale |
|---|---|---|---|---|---|
| **dark_techno** | 2 | 1.0 | 500 | 600 | Repetitive root pulses, not melodic walking. Let FM modulation carry the interest. |
| **synthwave** | 3 | 1.1 | 700 | 800 | Gentle walking OK (80s bass runs), boost slightly to fill sub. |
| **glitch** | 2 | 0.85 | 350 | 400 | Stutter and root lock, not smooth walking. Tame the resonant square. |
| **ambient_dread** | 1 | 1.2 | 180 | 200 | Root + 5th drone only. Boost sub sine to fill the space. Heavy LPF — bass should be felt, not heard. |
| **lo_fi_chill** | 2 | 1.1 | 350 | 400 | Chord tones OK, no chromatic approach. Warm and round. |
| **chiptune** | 2 | 0.7 | 600 | 700 | Root + octave bounce + chord tones max. The 25% pulse is brutally bright — cut gain 30%. NES basses didn't walk. |
| **noir_jazz** | 4 | 1.0 | 600 | 700 | Full walking bass — this is the one genre where it belongs. Keep it musical. |
| **industrial** | 2 | 0.9 | 300 | 350 | Repetitive root stutter. Industrial bass = low and relentless, not melodic. Tighten filter. |
| **vaporwave** | 1 | 1.15 | 220 | 250 | Drone root only. Dreamy sub — heavy filtering, slight boost. |
| **breakbeat** | 3 | 0.95 | 400 | 500 | Walking OK (jungle/DnB bass runs), but slightly tamed. |

### 3.3 Design principles behind tuning

- **Noir_jazz is the only tier-4 palette.** Chromatic approach is a jazz idiom. Everywhere else, it sounds wrong.
- **Aggressive timbres get gain cuts.** Chiptune pulse and industrial saw cut through the mix harder per-dB than ambient sine — scalar compensates.
- **Gentle palettes get gain boosts.** Ambient_dread and vaporwave have near-sine bass that disappears in a dense Storm mix — boost keeps them present.
- **Phase filter narrows spectrum at density peaks.** Storm/Maelstrom already have drums, pad, melody, polyrhythms all active — bass doesn't need to be bright. The filter trades brightness for headroom.

---

## 4 · WalkingBass tier cap implementation

### 4.1 Where: `WalkingBass._tier()` in sequencer.js

Current code returns tier 0–4 based purely on intensity thresholds. Add a cap parameter:

```js
_tier: function(intensity, cap) {
  var raw;
  if (intensity >= 50) raw = 4;
  else if (intensity >= 35) raw = 3;
  else if (intensity >= 20) raw = 2;
  else if (intensity >= 10) raw = 1;
  else raw = 0;
  return (typeof cap === 'number') ? Math.min(raw, cap) : raw;
},
```

### 4.2 Where: `WalkingBass.getNote()` in sequencer.js

Pass the palette's `tierCap` to `_tier()`:

```js
var tierCap = (this._palette && this._palette.bass) ? this._palette.bass.tierCap : undefined;
var tier = this._tier(intensity, tierCap);
```

### 4.3 Where: `WalkingBass.initRun()` in sequencer.js

Already receives the palette object — no changes needed. `_palette` stores the full palette, so `.bass.tierCap` is accessible.

---

## 5 · Gain scalar implementation

### 5.1 Where: `_synthBass()` in sequencer.js

Current line: `gain.gain.setValueAtTime(vel * CFG.GAIN.bass, t);`

After change:
```js
var scalar = (_activePalette && _activePalette.bass && typeof _activePalette.bass.gainScalar === 'number')
  ? _activePalette.bass.gainScalar : 1.0;
gain.gain.setValueAtTime(vel * CFG.GAIN.bass * scalar, t);
```

Note: `_activePalette` already exists in sequencer scope (set during palette init). If not, use `_activePaletteName` to look up from PALETTES.

---

## 6 · Phase filter envelope implementation

### 6.1 Where: `_synthBass()` in sequencer.js

Current filter behavior: `filter.frequency.setValueAtTime(cutoff * 4, t)` → ramp to `cutoff`. The `cutoff` comes from `palette.bass.filterCutoff`.

Add phase-aware override:

```js
var baseCutoff = cutoff;  // palette.bass.filterCutoff (existing)
if (_activePalette && _activePalette.bass && _activePalette.bass.phaseFilter) {
  var phaseOverride = _activePalette.bass.phaseFilter[G.phase];
  if (typeof phaseOverride === 'number') baseCutoff = phaseOverride;
}
filter.frequency.setValueAtTime(baseCutoff * 4, t);
filter.frequency.exponentialRampToValueAtTime(baseCutoff, t + 0.06);
```

This means the existing `filterCutoff` acts as the default for phases without an override (Pulse, Swell, Surge typically use `null`), while Storm and Maelstrom get tighter filtering.

### 6.2 Phase-aware lookup requirement

`_synthBass` needs to know the current phase. `G.phase` is already globally accessible. No new plumbing needed.

---

## 7 · Interaction with existing systems

### 7.1 Tension curve (#11/#27)

Tension events can push intensity up/down, which affects WalkingBass tier selection. The tier cap ensures that even a tension spike can't push chiptune bass into tier 4 — the cap is absolute. No conflict.

### 7.2 Stagger (SPEC_010)

Stagger controls *when* the bass track enters during a phase transition, not *how* it sounds once active. No interaction.

### 7.3 Cycle mode (SPEC_008)

During palette swap, `WalkingBass.initRun(newPalette)` already receives the new palette. The new `tierCap`, `gainScalar`, and `phaseFilter` will automatically take effect. No changes needed in conductor.js.

### 7.4 FM modulation (dark_techno, glitch)

FM modulation in `_synthBass` runs after the filter chain. Gain scalar applies to the main oscillator amplitude, not to the FM modulation depth. FM character is preserved.

### 7.5 Track gain ramp (StateMapper)

The `_trackGains.bass` ramp (0.3→1.0 over intensity) is independent of per-note synthesis gain. `gainScalar` applies at synthesis time (per-note), track gain applies at the bus level. They multiply: effective loudness = `vel * CFG.GAIN.bass * gainScalar * trackGainBus`. This is correct — the scalar tames the per-note brightness, the bus ramp controls arrangement presence.

---

## 8 · Build issues

**Single build session.** All changes are tightly coupled: palette profiles define the values, WalkingBass consumes tierCap, _synthBass consumes gainScalar and phaseFilter. No testable intermediate state.

**One issue:**
- **#29 Per-palette Storm/Maelstrom personality — tier caps + gain scalars + phase filters** (Opus)

Scope: ~25 edits across harmony.js (×10 palette `bass` sections), sequencer.js (3 touch points: `_tier`, `getNote`, `_synthBass`). Well within single-session budget.

---

## 9 · Acceptance criteria

1. **Chiptune Storm/Maelstrom bass is noticeably different** from noir_jazz Storm/Maelstrom bass — not just timbre, but behavior (octave bounce vs. walking lines)
2. **Noir_jazz bass walks fully** at Storm/Maelstrom (tier 4 behavior preserved)
3. **Chiptune bass volume is audibly reduced** relative to before — no longer dominates the mix at high intensity
4. **Ambient_dread bass stays subby** at Maelstrom — root + 5th drone, heavy filter, no chromatic approach
5. **No regression:** bass at Pulse through Surge sounds identical to current behavior (tier caps only affect tier 2+ behavior, gain scalars are near 1.0 for most palettes, phase filters are null for lower phases)
6. **Dark_techno retains FM modulation character** — gain scalar doesn't suppress the FM growl
7. Console log when tierCap prevents a higher tier: `[WalkingBass] tier capped at 2 (palette: chiptune, raw: 4)`
8. `npm run gate` passes

---

## 10 · QA brief (for build session)

**What changed:** Each genre now has its own personality at the loudest, most intense parts of the song. Previously, all genres used the same "walking bass" pattern at high intensity — a smooth, jazz-like bass that moved stepwise through the scale. Now:
- Chiptune stays locked to bouncy octave jumps (like a real NES game) and is quieter in the mix
- Jazz gets the full walking bass treatment (where it belongs)
- Ambient and vaporwave stay as deep drones with heavy filtering
- Techno and industrial stay repetitive and driving

**How to test:**
1. Play chiptune and let it reach Storm/Maelstrom. The bass should sound like bouncy chip arpeggios, not smooth jazz walking. It should sit in the mix, not dominate it.
2. Play noir_jazz to Storm/Maelstrom. The bass should walk through the scale with chromatic approaches — this should sound natural and full.
3. Play ambient_dread to Maelstrom. The bass should be a deep, felt-not-heard drone — no melodic movement, just root and occasional 5th.
4. A/B any two palettes at Maelstrom — they should feel like different genres, not the same bass pattern through different filters.

**Risks:** The gain scalar tuning is judgment-based. If chiptune at 0.7 feels too quiet, or ambient_dread at 1.2 feels too boomy, these are single-number tweaks per palette. The architecture is right even if individual values need QA adjustment.
