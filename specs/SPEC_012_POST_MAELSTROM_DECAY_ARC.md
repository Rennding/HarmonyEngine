# SPEC_012 — Post-Maelstrom Theatrical Decrescendo

**Issue:** #12 — Post-Maelstrom decay arc — break down → new cycle
**Model:** Opus (judgment — per-palette exit choreography, musical phrasing, pattern simplification tuning)
**Status:** Draft

---

## 1 · Problem

Cycle mode's decay phase is a 16-bar gain ramp: tracks fade to silence in groups (melody→pad/perc→snare/bass→hat). It works mechanically — no audio pops, smooth transition — but it sounds like someone turning knobs down, not like a song ending a movement.

The core fantasy is "infinite procedural radio." Real radio stations, live bands, and film scores don't end sections by fading volume. They **simplify musically**: drums drop fills, bass holds root, melody plays a final phrase, pad swells and releases. The listener hears a *performance* winding down, not a mix console.

The current gain-only approach also wastes the per-palette personality built up in SPEC_028 (storm personality), SPEC_010 (stagger), and SPEC_011 (tension). At the most dramatic moment of the song — the ending — all palettes decay identically.

---

## 2 · Mental model

Think of a 5-piece band finishing the last song of a set. They don't all fade out simultaneously. The lead guitar plays a final descending lick and stops. The keyboard holds its last chord and lets it ring. The bassist drops from walking to root notes. The drummer goes from full kit to just kick and ride, then stops. The last thing you hear is the kick fading.

Each instrument gets a **musical exit** — a behavioral change that says "I'm wrapping up" — before its gain fade begins. The gain fade is still there, but it's the final 20% of the exit, not the whole thing.

```
Current decay (16 bars):
  [──────── gain ramp ────────] → silence

New decay (16 bars):
  [── pattern simplify ──][── gain fade ──] → silence
  ^                       ^
  behavior changes here   volume drops here
```

The gain choreography from SPEC_008 §3 remains — same stagger order (melody out first, rhythm last), same 16-bar window. What changes is that each group **first simplifies its musical output** before the gain fade begins.

---

## 3 · Decay choreography per group

### 3.1 Timeline (within existing 16-bar decay)

Each group has a **simplify window** followed by a **fade window**. These overlap within the existing 16-bar envelope:

| Group | Simplify starts (bar) | Fade starts (bar) | Silence by (bar) | Behavior during simplify |
|---|---|---|---|---|
| **Melody** | 0 | 2 | 4 | Final descending phrase → sustain → silence |
| **Texture** (pad, perc) | 2 | 6 | 8 | Pad: freeze chord, extend release. Perc: mute |
| **Harmony** (bass) | 4 | 10 | 12 | Drop to root-only (tier 0), extend note duration |
| **Rhythm** (snare, hat) | 6 | 12 | 14 | Half-time feel, drop fills. Hat: quarter notes only |
| **Kick** | — | 14 | 16 | Gain fade only (last heartbeat) |

This preserves the SPEC_008 §3 stagger order (melody → texture → harmony → rhythm → kick last).

### 3.2 Melody exit

MelodyEngine gets a `windDown(beatTime, durationBeats)` call at decay bar 0.

During wind-down:
- **Force descending motion** — override Markov chain to prefer notes below the current pitch. Each generated note is constrained to be ≤ current note (within the current scale).
- **Extend note duration** — double the base note length (from palette's melody rhythm to 2× duration)
- **Final note** — after `durationBeats / 2`, play the root of the current chord and hold it for the remaining duration
- **Then stop** — MelodyEngine sets `_windingDown = false` and stops generating notes. Gain fade handles the rest.

### 3.3 Pad/Texture exit

PadTrack gets a `windDown(beatTime, durationBeats)` call at decay bar 2.

During wind-down:
- **Freeze chord** — stop chord changes. PadTrack holds its current chord for the entire wind-down
- **Extend release** — set envelope release to 4× normal (long, reverberant tail)
- **Boost reverb send** — +30% reverb send during wind-down (creates the "hall ring-out" feel)
- **Perc: immediate mute** — percussion track is muted at wind-down start (perc is the first thing that sounds "wrong" if it keeps playing during decay)

### 3.4 Bass exit

WalkingBass drops to **tier 0** behavior at decay bar 4, regardless of current intensity:
- Root notes only (no walking, no approach tones)
- Note duration extended to half-notes (2 beats) instead of quarter-note walking
- Existing `tierCap` mechanism (SPEC_028) makes this trivial: force `tierCap = 0` during decay

### 3.5 Rhythm exit

At decay bar 6:
- **Trigger half-time** — `Sequencer.setHalfTime()` (already exists). Drums go half-speed, hat mutes, reverb increases
- **Drop fills** — if FillSystem exists, suppress it during decay
- **Snare → simple backbeat** — 2 and 4 only, no ghost notes. GrooveEngine ghost probability → 0

### 3.6 Kick exit

Kick is the "last heartbeat." No behavioral change — just the existing gain fade from bars 14–16.

---

## 4 · Per-palette decay profiles

Each palette gets a `decay` object in its PALETTES entry. This controls the *feel* of the musical exit.

### 4.1 New field

```js
decay: {
  melodyExit: 'descend' | 'sustain' | 'stutter',
  padReleaseMult: Number,    // release time multiplier (1.0 = normal, 4.0 = long ring)
  bassHoldBeats: Number,     // note duration during decay (2 = half-notes, 4 = whole notes)
  rhythmStyle: 'halftime' | 'sparse' | 'instant',
  reverbBoost: Number,       // reverb send multiplier during decay (1.0 = none, 1.3 = +30%)
}
```

### 4.2 Palette-by-palette tuning

| Palette | melodyExit | padReleaseMult | bassHoldBeats | rhythmStyle | reverbBoost | Rationale |
|---|---|---|---|---|---|---|
| **dark_techno** | sustain | 2.0 | 4 | sparse | 1.1 | Minimal, drone-like exit. Bass holds root whole notes. Drums go sparse (kick + occasional hat), not half-time. |
| **synthwave** | descend | 3.0 | 2 | halftime | 1.4 | Cinematic wind-down. Long reverb tails. Classic 80s fade feel. |
| **glitch** | stutter | 1.5 | 2 | instant | 1.0 | Abrupt — melody glitches and stops, drums cut immediately, bass holds briefly. No reverb padding. |
| **ambient_dread** | sustain | 6.0 | 4 | sparse | 1.6 | Extremely long pad release. Bass drones. Drums barely there. Maximum reverb — the room keeps ringing. |
| **lo_fi_chill** | descend | 4.0 | 2 | halftime | 1.5 | Gentle descent. Warm reverb tail. Relaxed half-time feel. |
| **chiptune** | descend | 1.0 | 2 | halftime | 1.0 | Quick, clean exit. No long reverb (8-bit games don't have reverb). |
| **noir_jazz** | descend | 4.0 | 2 | halftime | 1.5 | Walking bass simplifies to root, melody plays a final descending phrase. Club closing time. |
| **industrial** | stutter | 1.5 | 4 | instant | 1.0 | Hard cut. Melody stutters out. Drums stop abruptly. Bass holds a low drone. |
| **vaporwave** | sustain | 5.0 | 4 | sparse | 1.5 | Dreamy dissolution. Everything rings out into reverb. |
| **breakbeat** | descend | 2.0 | 2 | halftime | 1.2 | Break drops to half-time, melody descends. Mid-length reverb. |

### 4.3 Melody exit types

- **descend** — Markov chain forced to descending pitches, lands on root, holds. The "jazz standard ending."
- **sustain** — Melody plays one final note (current pitch or root) and sustains it. The "ambient drone exit."
- **stutter** — Melody repeats its last note with decreasing velocity (4 repeats, each -25% gain), then stops. The "glitch/industrial cut."

---

## 5 · Implementation plan

### 5.1 New functions

| Module | Function | Description |
|---|---|---|
| sequencer.js | `MelodyEngine.windDown(beatTime, durationBeats, exitType)` | Triggers melody exit behavior |
| sequencer.js | `PadTrack.windDown(beatTime, durationBeats, releaseMult, reverbBoost)` | Triggers pad freeze + extended release |
| sequencer.js | `WalkingBass.setDecayMode(holdBeats)` | Forces tier 0 + extended note duration |
| state_mapper.js | `StateMapper.startCycleDecay(beatTime)` | **Modified** — adds musical simplification before gain ramps |
| harmony.js | `PALETTES[n].decay` | New per-palette decay profile (×10) |

### 5.2 Modification to startCycleDecay

The existing `startCycleDecay` schedules gain ramps only. The new version:

1. Reads the current palette's `decay` profile
2. On the first beat, triggers musical simplifications (wind-down calls) at their scheduled bar offsets
3. Then schedules the gain ramps at their existing bar offsets (which are now the *fade* portion, after simplification has already started)

The timing is pre-scheduled on first beat of decay (like now), but wind-down calls are dispatched per-beat as their trigger bar arrives — not all at once — because they modify live state (pattern selection, Markov chain behavior) rather than scheduling Web Audio parameter ramps.

### 5.3 Per-beat dispatch

During decay, `_processCycleBeat` already runs every beat. Add a check: if a group's simplify bar has arrived but its wind-down hasn't been triggered yet, trigger it. Track this with a `_decayDispatched` flags object:

```
_decayDispatched: { melody: false, texture: false, bass: false, rhythm: false }
```

Reset on decay entry. Each group's wind-down fires once, at the correct bar.

### 5.4 Wind-down state cleanup

All wind-down states auto-clear when:
- `_exitCycle()` runs (rebuild complete → pulse reset)
- `Conductor.stop()` runs
- `resetRun()` runs

Each module's wind-down sets internal flags that are checked on the next `tick`/`onBeat`. No scheduled cleanup needed — the flags are reset by the above calls, which already reset all subsystem state.

---

## 6 · Interaction with existing systems

### 6.1 Existing gain ramps (SPEC_008 §3)

Preserved. The gain fade schedule shifts slightly later within each group's window (simplification eats the first ~2 bars, fade starts after), but total 16-bar envelope is unchanged. The fade now starts from a musically simpler state, so the transition to silence is smoother.

### 6.2 Half-time (Sequencer.setHalfTime)

Already exists and handles hat mute + reverb boost + drum simplification. The rhythm group's wind-down calls `setHalfTime` directly. Duration is set to cover the remaining decay bars.

For palettes with `rhythmStyle: 'sparse'` — don't call setHalfTime, instead mute snare and hat immediately and leave kick playing straight quarter notes. For `rhythmStyle: 'instant'` — mute all drums except kick immediately.

### 6.3 Stagger (SPEC_010)

Phase stagger is already cancelled at decay entry (`StateMapper.cancelStagger()`). No conflict.

### 6.4 Tension curve (SPEC_011)

Tension events are already suppressed during cycle transitions (`_cycleState !== null`). No conflict.

### 6.5 Storm personality (SPEC_028)

The `tierCap` and `gainScalar` are overridden during decay (bass forced to tier 0, gain ramping down). No conflict — decay supersedes storm personality.

### 6.6 NarrativeConductor

NarrativeConductor's motif system is phase-driven. During decay, phase stays at 'maelstrom' (unchanged from current behavior). No new motifs fire. No conflict.

### 6.7 Fill system

If FillSystem exists, suppress it during decay — fills during wind-down would fight the simplification. Check: `if (_cycleState === 'decay') return;` guard in `FillSystem.triggerPhaseFill`.

---

## 7 · Build issues

**Single build session.** All changes are tightly coupled: conductor dispatches wind-down calls, each instrument module implements its exit behavior, StateMapper integrates the scheduling, palette profiles tune the feel. No testable intermediate state (melody wind-down without bass wind-down sounds broken).

**One issue:**
- **#___ Post-Maelstrom theatrical decrescendo — wind-down behaviors + per-palette decay profiles** (Opus)

Scope: ~35 edits across conductor.js (dispatch logic), sequencer.js (MelodyEngine.windDown, PadTrack.windDown, WalkingBass.setDecayMode), state_mapper.js (startCycleDecay modification), harmony.js (×10 palette decay profiles), config.js (optional constants). Within single-session budget.

---

## 8 · Acceptance criteria

1. **Musical exit is audible** — melody plays a final phrase before silence, not just volume fade
2. **Per-palette personality** — glitch decay sounds abrupt and choppy, ambient_dread dissolves into reverb, noir_jazz winds down like a club closing
3. **Bass simplifies** — no walking bass patterns during decay, just root notes
4. **Drums simplify before fading** — half-time feel, no fills, no ghost notes
5. **Pad rings out** — extended release creates a reverberant tail during decay
6. **16-bar total envelope preserved** — decay still takes exactly 16 bars (SPEC_008 contract unchanged)
7. **Bridge/rebuild unaffected** — all wind-down states are cleared before bridge
8. **Same seed reproducibility** — decay behavior is deterministic (no randomized exit phrases)
9. **No regression** — cycle mode, phase progression, stagger, tension all work correctly
10. `npm run gate` passes

---

## 9 · QA brief (for build session)

**What changed:** When the song reaches its peak and begins winding down for a palette change, each instrument now has a musical "goodbye" instead of just fading out.

**How to test:**
1. Enable cycle mode. Let a song reach Maelstrom and sustain. When decay begins, listen for: melody playing a final descending phrase and stopping, drums simplifying to a simple beat before fading, bass dropping to simple root notes, pad chord ringing out with long reverb.
2. Try dark_techno — the decay should feel minimal and abrupt. Bass holds a single low note, drums go sparse quickly.
3. Try ambient_dread — the decay should dissolve slowly into reverb. The pad should ring for a long time. Very atmospheric.
4. Try glitch — the decay should feel choppy. Melody stutters and cuts, drums stop suddenly.
5. Try noir_jazz — should feel like the band at a jazz club wrapping up the last tune. Melody descends, bass simplifies to root, drums go half-time.
6. The total transition time should feel the same as before (~16 bars). Only the *character* of the decay changes.

**Risks:** The "stutter" melody exit (glitch, industrial) might sound like a bug rather than intentional if the velocity ramp is too steep. Tuning the repeat count and velocity curve per palette may need QA iteration.
