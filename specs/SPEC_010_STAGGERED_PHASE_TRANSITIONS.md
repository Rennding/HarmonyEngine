# SPEC_010 — Staggered Phase Transitions

**Status:** Draft
**Model:** Opus (judgment-heavy: per-palette timing design, subsystem ordering, creative decisions)
**Depends on:** #25 QA pass (cycle mode UI must be stable)

---

## 0 · Problem

Phase transitions are instant: when DC crosses a threshold, `_onPhaseChange` fires and every subsystem reacts on the same beat. Tracks unmute simultaneously, FX ramp together, harmony/melody/groove all shift at once. This sounds mechanical — like flipping a switch rather than a band gradually shifting gears.

Real music transitions are **staggered**: drums settle into a new pattern first, bass follows, pads drift in last. The timing of that stagger is genre-dependent — techno snaps tight, ambient drifts wide.

---

## 1 · Design

### 1.1 · Core concept: per-subsystem beat offsets

When a phase change fires, instead of notifying all subsystems on beat 0, a **PhaseStagger** scheduler delays each subsystem's notification by a configurable number of beats. The phase change becomes a **spread window** (e.g., 8 beats) during which subsystems activate one by one.

### 1.2 · Stagger groups

Subsystems are grouped into **layers** that transition as units:

| Group | What it controls | Why grouped |
|---|---|---|
| `rhythm` | Kick pattern change, hat unmute/pattern, snare unmute/pattern, perc unmute, GrooveEngine phase scaling | Rhythmic foundation moves together |
| `harmony` | HarmonyEngine chord progression, bass unmute/pattern, key modulation | Harmonic changes need bass + chords aligned |
| `texture` | Pad unmute/gain, FX ramp (reverb, delay, dist, sidechain), NarrativeConductor | Textural wash — can lag behind safely |
| `melody` | MelodyEngine phrase/intensity, melody unmute, PolyTrack phase gates | Melodic content enters last for dramatic effect |

Within a group, all subsystems fire on the same beat. The **offset** is per-group, measured in beats from the phase-change beat.

### 1.3 · Per-palette stagger profiles

Each palette defines a `stagger` object. Hardcoded defaults baked into the palette definition, overridable via a future config surface.

```js
// Example: dark_techno — tight mechanical stagger
stagger: {
  rhythm:  0,  // immediate — drums snap first
  harmony: 2,  // bass + chords follow 2 beats later
  texture: 4,  // FX wash builds over next 2 beats
  melody:  4,  // melody enters with texture
  window:  4,  // total spread in beats
}

// Example: ambient_dread — wide atmospheric drift
stagger: {
  rhythm:  0,
  harmony: 4,
  texture: 8,
  melody:  12,
  window:  12,
}

// Example: chiptune — near-instant (genre is snappy)
stagger: {
  rhythm:  0,
  harmony: 1,
  texture: 1,
  melody:  2,
  window:  2,
}
```

**Default fallback** (used if palette has no `stagger` field):
```js
{ rhythm: 0, harmony: 2, texture: 4, melody: 4, window: 4 }
```

### 1.4 · Override surface

A `CFG.STAGGER_OVERRIDE` object (initially `null`). When set, it replaces the palette's stagger profile entirely. This lets a future UI or API call override per-palette defaults without touching palette definitions.

```js
CFG.STAGGER_OVERRIDE: null,
// Set to { rhythm: 0, harmony: 1, texture: 2, melody: 3, window: 3 } to override
```

Resolution order: `CFG.STAGGER_OVERRIDE` → `palette.stagger` → hardcoded default.

---

## 2 · Architecture

### 2.1 · PhaseStagger scheduler (new, lives in state_mapper.js)

State: 
- `_staggerQueue`: array of `{ group, beatOffset, phase, oldPhase, triggerBeat }` entries
- `_staggerActive`: boolean — true while a stagger window is in progress
- `_staggerBaseBeat`: the beat number when the phase change was initiated

On phase change (`_onPhaseChange`):
1. Read stagger profile (override → palette → default)
2. If all offsets are 0 → fire everything immediately (no overhead)
3. Otherwise: set `_staggerActive = true`, `_staggerBaseBeat = G.beatCount`
4. Enqueue one entry per group with its beat offset
5. Fire `rhythm` group immediately (offset 0 is always immediate)
6. The stinger + fill fire with the `rhythm` group (they mark the transition start)

On each beat (`update` method, already called every beat):
1. If `!_staggerActive` → skip
2. Check queue: fire any group whose `triggerBeat <= G.beatCount`
3. When queue is empty → `_staggerActive = false`

### 2.2 · Group dispatch functions

Each group maps to a private method that calls the relevant subsystems:

```
_dispatchRhythm(phase, oldPhase, beatTime)
  → PHASE_FLOOR track unmutes for rhythm tracks (kick, hat, snare, perc)
  → GrooveEngine.onPhaseChange
  → FillSystem.triggerPhaseFill
  → PatternMutator.revertToOriginal
  → _playStinger (transition audio cue)

_dispatchHarmony(phase, oldPhase, beatTime)
  → HarmonyEngine.onPhaseChange (chord progression advance)
  → PHASE_FLOOR track unmutes for bass
  → Bass pattern change
  → Post-storm modulation check

_dispatchTexture(phase, beatTime)
  → PHASE_FLOOR track unmutes for pad
  → _applyPhaseEffects (FX ramp)
  → NarrativeConductor.onPhaseChange
  → Sidechain phase multiplier

_dispatchMelody(phase, beatTime)
  → MelodyEngine.onPhaseChange
  → PHASE_FLOOR track unmutes for melody
  → PolyTrack.onPhaseChange
```

### 2.3 · Interaction with existing systems

**Track gains (`_updateLayers`):** Currently checks `PHASE_FLOOR[G.phase]` every beat. Problem: `G.phase` updates instantly, so all floor tracks would unmute immediately regardless of stagger.

Solution: introduce `_effectiveFloor` — a per-track override that `PhaseStagger` controls. When stagger is active, `_effectiveFloor` starts as the *old* phase's floor and is progressively updated as each group dispatches. `_updateLayers` reads `_effectiveFloor` instead of `PHASE_FLOOR[G.phase]` directly.

**Cycle mode:** Cycle transitions (decay/bridge/rebuild) already have their own staggered gain choreography via `_cycleFrozen`. PhaseStagger is **disabled during cycle transitions** (`_cycleState !== null` → skip stagger, fire all groups instantly). No interaction.

**Manual phase forcing (`forcePhase`):** Per design decision — still staggers. `forcePhase` sets `_manualPhase`, conductor detects the change next beat, fires `_onPhaseChange` → stagger kicks in normally.

**NarrativeConductor pre-phase tension (4-beat snare+hat drop):** This already fires *before* the phase change. No conflict — it completes before stagger window opens.

**Phase transition silence (1-beat full stop):** Currently fires at phase boundary via NarrativeConductor. Under stagger, this fires with the `rhythm` group (beat 0) — silence still marks the transition start, then instruments re-enter staggered. This creates a brief "breath" followed by gradual rebuild, which is musically desirable.

---

## 3 · Palette stagger profiles

Design rationale for each palette's timing character:

| Palette | Window | Rhythm | Harmony | Texture | Melody | Rationale |
|---|---|---|---|---|---|---|
| dark_techno | 4 | 0 | 2 | 4 | 4 | Mechanical, tight. Drums snap, texture follows. |
| synthwave | 6 | 0 | 2 | 4 | 6 | Cinematic build. Melody enters last for drama. |
| glitch | 2 | 0 | 1 | 1 | 2 | Chaotic, near-instant. Genre is about surprise. |
| ambient_dread | 12 | 0 | 4 | 8 | 12 | Glacial drift. Maximum spread for atmosphere. |
| lo_fi_chill | 8 | 0 | 2 | 6 | 8 | Lazy, unhurried. Things drift in. |
| chiptune | 2 | 0 | 1 | 1 | 2 | Snappy 8-bit. Transitions are fast events. |
| noir_jazz | 8 | 0 | 4 | 6 | 8 | Smoky patience. Bass walks in, then sax. |
| industrial | 4 | 0 | 2 | 2 | 4 | Harsh but controlled. Texture = aggression, not drift. |
| vaporwave | 10 | 0 | 4 | 8 | 10 | Dreamy, slowed. Everything takes its time. |
| breakbeat | 4 | 0 | 2 | 4 | 4 | Breaks hit first, rest follows quick. |

---

## 4 · Config additions

```js
// config.js — add to CFG
STAGGER_OVERRIDE: null,   // null = use palette defaults. Set to { rhythm, harmony, texture, melody, window } to override.
STAGGER_DEFAULT: { rhythm: 0, harmony: 2, texture: 4, melody: 4, window: 4 },
```

---

## 5 · Edge cases

1. **Rapid phase changes (DC jumps 2+ phases):** If a stagger window is active and a new phase change fires, cancel the pending queue and start a new stagger from the new phase. The interrupted groups snap to whatever state they were in — no rollback.

2. **Downward phase transitions:** Same stagger logic applies. When going Storm→Surge, tracks that lose their floor status get muted via the stagger groups (melody first out, rhythm last — reverse order). The `_effectiveFloor` is updated per-group in reverse: melody group fires first (removes melody floor), then texture, harmony, rhythm.

3. **Maelstrom entry during stagger:** If DC crosses maelstrom threshold while a swell→surge stagger is active, cancel and restart with surge→maelstrom stagger. `_onMaelstromEntry` sustain timer fires when the phase is *set*, not when stagger completes.

4. **Manual phase forcing mid-stagger:** Cancel current stagger, start new one for the forced phase.

5. **Cycle mode activation during stagger:** Cancel stagger immediately, `_cycleFrozen = true` takes over.

6. **Zero-offset stagger (all groups at 0):** Detected at queue time → bypass scheduler entirely, fire all groups synchronously. No performance overhead for palettes that want instant transitions.

7. **Phase change on beat 0 (song start):** Pulse is the initial phase, no transition needed. First real stagger happens at pulse→swell.

---

## 6 · Reverse stagger for downward transitions

When transitioning to a *lower* phase (e.g., forced from Storm→Swell), the exit order reverses:

| Step | Group | Action |
|---|---|---|
| 0 | melody | Melody mutes, PolyTrack deactivates |
| +2 | texture | Pad fades, FX ramp down |
| +4 | harmony | Bass adjusts, chord progression steps back |
| +6 | rhythm | Drums simplify to new floor |

The offsets use the *destination* palette's stagger profile, but the group order is reversed. Implementation: when `newPhaseIndex < oldPhaseIndex`, dispatch groups as `[melody, texture, harmony, rhythm]` instead of `[rhythm, harmony, texture, melody]`.

---

## 7 · Files changed (estimated)

| File | Changes |
|---|---|
| config.js | Add `STAGGER_OVERRIDE`, `STAGGER_DEFAULT` |
| harmony.js | Add `stagger` field to all 10 palette objects |
| state_mapper.js | PhaseStagger scheduler, `_effectiveFloor`, group dispatch functions, refactor `_onPhaseChange` |
| conductor.js | Cancel stagger on cycle entry, pass phase direction info |

**Estimated edit count:** ~35

---

## 8 · QA brief (for when build completes)

**What changed:** Phase transitions now spread instrument entries over several beats instead of everything hitting at once. Each genre has its own timing — techno snaps tight (4 beats), ambient drifts wide (12 beats). Manual phase buttons also stagger.

**How to test:**
1. Play any palette, wait for pulse→swell transition. Hat and snare should enter *before* pad and melody.
2. Switch to ambient_dread — transitions should feel noticeably slower/wider than dark_techno.
3. Try chiptune — transitions should be near-instant (2 beats).
4. Force a phase manually via phase pills — should still stagger, not snap.
5. Enable cycle mode — cycle transitions (decay/bridge/rebuild) should work exactly as before (stagger is bypassed).
6. Force rapid phase changes (click pills quickly) — each new force should cancel the previous stagger cleanly, no stuck instruments.

**Risks:** Instruments stuck in wrong state if stagger queue cancellation has a bug. Observable as: a track that should be audible staying silent, or a track playing when it shouldn't for the current phase.
