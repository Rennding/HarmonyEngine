# SPEC_008 — Cycle Mode (Radio Station)

**Issue:** #8
**Model:** Opus (judgment — harmonic handoff, transition timing, decay choreography)
**Status:** Draft

---

## §1 · Overview

Cycle mode turns HarmonyEngine from a single-play demo into a continuous procedural radio station. When enabled, the engine automatically transitions between palettes after each song completes its full phase arc (Pulse → Maelstrom), creating an infinite stream of evolving music.

**Core mechanism:** Musical bridge transition. No dual audio graphs. No silence gaps. Instruments peel away in reverse-phase order, palette swaps on a kick-only bridge, new instruments layer back in.

---

## §2 · Song arc and rotation trigger

Each "song" runs the complete phase progression: Pulse → Swell → Surge → Storm → Maelstrom.

**Maelstrom sustain:** After entering Maelstrom, the song sustains for a randomized duration before the transition triggers:
- Minimum: 8 bars (32 beats at 4/4)
- Maximum: 32 bars (128 beats)
- Distribution: uniform random, chosen at Maelstrom entry via `_songRng`
- The sustain countdown is internal — no UI indicator of remaining bars (the surprise is the point)

**Trigger:** After the sustain period expires, the Conductor enters a new phase: `decay`. This is not a CFG.PHASES entry — it's a Conductor-internal state that drives the bridge transition.

---

## §3 · Decay phase — the musical bridge

The decay phase strips instruments in reverse order over ~16 bars (64 beats). Each instrument group fades its track gain to 0 over 4 bars, staggered:

| Bar range | Instrument(s) removed | Track gain ramp |
|---|---|---|
| 1–4 | arp, melody | Linear ramp → 0 |
| 5–8 | pad, perc | Linear ramp → 0 |
| 9–12 | snare, bass | Linear ramp → 0 |
| 13–16 | hat | Linear ramp → 0 |

After bar 16: only kick remains. Kick plays alone for 4 bars (the "bridge").

**FX during decay:** Reverb and delay tails are NOT cut — they decay naturally. Sidechain remains active on kick. This means the reverb wash from pad/melody lingers over the kick-only section, providing continuity.

**Intensity during decay:** Frozen at current value. DC stops advancing. The Conductor stops calling `updateDC()`.

---

## §4 · Palette swap (the handoff)

During the 4-bar kick-only bridge:

1. **Beat 1 of bridge:** Select next palette via `_selectPalette()` (respects palette lock and weighted recency)
2. **Beat 1 of bridge:** Generate new seed: `G.songSeed = paletteIdx * 10000 + Math.floor(Math.random() * 10000)`
3. **Beat 1 of bridge:** Call `HarmonyEngine.initRun(newPalette)` — new scale, root, chord progression
4. **Beat 1 of bridge:** Call subsystem `initRun()` for: Sequencer, VoicePool, NarrativeConductor, PaletteBlender, StateMapper
5. **Beat 1 of bridge:** If BPM override is null (auto), calculate new BPM from palette's `bpmRange`. Apply immediately — the beat clock reads `G.bpm` dynamically, so the tempo shift happens on the next beat.
6. **Do NOT call full `resetRun()`** — that resets beatCount, intensity, phase, listeners. Instead, a new `Conductor.cyclePalette(newPalette)` method handles the targeted re-init.

**What resets:** palette, seed, PRNG, harmony state, sequencer patterns, wavetables, narrative motif, groove config
**What persists:** beatCount (lifetime counter), audio graph, beat clock, cycle mode state, track gain nodes, FX chain, volume setting, BPM override setting

---

## §5 · Rebuild phase — new song emerges

After the 4-bar kick-only bridge, the Conductor enters `rebuild` state. Instruments layer back in following the normal Pulse → Swell → Surge layering, but accelerated:

| Bar range | Instrument(s) added | Track gain ramp |
|---|---|---|
| 1–4 | hat | 0 → target |
| 5–8 | snare, bass | 0 → target |
| 9–12 | pad, perc | 0 → target |
| 13–16 | arp, melody | 0 → target |

After bar 16: all instruments active. Phase is set to `surge`. Normal DC progression resumes from the surge threshold. The song continues its natural arc from Surge → Storm → Maelstrom.

**Why start at Surge, not Pulse?** Starting from Pulse after a full decay would create a 30+ bar sparse section (16 decay + 4 bridge + 16 rebuild + however long Pulse naturally lasts). That kills the radio flow. Starting at Surge means the new palette is fully alive within ~16 bars and the listener gets the richer half of the arc.

**Target gains during rebuild:** Track gains ramp to the levels dictated by the current phase's `PHASE_FLOOR` and `PHASE_FX` settings. StateMapper.update() handles this — the gain ramps in this spec are *additional* smooth transitions on top of StateMapper's normal behavior.

---

## §6 · Conductor state machine

New Conductor internal states for cycle mode:

```
playing → decay → bridge → rebuild → playing → ...
```

- `playing`: Normal phase progression (existing behavior). When Maelstrom sustain expires AND cycle mode is on, transition to `decay`.
- `decay`: 16 bars of instrument strip-down (§3). Beat clock continues. On completion → `bridge`.
- `bridge`: 4-bar kick-only. Palette swap happens on first beat (§4). On completion → `rebuild`.
- `rebuild`: 16 bars of instrument layering (§5). On completion → `playing` (phase = surge, DC resumes).

**If cycle mode is OFF:** Maelstrom sustains indefinitely (current behavior). Post-Maelstrom cosmetic names continue to display.

---

## §7 · Cycle mode toggle

New `G.settings.cycleMode` field. Default: `false`.

**UI:** A toggle/checkbox in the Transport panel, below the palette selector:
```
[x] Cycle Mode (Radio)
```

When toggled on mid-song: takes effect at next Maelstrom entry (doesn't interrupt current playback).
When toggled off mid-song: if currently in decay/bridge/rebuild, completes the current transition, then stays on the new palette indefinitely.

**API:**
- `Conductor.setCycleMode(bool)` — sets `G.settings.cycleMode`
- `Conductor.isCycleMode()` — returns current state

---

## §8 · Palette lock interaction

- **Cycle + palette locked:** Same palette, new seed each cycle. The song sounds different (different chord progression, root note, patterns) but stays in the same genre.
- **Cycle + palette random:** Weighted recency rotation. `_selectPalette()` already handles this — no changes needed.
- **Cycle off + any palette setting:** Current behavior. No rotation.

---

## §9 · UI updates during cycle

- **statPalette** (status bar): Updates to show new palette name after the bridge swap
- **New: "Next" indicator** during decay/bridge: Show the upcoming palette name in the status bar, e.g. `synthwave → noir_jazz`
- **Phase pills:** During decay/bridge/rebuild, the active pill should show a new `cycle` pill (or dim all pills) to indicate the engine is between songs. After rebuild completes and phase = surge, normal pill highlighting resumes.
- **Beat event:** `conductor:beat` custom event detail gets a new field: `cycleState` — one of `null`, `'decay'`, `'bridge'`, `'rebuild'`

---

## §10 · Edge cases

1. **User presses STOP during transition:** Immediate stop. Same as current behavior — `Conductor.stop()` kills beat clock, suspends context.
2. **User presses PAUSE during transition:** Pause works normally. Resume continues from the same point in the transition.
3. **User changes palette dropdown during transition:** The new lock/unlock takes effect on the NEXT cycle's palette selection, not the one currently being swapped in.
4. **BPM override toggled during bridge:** Applied immediately since beat clock reads G.bpm dynamically.
5. **Force Phase during transition:** Ignored. Phase pills are locked during decay/bridge/rebuild. Auto-phase resumes after rebuild.
6. **Intensity/combo sliders during transition:** Frozen during decay, applied after rebuild completes.

---

## §11 · Files likely touched

- `conductor.js` — cycle state machine, decay/bridge/rebuild logic, new API methods (~major)
- `state.js` — `G.settings.cycleMode`, new `cyclePalette()` helper or resetRun variant (~moderate)
- `config.js` — `CFG.CYCLE` timing constants (decay bars, bridge bars, rebuild bars) (~small)
- `shell.html` — cycle mode checkbox, status bar "Next" indicator, phase pill cycle state (~moderate)
- `state_mapper.js` — respect frozen intensity during decay, handle track gain ramps (~moderate)
- `audio.js` — per-track gain ramp utilities if not already sufficient (~small)

---

## §12 · Build issue breakdown

**Session 1 — Core cycle engine** (Opus)
Conductor state machine (§6), cyclePalette() method (§4), decay/bridge/rebuild beat counting (§3/§5), CFG.CYCLE constants, G.settings.cycleMode. The state machine and harmonic handoff require judgment calls.
~25 edits. Acceptance: engine cycles through palettes automatically with musical bridge. No UI yet — testable via console (`Conductor.setCycleMode(true)`).

**Session 2 — Track gain choreography** (Sonnet)
Per-track gain ramps during decay and rebuild (§3/§5), StateMapper freeze during decay, FX tail behavior. Mechanical — the ramp schedule is fully specified.
~15 edits. Acceptance: instruments fade out/in in correct order with no clicks or pops.

**Session 3 — UI + polish** (Sonnet)
Cycle mode checkbox (§7), status bar transition indicator (§9), phase pill cycle state, conductor:beat event extension. Mechanical wiring.
~15 edits. Acceptance: UI reflects cycle state, toggle works mid-song per §7 rules.

**Decision test:** Sessions 1+2 are tightly coupled — the state machine is useless without audible gain ramps, and gain ramps need the state machine to trigger them. But session 1 is Opus and session 2 is Sonnet → **model mismatch = split.**

Session 1 is testable via console (listen for the bridge, verify palette actually changes). Session 2 is testable by ear (smooth fades vs. hard cuts). Session 3 depends on both.

→ **3 sessions, sequential.**
