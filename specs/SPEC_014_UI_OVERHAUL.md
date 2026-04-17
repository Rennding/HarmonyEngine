# SPEC_014 — UI Overhaul (Tier 5)

**Status:** Confirmed
**Model:** Sonnet (mechanical — all work is DOM/CSS/event binding against established public APIs)
**Depends on:** None at the audio layer. Build A gates B and C.
**Supersedes:** #14, #15 (already absorbed), #16, #17
**Addresses:** Listener UI is dev-flavored and stale vs. current audio engine; no keyboard shortcuts; no mobile support.

---

## 1 · Problem summary

The current shell.html was built as a debug surface for an audio engine extracted from DemoShooter. It shows Beat / DC / Combo / Phase in a dev-facing status bar. The visualizer is a single purple ring regardless of palette. Phase is controlled via pill buttons that don't communicate progress. There's no keyboard interaction. Canvas is hardcoded 600×600 — unusable on mobile.

Since #14 was originally filed, the engine has added: ChordTrack (new instrument layer), cycle mode with decay/bridge/rebuild states, staggered phase transitions, tension-curve randomization (plateaus/spikes/retreats), melody motifs, and a dedicated D-key diagnostic panel (#42) which is now the proper home for deep dev info.

Two shifts this spec resolves:

1. The **main UI should be listener-facing**. Listeners see what genre is playing, what chord is under their ears, which instruments are active, and where the song is in its arc. Dev info moves behind a toggle; the diagnostic panel covers everything deeper.
2. The **app should work everywhere a listener expects music to work** — with keyboard shortcuts for transport control, and a mobile layout that fits a phone.

---

## 2 · Scope

Three build issues under one spec. Each is a single session, Sonnet-sized.

| Build | What | Deps | Edits |
|---|---|---|---|
| A | Listener UI rebuild + per-palette visualizer colors + dev toggle + cleanup | None | ~50 |
| B | Keyboard shortcuts + help overlay | A (new getters + layout) | ~20 |
| C | Responsive / mobile layout | A (final layout) | ~30 |

Build A must ship and QA-pass before B and C begin. B and C can run in any order after A.

---

## 3 · Build A — Listener UI rebuild

### 3.1 · New status display

Replaces the current status bar (`Beat / Phase / DC / BPM / Palette / Seed`).

**Top row — listener info:**

- **Palette name** — large, colored in `palette.colors.primary`. Updates on lock, random pick, and cycle transition ("Vaporwave → Noir Jazz" during bridge).
- **Current chord** — human-readable name (e.g. `Cm7`, `Bbmaj9`). Updates only on chord change (not every beat). Falls back to `—` when stopped.

**Middle row — phase track:**

- Horizontal 5-segment bar: Pulse · Swell · Surge · Storm · Maelstrom.
- A fill indicator tracks DC position across segments (continuous, smooth — DC is already continuous).
- Current phase segment highlighted in `palette.colors.accent`.
- **Tension plateau:** fill pauses (indicator visibly holds) — driven by `TensionMap.currentEvent(beat).type === 'plateau'`.
- **Tension spike:** fill overshoots briefly with a glow pulse — `type === 'spike'`.
- **Tension retreat:** fill dims and recedes — `type === 'retreat'`.
- **Cycle transition:** whole track dims; a small label ("↻ decay", "↻ bridge", "↻ rebuild") appears under the track. Cycle mode click-lock is preserved (existing behavior from SPEC_008).

**Bottom row — instrument dots + seed pill:**

- **Active instruments** — 7 dots with labels underneath: kick, hat, snare, bass, pad, chord, melody. Each lit when `StateMapper.getTrackGains()[track] > 0.05`. `perc`, `sfx`, `perk` are not shown to the listener.
- **Seed pill** — small monospace chip showing `seed: 12345`. Click-to-copy (writes current URL to clipboard).

### 3.2 · Per-palette visualizer colors

Adds `colors: { primary, accent, bg }` to each of the 10 palettes in `src/harmony.js` `PALETTES` (line 84):

| Palette | Primary | Accent | Bg |
|---|---|---|---|
| dark_techno | #ff1a1a | #330000 | #0a0505 |
| synthwave | #ff69b4 | #00d4ff | #0f0a15 |
| glitch | #00ff41 | #001a00 | #050a05 |
| ambient_dread | #4a0080 | #1a0033 | #08050f |
| lo_fi_chill | #ffb347 | #2d1b00 | #120d05 |
| chiptune | #00ff00 | #003300 | #050a05 |
| noir_jazz | #ffd700 | #1a1400 | #0f0d05 |
| industrial | #ff6600 | #1a0d00 | #100805 |
| vaporwave | #ff00ff | #00ffff | #0f050f |
| breakbeat | #ffff00 | #1a1a00 | #0f0f05 |

- Visualizer (shell.html draw loop line ~408) reads colors each frame via `HarmonyEngine.getPalette().colors`. Hardcoded `rgba(123, 43, 255, …)` and `#00ffcc` literals in the visualizer replaced with palette colors.
- **Smooth transition on palette change:** when the active palette changes, interpolate RGB between old and new primary/accent over 8 beats (reuses the `conductor:beat` event). Prevents visual snap.
- Listener UI chrome (palette name color, phase segment highlight, instrument-dot glow) all draw from the same palette color source.

### 3.3 · Dev toggle

- Checkbox in the Transport panel: **Dev**.
- When checked, reveals a collapsible row beneath the listener status display showing: DC (2 decimals), beatCount, last stagger group fired (`StateMapper._lastStaggerFire`), current tension event type, BPM mode (auto/manual), phase override state (auto vs forced).
- Persists in `localStorage.devMode` — survives reload.
- The D-key diagnostic panel (#42) is orthogonal and untouched.

### 3.4 · Cleanup

- Remove `Sim Hit` and `Sim Graze` buttons from the Conductor panel (shell.html ~lines 230–233). They are DemoShooter leftovers.
- Rename the `Conductor` panel heading to `Phase` (it no longer conducts anything else).
- Remove vestigial `phase-pills` row — replaced by the phase track above. Cycle-locked behavior moves to the new phase track (same semantics).

### 3.5 · New public getters

Added in this build:

- `HarmonyEngine.getCurrentChord()` → `{ name, numeral, quality }` — wraps `_currentChord`. Lightweight read; returns `null` when not running.
- `HarmonyEngine.getPaletteIndex()` → int or -1 — index into `PALETTES` of current palette, for keyboard nav (build B).
- `HarmonyEngine.getPaletteList()` → `[{ name, colors }]` array — for UI enumeration.
- `StateMapper.getTrackGains()` → shallow clone of `_lastTargetGains`. Used by the instrument-dot renderer.

INDEX.md rows added for all four.

### 3.6 · Acceptance (Build A)

1. All 10 palettes render with distinct primary + accent colors; visualizer, palette name, phase-segment highlight all match
2. Chord display updates only on chord change (verify via DevTools — no re-render every beat)
3. Phase track fills smoothly from Pulse → Maelstrom over a normal run; segment highlight matches `G.phase` at every moment
4. Tension plateau visibly pauses the fill; spike overshoots then returns; retreat dims and recedes
5. All 7 instrument dots light in the correct phase order (kick from Pulse; all 7 by Maelstrom)
6. Cycle mode: track dims and "↻ bridge" label shows during bridge phase; palette name shows "current → next"
7. Dev toggle reveals/hides dev row; `localStorage.devMode` persists
8. Sim Hit / Sim Graze removed; no JS errors on stop/play/pause
9. `npm run gate` passes
10. No audio regression (Build A is UI-only)

---

## 4 · Build B — Keyboard shortcuts

### 4.1 · Key map

| Key | Action |
|---|---|
| `Space` | Play/Pause toggle |
| `Escape` | Stop (or close help overlay if open) |
| `↑` / `↓` | Volume ±5% |
| `←` / `→` | Previous / Next palette — uses `getPaletteIndex()` + wraps through `getPaletteList()` |
| `1`–`5` | Force phase (1=Pulse, 2=Swell, 3=Surge, 4=Storm, 5=Maelstrom) |
| `0` | Auto phase |
| `M` | Mute toggle (volume→0 or restore) |
| `?` | Toggle help overlay |

### 4.2 · Implementation

- Single `keydown` listener on `document`.
- Guard: skip handler entirely if `e.target.tagName === 'INPUT'` or `SELECT` or `TEXTAREA` (preserves typing into BPM slider number field, seed input, etc.).
- `Space` default prevented (no page scroll).
- D-key (diagnostic panel, #42) must keep working — already registered separately, confirm no conflict.
- Every shortcut updates the matching UI control (slider position, select value, phase segment) so visible state stays in sync.
- Cycle-mode phase lock still applies: `1`–`5` and `0` are no-ops during cycle transition (same behavior as phase pills previously had).

### 4.3 · Help overlay

- Triggered by `?` key.
- Centered modal with semi-transparent backdrop.
- Lists the full key map in a two-column table.
- Styled with current palette colors (reads `HarmonyEngine.getPalette().colors`).
- Closes on `Escape`, `?`, backdrop click, or an `×` button.

### 4.4 · Acceptance (Build B)

1. All shortcuts fire correct actions
2. UI controls update visibly (slider moves, select changes, phase segment highlights)
3. D-key still opens the diagnostic panel
4. `?` toggles help overlay; `Escape` closes it
5. Typing in an input doesn't trigger shortcuts
6. No conflict with browser shortcuts (F5, Ctrl+R, DevTools)
7. `npm run gate` passes

---

## 5 · Build C — Responsive / mobile layout

### 5.1 · Canvas sizing

- Canvas width/height computed as `min(100vw - 40px, 600px)` on load.
- `window.resize` listener updates canvas + stored W/H + CX/CY vars (draw loop reads these, not hardcoded 600).
- `canvas.width` and `canvas.height` attributes updated (for pixel buffer), not just CSS (to avoid blur).

### 5.2 · Viewport + safe areas

- Meta: `width=device-width, initial-scale=1.0, viewport-fit=cover`.
- Body padding uses `env(safe-area-inset-*)` for iOS notched devices.

### 5.3 · Breakpoint @ 640px

- `.controls` grid → single column at ≤640px
- Transport and Phase panels stack vertically
- Slider thumbs enlarged to 28px via `::-webkit-slider-thumb` + `::-moz-range-thumb`
- Buttons: `min-height: 44px` (accessibility touch target)
- Phase track segments widen to fill row
- Instrument dots: smaller size, tighter spacing
- Status text reflows (palette name above chord instead of beside on narrow)

### 5.4 · Orientation

- Portrait preferred; landscape works without lock.
- At landscape on phones, controls scroll vertically below canvas (no side-by-side).

### 5.5 · Acceptance (Build C)

1. At 375px width: no horizontal scroll; visualizer fills width; all controls reachable with thumb
2. At 640px breakpoint: layout reflows to single column cleanly
3. At ≥900px: layout matches desktop spec from Build A
4. Landscape phone: no control overlap, no broken layout
5. Slider/button touch targets ≥44px on mobile
6. iOS safe area insets respected
7. `npm run gate` passes
8. No visual regression on desktop

---

## 6 · Critical files

| File | Build A | Build B | Build C |
|---|---|---|---|
| src/shell.html | ~40 edits (status rewrite, CSS, viz colors, dev toggle, cleanup) | ~20 edits (keydown, help overlay, CSS) | ~25 edits (media queries, resize handler, canvas CSS) |
| src/harmony.js | +3 getters + `colors` on 10 PALETTES | — | — |
| src/state_mapper.js | +1 getter (`getTrackGains`) | — | — |
| INDEX.md | +4 rows | — | — |

Not touched in any build: conductor.js, audio.js, melody.js, sequencer.js, config.js, state.js, diagnostic.js.

---

## 7 · Reused infrastructure

- `conductor:beat` CustomEvent payload already carries `beat, phase, dc, intensity, bpm, cycleState, nextPalette` — no additions needed
- `HarmonyEngine.getPalette()` returns the palette object (existing)
- `TensionMap.currentEvent(beat)` returns `{ type, startBeat, duration, magnitude }` (state.js ~140)
- `Conductor.getCycleState()` / `isCycleMode()` (conductor.js 198–203)
- `StateMapper._lastTargetGains` already updated on every ramp — just needs public wrapper
- `getAnalyser()` + fftSize=128 → existing 64-bin ring viz logic reused, only color source changes

---

## 8 · Out of scope

- Motif state display (MelodyEngine._motif / _phrIdx) — deferred until listener testing shows demand
- Waveform / scrubber / timeline — the engine is procedural-infinite, no timeline exists
- Theme customization — palette-driven colors are the theme system
- Touch gestures (swipe, pinch) — keyboard + taps only for v1
- Dark/light mode toggle — app is permanently dark

---

## 9 · Known risks

- Chord name formatting: `HarmonyEngine._currentChord.name` may include LaTeX-like symbols (`♭`, `♯`) — render with a monospace font that supports them, or normalize (`b`, `#`) in the getter
- Palette color interpolation across cycle transitions must blend both primary AND accent simultaneously, otherwise phase track briefly mismatches palette name color
- Mobile Safari: `::-webkit-slider-thumb` styling requires `-webkit-appearance: none` on the input
- Safe-area insets: must not introduce visible gutters on non-notched devices (`env()` fallback to 0)
