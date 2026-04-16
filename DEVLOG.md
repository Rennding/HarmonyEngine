# DEVLOG — HarmonyEngine Project History

<!-- 
  This file is for YOU (Aram). Claude writes entries here at the end of each session,
  but never reads it at session start. It's your project diary.
  
  Format: reverse chronological (newest first).
-->

---

## 2026-04-16 — #8 Plan: Cycle mode / radio station

**Design decisions:**
- **Transition:** Musical bridge — instruments strip away in reverse-phase order over 16 bars, 4-bar kick-only bridge, new palette layers back in over 16 bars. Single audio graph, no resource doubling.
- **Song arc:** Full Pulse→Maelstrom with randomized Maelstrom sustain (8–32 bars) before rotation.
- **Palette sequence:** Weighted recency (existing logic). Palette lock = same genre, new seed.
- **Rebuild starts at Surge** — skipping Pulse/Swell avoids a 30+ bar sparse gap mid-radio.

**Spec:** `SPEC_008_CYCLE_MODE.md`

**Build chain:** #23 core engine (Opus) → #24 gain choreography (Sonnet) → #25 UI (Sonnet). Sequential — model mismatch + dependency chain.

Next: #23 build-session — Cycle mode core engine + state machine.

---

## 2026-04-16 — #7 QA pass

BPM override slider passed QA. Slider adjusts tempo mid-playback, Auto restores palette default.

Pre-existing bug found: Auto BPM always starts at 120 regardless of palette — the palette's `bpmRange` isn't being applied. Filed as #22 (P2, not a regression from #7).

Next: #8 plan-session — Cycle mode / radio station.

---

## 2026-04-16 — BPM override slider (#7)

**What happened:**
- Added BPM slider (60–200) and "Auto BPM" checkbox to Transport panel in shell.html
- `Conductor.setBPM(bpm)` — clamps to 60–200, writes to `G.settings.bpmOverride` and `G.bpm` (takes effect on next beat, since beat clock reads `G.bpm` dynamically)
- `Conductor.setAutoBPM()` — clears `G.settings.bpmOverride` so next `resetRun()` uses palette/mood BPM
- `resetRun()` applies `bpmOverride` after palette BPM is computed (both the HarmonyEngine and fallback paths)
- Beat event handler syncs slider position to actual BPM in Auto mode
- Moving the slider unchecks Auto; checking Auto restores "Auto" label and calls `setAutoBPM()`
- BPM override persists across Stop/Play cycles; Auto mode restores natural palette BPM on next play
- Gate passes.

---

## 2026-04-16 — Palette lock (#6)

**What happened:**
- Added `Conductor.lockPalette(idx)` and `Conductor.unlockPalette()` — writes to `G.settings.palette` (0=random, 1..N=locked)
- `_selectPalette()` already read `G.settings.palette` but nothing wrote to it — now the lock path is wired up
- Removed the old `paletteOverride` parameter from `Conductor.start()` and the `window._selectPalette` monkey-patch hack
- `doPlay()` in shell.html now calls `lockPalette`/`unlockPalette` before `start()`
- Initialized `G.settings.palette = 0` in state.js (was missing, would have been `undefined`)

**Result:** Dropdown selection persists across stop/start. Lock survives pause/resume. Random mode works as before. Gate passes, 380.1 KB.

**Files changed:** `src/conductor.js`, `src/shell.html`, `src/state.js`

---

## 2026-04-16 — Source file rename (#5)

**What happened:**
- Renamed 9 `src/` files — dropped all numeric prefixes (e.g. `03_audio.js` → `audio.js`, `03c_bullet_voice.js` → `voice_pool.js`)
- Updated `build.js MODULE_ORDER` to match new names
- Updated `INDEX.md` file references throughout
- Updated `CLAUDE.md §5` file structure table

**Note:** Pure rename, zero logic changes. Gate passes, 379.9 KB build.

**Files changed:** `src/` (9 renames), `build.js`, `INDEX.md`, `CLAUDE.md`

---

## 2026-04-16 — Vocabulary rename (#4)

**What happened:**
- Renamed all game-origin state fields: `G.combo` → `G.intensity`, `G.hp` → `G.energy`, `G.grazeStreak` → `G.nearStreak`, `G.beatsSinceHit` → `G.beatsSinceImpact`
- Renamed class `BulletVoicePool` → `VoicePool`, file `src/03c_bullet_voice.js` still pending #5
- Renamed functions: `simulateHit()` → `triggerHit()`, `simulateGraze()` → `triggerNearEvent()`, `playHitSFX()` → `playImpactSFX()`, `playGrazeSFX()` → `playNearSFX()`
- Updated shell.html button labels to match
- Updated INDEX.md symbol names throughout

**Status:** qa-pass

---

## 2026-04-16 — Dead code removal (#3)

**What happened:**
- Deleted 8 no-op stub functions from `state.js` (`loadHighScore`, `saveMeta`, `loadSettings`, etc.)
- Removed 3 game-only G fields from declaration and `resetRun()`: `attunement`, `perkPaused`, `iframeUntil`
- Removed `grazesLifetime` and `meta.unlocked` / `meta.achievements` (game-only, never read by audio)
- Deleted entire `CFG.PERKS` block from `config.js` (~23 lines)
- Removed all 4 `PerkAudioEngine` dead branches from `03d_state_mapper.js` and its `initRun` call from `state.js`
- Updated stale comments in `03g_narrative.js` referencing the removed engine

**Note:** `G.perks` kept — `StateMapper` still reads it for overdrive perk detection (future-compatible array, always `[]` standalone).

**Files changed:** `src/state.js`, `src/config.js`, `src/03d_state_mapper.js`, `src/03g_narrative.js`, `INDEX.md`

---

## 2026-04-16 — Foundation: AudioContext lifecycle + gate script (#1 + #2)

**What happened:**
- Fixed AudioContext lifecycle: Stop now suspends the context (not abandons it); Start resumes it and waits for `running` state before the beat clock begins. Single context reused across all play/stop cycles — no leaks, no silent failures from browser context limits.
- Fixed autoplay policy: `initAudio()` now calls `resume()` if the context already exists but is suspended. `Conductor.start()` chains `startBeatClock` off the resume promise so scheduled times are valid from beat 1.
- Rewrote `npm run gate`: replaced the broken `node --check dist/index.html || true` with (1) `vm.Script` syntax check on the raw concatenated JS before HTML injection, (2) smoke test that verifies CFG, G, Conductor, HarmonyEngine, Sequencer are defined after top-level eval. Failures now exit loudly.

**Files changed:** `src/03_audio.js`, `src/conductor.js`, `build.js`, `package.json`

**What's next:** #3 dead code purge (stubs, vestigial G fields, CFG.PERKS)

---

## 2026-04-16 — Extraction & Pipeline Setup

**What happened:**
- Extracted all 11 audio modules from DemoShooter verbatim (03_audio.js through 03g_narrative.js)
- Created config.js (audio-only constants from 01_config.js) and state.js (virtual game state replacing 02_state.js)
- Built Conductor module — virtual game loop that drives phase progression, combo ramp, and musical events autonomously
- Created standalone HTML UI with: FFT ring visualizer, palette picker, phase override pills, combo/volume sliders, transport controls
- Set up build system (build.js concatenates src/ → dist/index.html), dev server (localhost:3001), package.json
- Populated portable project pipeline (CLAUDE.md, INDEX.md, DEVLOG.md, spec template) adapted for HarmonyEngine-only development

**What's next:**
- Smoke test: build + run, verify all 10 palettes play through all 5 phases
- Fix any runtime errors from game-state references that weren't stubbed (StateMapper's PerkEffects* references most likely)
- First real feature: palette-lock mode, BPM override

**Decisions:**
- Copied audio modules verbatim — no refactoring during extraction. Changes come through the pipeline.
- Virtual Conductor replaces game loop: simulates combo ramp + DC progression so music evolves naturally.
- Separate repo planned (Rennding/HarmonyEngine) but not created yet.

---

<!-- Entries will appear above this line, newest first -->
