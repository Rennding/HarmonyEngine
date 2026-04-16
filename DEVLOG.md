# DEVLOG — HarmonyEngine Project History

<!-- 
  This file is for YOU (Aram). Claude writes entries here at the end of each session,
  but never reads it at session start. It's your project diary.
  
  Format: reverse chronological (newest first).
-->

---

## 2026-04-17 — #29 Build: Per-palette Storm/Maelstrom personality

**What:** Implemented per-palette bass personality at Storm/Maelstrom. Added three new fields to each palette's bass config: `tierCap` (caps WalkingBass complexity — only noir_jazz gets full tier 4 walking), `gainScalar` (chiptune 0.7×, ambient_dread 1.2×, etc.), and `phaseFilter` (per-phase lowpass cutoff overrides for Storm/Maelstrom). Modified `WalkingBass._tier()` to accept a cap parameter with console logging when capped. Added `_activePalette` module-scope variable in sequencer.js for `_synthBass()` access to gain scalar and phase filter. FM modulation character preserved for dark_techno/glitch.

**Files:** harmony.js (×10 palette bass sections), sequencer.js (_tier, getNote, _synthBass, _activePalette var), INDEX.md
**Awaiting QA:** #29

---

## 2026-04-17 — #27 Build: Tension curve randomization

**What:** Implemented the TensionMap system. Songs now modulate DC with plateaus (freeze), spikes (false climaxes), and retreats (breath/dip) generated deterministically from the song seed. Each palette has a unique tension profile tuning density, retreat depth, spike height, and plateau bias. Plateaus freeze DC for 16–32 beats with easeOut lerp back. Spikes are capped to prevent skipping more than 1 phase. Retreats clamp at DC≥0. Tension is suppressed during manual phase override and cycle transitions, and regenerated on palette swap.

**Files:** config.js (CFG.TENSION), state.js (TensionMap + updateDC integration + resetRun wiring), harmony.js (×10 tension profiles), conductor.js (suppression + regeneration), INDEX.md
**Awaiting QA:** #27

---

## 2026-04-17 — #28 Plan: Per-palette Storm/Maelstrom personality

**What:** At Storm/Maelstrom, the WalkingBass engine plays the same jazz-like walking pattern across all 10 genres — worst in chiptune where a bright pulse wave walks like an upright bass at full volume. Designed a per-palette bass personality system with three knobs: tier cap (limits which WalkingBass complexity tiers a palette can reach — only noir_jazz gets full walking bass), gain scalar (tames bright timbres like chiptune at 0.7×, boosts subby ones like ambient_dread at 1.2×), and phase filter envelope (tighter lowpass at Storm/Maelstrom to prevent spectral buildup). Each palette now has genre-appropriate high-intensity bass behavior.

**Spec:** `SPEC_028_PALETTE_STORM_PERSONALITY.md`
**Build issue:** #29 (Opus, ~25 edits, single session)

---

## 2026-04-16 — #11 Plan: Tension curve randomization

**What:** Designed the TensionMap system. Currently DC follows a pure monotonic power curve — every listen at the same BPM/palette has the identical emotional arc. The spec adds a tension layer on top: plateaus (DC freezes for 16–32 beats), false climaxes (DC spikes into the next phase then retreats), and brief retreats (DC dips 10–20%, creating a "breath"). Events are generated per-song from the seeded PRNG, so same seed = same profile. Each palette gets a tension tuning profile — ambient_dread favors long plateaus, glitch is chaotic with frequent spikes, dark_techno has sharp spikes but fewer events. Suppressed during manual phase override and cycle transitions.

**Spec:** `SPEC_011_TENSION_CURVE_RANDOMIZATION.md`
**Build issue:** #27 (Opus, ~30 edits, single session)

---

## 2026-04-16 — #26 Build: Staggered phase transitions

**What:** Implemented PhaseStagger scheduler. Phase transitions now spread instrument entries over several beats instead of everything hitting at once. Each genre has its own timing profile (techno=4 beats, ambient=12 beats, chiptune=2 beats). Refactored `_onPhaseChange` into 4 group dispatch functions (rhythm, harmony, texture, melody). Added `_effectiveFloor` mechanism so `_updateLayers` respects stagger state. Downward transitions reverse group order. Cycle mode bypasses stagger entirely. Rapid phase changes cancel active stagger cleanly.

**Files:** config.js, harmony.js (10 palettes), state_mapper.js (major refactor), conductor.js
**Awaiting QA:** #26

---

## 2026-04-16 — #25 QA Pass: Cycle mode UI + polish

---

## 2026-04-16 — #10 Plan: Staggered phase transitions

**What:** Designed the stagger system for phase transitions. Currently all subsystems fire on the same beat when phase changes — drums, bass, pads, melody all snap at once. The spec introduces a PhaseStagger scheduler that spreads subsystem activations over a configurable beat window. Four stagger groups (rhythm → harmony → texture → melody) fire at per-palette offsets. Dark techno staggers over 4 beats, ambient dread drifts over 12. Manual phase forcing still staggers. Cycle mode bypasses it. Downward transitions reverse the group order.

**Spec:** `SPEC_010_STAGGERED_PHASE_TRANSITIONS.md`
**Build issue:** #26 (Opus, ~35 edits, depends on #25 QA pass)

---

## 2026-04-16 — #9 Build: Song identity — seed display + shareable URL

**What:** Each song now has a visible seed in the status bar and a shareable URL. Pressing PLAY writes `?seed=XXXXX&palette=N` to the browser address bar via `history.replaceState`. Loading that URL and pressing PLAY replays the same song (same PRNG sequence, same palette, same BPM curve). `resetRun()` now accepts an optional `seedOverride` param; `Conductor.start()` passes it through. URL palette param pre-selects the dropdown on load if the user hasn't changed it.

**Files changed:** src/state.js, src/conductor.js, src/shell.html

---

## 2026-04-16 — #25 Build: Cycle mode UI + polish

**What:** Wired all Cycle Mode UI signals. The conductor:beat event already emitted cycleState + nextPalette from #23/#24 — this session connects those to the interface. Palette status bar now shows "synthwave → noir_jazz" format during transitions. Phase pills gain a teal "Cycle" pill and all other pills grey out + become unclickable during transitions. Force phase is gated on `Conductor.getCycleState()`. Combo/intensity sliders dim (opacity + pointer-events:none) during decay/bridge/rebuild. Cycle state label appears inline next to the checkbox. All controls restore to normal after rebuild.

**Files changed:** shell.html

---

## 2026-04-16 — #24 Build: Cycle mode track gain choreography

**What:** Instruments now fade in/out smoothly during Cycle mode transitions. Decay phase: arp+melody → pad+perc → snare+bass → hat, each group over 4 bars, all ramps pre-scheduled via `linearRampToValueAtTime` from the beat clock time. Rebuild reverses the order. Kick protected at full gain throughout. StateMapper suppressed (`_cycleFrozen`) during transitions to prevent layer logic fighting the scheduled ramps. Fixed a subtle bug: `StateMapper.initRun()` on palette swap (bridge beat 1) was clearing the freeze flag — re-freeze now applied immediately after.

**Files changed:** state_mapper.js (startCycleDecay, startCycleRebuild, endCycleRebuild, _cycleFrozen flag), conductor.js (beatTime threading through cycle transitions, freeze re-apply after palette swap initRun).

---

## 2026-04-16 — #23 Build: Cycle mode core engine

**What:** Conductor cycle state machine — `playing → decay → bridge → rebuild → playing`. Engine automatically transitions between palettes after Maelstrom sustain expires (randomized 8–32 bars). Palette swap happens on kick-only bridge, subsystems re-init without resetting beat clock or audio graph. Rebuild enters at Surge for continuous radio flow.

**Files changed:** conductor.js (major rewrite — cycle state machine + all transition logic), config.js (CFG.CYCLE constants), state.js (G.settings.cycleMode).

**QA #22 (auto BPM bug):** Passed, closed.

**Test via console:** `Conductor.setCycleMode(true)` then play. Listen for Maelstrom sustain → instruments strip away → kick-only bridge → new palette layers in. Track gain choreography is #24 (separate session).

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
