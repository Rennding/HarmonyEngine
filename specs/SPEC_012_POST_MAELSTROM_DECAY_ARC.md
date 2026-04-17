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
| **Melody** | 0 | 2 | 4 | Kill legato voice → clear motif → final descending phrase → sustain → silence |
| **Texture** (pad, perc, chord) | 2 | 6 | 8 | Pad: freeze chord, extend release. Perc: mute. Chord: palette-driven (mute/hold/decay). |
| **Harmony** (bass) | 4 | 10 | 12 | Drop to root-only (tier 0), extend note duration |
| **Rhythm** (snare, hat) | 6 | 12 | 14 | Half-time feel, drop fills. Hat: quarter notes only |
| **Kick** | — | 14 | 16 | Gain fade only (last heartbeat) |

This preserves the SPEC_008 §3 stagger order (melody → texture → harmony → rhythm → kick last).

### 3.2 Melody exit

MelodyEngine gets a `windDown(beatTime, durationBeats)` call at decay bar 0.

During wind-down:
- **Kill legato voice first** — call `_killLiveVoice()` (melody.js line 1295) before generating the first descent note. Prevents the #44 pop pattern: a fresh descent note on top of a dead legato chain re-triggers the LPF envelope from peak, producing a brittle pop. The descent phrase must start from a clean voice state.
- **Clear motif state** — set `_motif = null`, `_phrIdx = 0`, `_antecedentOpening = null` at wind-down entry. The descent phrase is generated directly by the forced-descending Markov chain, not by the motif variation system (SPEC_036). This prevents orphaned motif data from leaking into the next cycle's rebuild.
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
- **ChordTrack exit** — also gets a `windDown(beatTime, durationBeats, exitType)` call at the same bar offset (2). Behavior driven by `palette.decay.chordExit`:
  - `mute` — stop pattern, silence voices immediately (glitch, chiptune, industrial)
  - `hold` — freeze on last stab, extend release to match pad, let it ring (dark_techno, synthwave, ambient_dread, vaporwave)
  - `decay` — stop pattern firing but let existing notes' natural release tail out; reverb boost applies (noir_jazz, lo_fi_chill, breakbeat)
  - In all cases: stop calling `_playStab` / `_playArpNote` once wind-down is active (prevents new note-ons during fade).

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
  chordExit: 'mute' | 'hold' | 'decay',  // ChordTrack exit behavior (added post-audit)
}
```

### 4.2 Palette-by-palette tuning

| Palette | melodyExit | padReleaseMult | bassHoldBeats | rhythmStyle | reverbBoost | chordExit | Rationale |
|---|---|---|---|---|---|---|---|
| **dark_techno** | sustain | 2.0 | 4 | sparse | 1.1 | hold | Minimal, drone-like exit. Bass holds root whole notes. Drums go sparse (kick + occasional hat), not half-time. Chord freezes as a drone. |
| **synthwave** | descend | 3.0 | 2 | halftime | 1.4 | hold | Cinematic wind-down. Long reverb tails. Classic 80s fade feel. Chord ring-out matches pad. |
| **glitch** | stutter | 1.5 | 2 | instant | 1.0 | mute | Abrupt — melody glitches and stops, drums cut immediately, bass holds briefly, chord cuts. No reverb padding. |
| **ambient_dread** | sustain | 6.0 | 4 | sparse | 1.6 | hold | Extremely long pad release. Bass drones. Drums barely there. Chord freezes and rings. Maximum reverb — the room keeps ringing. |
| **lo_fi_chill** | descend | 4.0 | 2 | halftime | 1.5 | decay | Gentle descent. Warm reverb tail. Chord pattern stops, existing stabs ring out. Relaxed half-time feel. |
| **chiptune** | descend | 1.0 | 2 | halftime | 1.0 | mute | Quick, clean exit. No long reverb (8-bit games don't have reverb). Chord cuts cleanly. |
| **noir_jazz** | descend | 4.0 | 2 | halftime | 1.5 | decay | Walking bass simplifies to root, melody plays a final descending phrase, last chord stab rings out. Club closing time. |
| **industrial** | stutter | 1.5 | 4 | instant | 1.0 | mute | Hard cut. Melody stutters out. Drums stop abruptly. Bass holds a low drone. Chord slams shut. |
| **vaporwave** | sustain | 5.0 | 4 | sparse | 1.5 | hold | Dreamy dissolution. Everything rings out into reverb — chord included. |
| **breakbeat** | descend | 2.0 | 2 | halftime | 1.2 | decay | Break drops to half-time, melody descends, chord pattern stops and tail decays. Mid-length reverb. |

### 4.3 Melody exit types

- **descend** — Markov chain forced to descending pitches, lands on root, holds. The "jazz standard ending."
- **sustain** — Melody plays one final note (current pitch or root) and sustains it. The "ambient drone exit."
- **stutter** — Melody repeats its last note with decreasing velocity (4 repeats, each -25% gain), then stops. The "glitch/industrial cut."

### 4.4 Chord exit types

- **mute** — ChordTrack stops firing stabs immediately on wind-down entry; any currently-ringing voices are killed with a short release (matches the abrupt cut of the melody's stutter exit). Used by cut-style palettes.
- **hold** — ChordTrack freezes on its current chord articulation. The last stab's natural release is extended via the pad's releaseMult. Used by drone / long-ring palettes.
- **decay** — ChordTrack stops firing new stabs but existing voices are allowed to tail out naturally. Reverb boost applies; no release extension. Used by "band winding down" palettes where the last chord hit organically rings out.

---

## 5 · Implementation plan

### 5.1 New functions

| Module | Function | Description |
|---|---|---|
| melody.js | `MelodyEngine.windDown(beatTime, durationBeats, exitType)` | Kills legato voice, clears motif state, triggers melody exit behavior |
| sequencer.js | `PadTrack.windDown(beatTime, durationBeats, releaseMult, reverbBoost)` | Triggers pad freeze + extended release |
| sequencer.js | `ChordTrack.windDown(beatTime, durationBeats, exitType, releaseMult, reverbBoost)` | Stops pattern firing; applies mute/hold/decay per palette |
| sequencer.js | `WalkingBass.setDecayMode(holdBeats)` | Forces tier 0 + extended note duration |
| state_mapper.js | `StateMapper.startCycleDecay(beatTime)` | **Modified** — reads `palette.decay`, dispatches wind-down calls, schedules gain ramps |
| harmony.js | `PALETTES[n].decay` | New per-palette decay profile (×10), now includes `chordExit` |

### 5.2 Modification to startCycleDecay

**Current code gap:** `StateMapper.startCycleDecay` (state_mapper.js ~line 232) currently schedules only hardcoded gain ramps (melody=0 bars, pad/perc=4, snare/bass=8, hat=12). It does not read palette data at all. This build must add a palette lookup at the top of the function and use the palette's `decay` profile to tune the dispatch.

The new version:

1. Reads `HarmonyEngine.getPalette().decay` profile on entry
2. On the first beat, triggers musical simplifications (wind-down calls) at their scheduled bar offsets — dispatching MelodyEngine, PadTrack, ChordTrack, WalkingBass with their palette-specific parameters
3. Then schedules the gain ramps at their existing bar offsets (which are now the *fade* portion, after simplification has already started). Ramp timings remain hardcoded per SPEC_008 §3; palette data only tunes the *behavior* during simplify, not the 16-bar envelope.

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

### 6.8 Legato voice lifecycle (#44)

The melody legato system (SPEC_032 §5, #39/#44 bugfixes) persists an oscillator + gain + filter chain between notes when the palette has `legato: true` (noir_jazz, vaporwave, synthwave, lo_fi_chill). Known failure mode from #44: firing a new note onto a dead legato chain re-triggers the LPF envelope from peak and produces a brittle pop.

`MelodyEngine.windDown()` generates new descent notes on entry. Without an explicit legato teardown, this triggers #44's exact failure pattern — worse, because the decay arc runs on the most-watched moment of the song.

**Required:**
- `windDown()` must call `_killLiveVoice()` as its very first action, before any note is scheduled.
- The `_phraseEntry = true` flag (set by the #44 fix for phrase-start notes) must also be set on the first descent note so the LPF starts at base, not peak.
- Once wind-down is active, the melody's `tick()` path should short-circuit before any new-note generation — wind-down owns the voice until decay ends.

### 6.9 Motif state lifecycle (SPEC_036)

MelodyEngine's motif system (`_motif`, `_phrIdx`, `_antecedentOpening`, `_variationUseCounts`) represents the current cycle's melodic DNA. If decay ends with a non-null motif, the next rebuild phase (SPEC_008 §4) would either resume that motif (wrong — it's a new cycle) or replace it (fine, but with a fleeting window of stale state on the first rebuild tick).

**Required:**
- `windDown()` clears motif state on entry (`_motif = null`, `_phrIdx = 0`, `_antecedentOpening = null`, `_variationUseCounts = {}`).
- The descent phrase during wind-down is generated directly by the forced-descending Markov path, not by `_applyVariation` or `_generateMotif` — those are dormant during wind-down.
- `resetRun()` and the rebuild-phase motif regen (existing behavior) still run normally on the next cycle.

---

## 7 · Build issues

**Single build session.** All changes are tightly coupled: conductor dispatches wind-down calls, each instrument module implements its exit behavior, StateMapper integrates the scheduling, palette profiles tune the feel. No testable intermediate state (melody wind-down without bass wind-down sounds broken).

**One issue:**
- **#30 Post-Maelstrom theatrical decrescendo — wind-down behaviors + per-palette decay profiles** (Opus)

Scope (post-audit): ~50 edits across conductor.js (dispatch logic, 2 edits), melody.js (windDown with legato kill + motif reset, ~10 edits), sequencer.js (PadTrack.windDown + ChordTrack.windDown + WalkingBass.setDecayMode, ~15 edits), state_mapper.js (startCycleDecay palette lookup + dispatch, ~5 edits), harmony.js (×10 palette decay profiles including chordExit, ~15 edits — mostly data), config.js (optional constants).

At the edge of single-session budget (~50 > ~40 guideline) but tightly coupled and not splittable — any partial build produces broken intermediate state. The data-heavy portions (10 palette objects × 6 fields = 60 property additions) are low risk since they're flat object-literal additions, not logic. Logic edits total ~30 and fit comfortably.

---

## 8 · Acceptance criteria

1. **Musical exit is audible** — melody plays a final phrase before silence, not just volume fade
2. **Per-palette personality** — glitch decay sounds abrupt and choppy, ambient_dread dissolves into reverb, noir_jazz winds down like a club closing
3. **Bass simplifies** — no walking bass patterns during decay, just root notes
4. **Drums simplify before fading** — half-time feel, no fills, no ghost notes
5. **Pad rings out** — extended release creates a reverberant tail during decay
6. **ChordTrack exits cleanly** — pattern stops, exit style matches palette (mute/hold/decay); no ChordTrack stabs fire during gain fade
7. **No legato pop** — noir_jazz / vaporwave / synthwave / lo_fi_chill enter wind-down without triggering #44's LPF-burst pop on the first descent note
8. **Motif cleared cleanly** — next cycle's rebuild starts with fresh motif state (verified by inspecting `_motif` after decay → bridge → rebuild)
9. **16-bar total envelope preserved** — decay still takes exactly 16 bars (SPEC_008 contract unchanged)
10. **Bridge/rebuild unaffected** — all wind-down states are cleared before bridge
11. **Same seed reproducibility** — decay behavior is deterministic (no randomized exit phrases)
12. **No regression** — cycle mode, phase progression, stagger, tension all work correctly
13. `npm run gate` passes

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
