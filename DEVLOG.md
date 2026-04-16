# DEVLOG — HarmonyEngine Project History

<!-- 
  This file is for YOU (Aram). Claude writes entries here at the end of each session,
  but never reads it at session start. It's your project diary.
  
  Format: reverse chronological (newest first).
-->

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
