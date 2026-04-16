# SPEC_011 — Tension Curve Randomization

**Issue:** #11 — Tension curve randomization — plateaus, false climaxes, retreats
**Model:** Opus (judgment-heavy: event placement, musical pacing, palette-aware tuning)
**Status:** Draft

---

## 1 · Problem

DC progression is a pure monotonic power curve: `(beatCount / scale) ^ exp`. Every listen at the same BPM/palette traces the identical emotional arc. After 2–3 listens, the build feels mechanical — there's no surprise, no breath, no story.

The core fantasy is "infinite procedural song that evolves." Monotonic DC contradicts "evolves" — it's a ramp, not a narrative.

---

## 2 · Mental model

**DC stays as-is** — the underlying power curve remains the long-term trajectory. On top of it, a **TensionMap** (generated once per song from `_songRng`) defines a sequence of **tension events** that temporarily modify the effective DC value seen by the phase system.

Think of it like a synth: DC is the oscillator (steady tone), TensionMap is the LFO (modulation on top).

```
effectiveDC = baseDC + tensionOffset
```

Where `tensionOffset` can be positive (spike), negative (retreat), or zero (normal progression). Phase thresholds are evaluated against `effectiveDC`, not raw `baseDC`.

---

## 3 · TensionMap generation

### 3.1 When

Generated once in `resetRun()` after the PRNG is seeded. Same seed → same map → reproducible.

Also regenerated during cycle mode palette swap (`_doPaletteSwap`) since a new seed is created there.

### 3.2 Structure

A TensionMap is an ordered array of **tension events**, each with:

```js
{
  type: 'plateau' | 'spike' | 'retreat',
  startBeat: Number,    // beat count when event activates
  duration: Number,     // beats the event lasts
  magnitude: Number,    // DC offset (0 for plateau, positive for spike, negative for retreat)
  easeIn: Number,       // beats to ramp into full magnitude
  easeOut: Number,      // beats to ramp back to zero
}
```

### 3.3 Generation algorithm

1. **Divide the song into windows.** Each window is 32–64 beats (randomized via `_songRng`). These are *candidate slots* — not every window gets an event.
2. **For each window**, roll the PRNG to decide:
   - **No event** (40% base probability) — DC progresses normally
   - **Plateau** (25%) — DC offset = 0, but `baseDC` is frozen at its value when the event starts (overrides the power curve for `duration` beats)
   - **Spike** (15%) — positive DC offset, ramps up then back down. A "false climax."
   - **Retreat** (20%) — negative DC offset, creates a breath/pullback
3. **Constraint: no events before beat 16.** Let the song establish itself first.
4. **Constraint: no retreat that would drop effectiveDC below 0.** Clamp at 0.
5. **Constraint: no spike that would skip more than 1 phase boundary.** Cap spike magnitude so effectiveDC doesn't jump from Pulse to Storm. One-phase jumps are fine (that's the "false climax" feel).
6. **Constraint: minimum 8 beats between events.** No overlapping or back-to-back chaos.

### 3.4 Palette-aware tuning

Each palette gets a `tension` profile in its PALETTES entry:

```js
tension: {
  eventDensity: 0.7,    // multiplier on event probability (0.5 = sparse, 1.0 = dense)
  retreatDepth: 0.15,   // max retreat magnitude as fraction of current DC
  spikeHeight: 0.20,    // max spike magnitude as fraction of next-phase threshold gap
  plateauBias: 0.0,     // added to plateau probability (+0.2 means more plateaus)
}
```

| Palette | eventDensity | retreatDepth | spikeHeight | plateauBias | Rationale |
|---|---|---|---|---|---|
| dark_techno | 0.6 | 0.10 | 0.25 | 0.0 | Relentless build with sharp spikes |
| synthwave | 0.7 | 0.15 | 0.20 | +0.1 | Cruising feel, longer plateaus |
| glitch | 0.9 | 0.20 | 0.30 | -0.1 | Chaotic, frequent events |
| ambient_dread | 0.5 | 0.12 | 0.10 | +0.3 | Slow burn, heavy plateaus, rare spikes |
| lo_fi_chill | 0.6 | 0.18 | 0.12 | +0.2 | Relaxed, gentle variation |
| chiptune | 0.8 | 0.15 | 0.25 | 0.0 | Energetic, game-like pacing |
| noir_jazz | 0.7 | 0.20 | 0.15 | +0.15 | Dramatic retreats, moody plateaus |
| industrial | 0.7 | 0.10 | 0.30 | -0.1 | Aggressive, spike-heavy |
| vaporwave | 0.5 | 0.15 | 0.10 | +0.25 | Dreamy, long plateaus, minimal spikes |
| breakbeat | 0.8 | 0.18 | 0.28 | -0.05 | Energetic, sharp contrasts |

### 3.5 Duration ranges (in beats)

| Event type | Min duration | Max duration | easeIn | easeOut |
|---|---|---|---|---|
| Plateau | 16 | 32 | 0 | 4 |
| Spike | 8 | 16 | 4 | 4 |
| Retreat | 12 | 24 | 4 | 8 |

---

## 4 · Runtime application

### 4.1 Where: `updateDC()` in state.js

After the existing power-curve computation, apply the active tension event (if any):

```
baseDC = Math.pow(G.beatCount / curve.scale, curve.exp);  // existing
tensionOffset = TensionMap.getOffset(G.beatCount);          // new
effectiveDC = Math.max(0, baseDC + tensionOffset);          // clamped
G.dc = effectiveDC;
```

### 4.2 Plateau special case

For plateaus, the offset isn't additive — it's a **freeze**. When a plateau is active, `G.dc` holds at the value it had when the plateau started, ignoring the power curve's continued climb. On exit (with easeOut), it interpolates back to the current power-curve value.

Implementation: store `frozenDC` on plateau start. During plateau, `G.dc = frozenDC`. During easeOut, lerp from `frozenDC` to current `baseDC`.

### 4.3 Spike/retreat easing

Linear interpolation during easeIn/easeOut:

```
beatsIntoEvent = G.beatCount - event.startBeat
if (beatsIntoEvent < event.easeIn):
    t = beatsIntoEvent / event.easeIn
    offset = event.magnitude * t
elif (beatsIntoEvent > event.duration - event.easeOut):
    remaining = event.duration - beatsIntoEvent
    t = remaining / event.easeOut
    offset = event.magnitude * t
else:
    offset = event.magnitude
```

### 4.4 Phase change during tension events

Phase transitions triggered by tension events (spike pushes DC past a threshold, retreat pulls it below) are **real** — they fire phase-change listeners, update `G.phase`, and trigger stagger. This is the whole point: the listener hears instruments swell in and then pull back.

The only guard: a spike cannot cause a phase jump of more than 1 step. If `effectiveDC` would skip a phase, cap it at the next phase's threshold + 0.01.

---

## 5 · Interaction with existing systems

### 5.1 Manual phase forcing (autoPhase off)

Tension events are **suppressed** when `_autoPhase === false`. The TensionMap still exists (so switching back to auto resumes the profile), but `getOffset()` returns 0.

### 5.2 Cycle mode

During active cycle transitions (`_cycleState !== null`), tension events are suppressed — cycle already controls DC/phase. After rebuild exit, tension resumes from wherever the map says for the current beat count.

On palette swap during bridge, a new TensionMap is generated (new seed → new map).

### 5.3 NarrativeConductor

No changes needed. NarrativeConductor reacts to phase changes, which tension events may trigger. The motif playback on phase entry works the same whether the phase change came from normal DC climb or a tension spike. A retreat that drops the phase back down will trigger another phase-change event — NarrativeConductor's existing `_introPlayed`/`_swellPlayed` flags prevent duplicate motifs in the same run.

### 5.4 Stagger

Phase transitions caused by tension events use the same stagger system. No special handling needed.

### 5.5 Seed display / URL params (#9)

Same seed still produces the same song — TensionMap is deterministic from the seed. No changes to seed sharing.

---

## 6 · New code

### 6.1 TensionMap object (in state.js or new tension.js)

Decision: **state.js** — it's tightly coupled with `updateDC()` and `_songRng`. Adding a new file for ~80 lines isn't justified.

Exports:
- `TensionMap.generate(rng, palette)` — builds the event array
- `TensionMap.getOffset(beatCount)` — returns current offset (or plateau freeze signal)
- `TensionMap.isActive()` — returns true if an event is currently active (for UI/debug)
- `TensionMap.currentEvent()` — returns the active event object (for debug display)
- `TensionMap.reset()` — clears the map

### 6.2 Palette tension profiles (in harmony.js)

Add `tension: { ... }` to each of the 10 PALETTES entries (see §3.4 table).

### 6.3 Config constants (in config.js)

```js
CFG.TENSION = {
  WINDOW_MIN: 32,         // minimum beats per candidate window
  WINDOW_MAX: 64,         // maximum beats per candidate window
  GRACE_BEATS: 16,        // no events before this beat
  GAP_MIN: 8,             // minimum beats between events
  BASE_PROBS: {           // base probabilities (before palette bias)
    none: 0.40,
    plateau: 0.25,
    spike: 0.15,
    retreat: 0.20,
  },
};
```

---

## 7 · Build issues

Single build session — all changes are tightly coupled (TensionMap generates events, updateDC consumes them, palette profiles tune them). Intermediate states are broken.

**One issue:**
- **#___ Tension curve randomization — TensionMap + palette profiles + DC integration** (Opus)

Scope: ~30 edits across state.js, config.js, harmony.js (×10 palettes), conductor.js (2 touch points). Within single-session budget.

---

## 8 · Acceptance criteria

1. DC progression is no longer monotonic — audible moments of rest and surge
2. Same seed produces identical tension profile (play twice, compare phase timings)
3. Each palette feels different: ambient_dread has long plateaus, glitch has frequent spikes
4. Manual phase override suppresses tension events; switching back to auto resumes
5. Cycle mode palette swap generates a fresh TensionMap
6. No regression: existing phase progression, stagger, NarrativeConductor all behave correctly
7. Console log on tension event start/end: `[TensionMap] plateau started at beat 48 (duration=24)`

---

## 9 · QA brief (for build session)

**What changed:** Songs now have "breathing" — the build from quiet to loud is no longer a straight ramp. You'll hear moments where the music holds steady (plateaus), brief surges that pull back (false climaxes), and dips that create anticipation before the next push (retreats).

**How to test:**
1. Play any palette with auto-phase on. Listen for ~2 minutes. The build should feel less predictable than before — instruments may swell in then drop back, or the intensity holds steady for a while before climbing again.
2. Play the same seed twice (note the seed from the URL or display). Phase transition timings should be identical both times.
3. Try different palettes: ambient_dread should feel slow and steady with long holds. Glitch should feel erratic. Dark_techno should have sharp spikes.
4. Force a phase manually (click a phase pill), then switch back to auto. The tension profile should resume naturally.
5. Enable cycle mode. After a palette swap, the new song should have its own unique tension shape.

**Risks:** A retreat could briefly drop instruments out then bring them back — this is intentional ("the band taking a breath") but could feel like a glitch if the retreat is too aggressive. The palette tuning values control this.
