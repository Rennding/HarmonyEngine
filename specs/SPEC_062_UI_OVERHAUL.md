# SPEC_062 — Desktop UI Overhaul (egui, Windows v1)

**Status:** Draft — 2026-04-18
**Model:** Build A: Sonnet · Build B: Sonnet
**Supersedes:** Original #62 scope (Slint + mobile + store submission)
**Depends on:** Phase 2b complete (#81 merged, #82 pending QA)
**Umbrella:** new issue — replaces #62

---

## 1. Purpose

HarmonyEngine needs a functional desktop UI for daily personal use — listening, YouTube-style stream playback, and engine QA — built on the existing Rust core.

Two priorities:

1. **Usable .exe** on Windows, double-click to run, no installer, no runtime deps.
2. **Deep QA control surface** so parameter tweaks, feature-flag A/B tests, and bug-repro capture all happen inside the app without a code change or rebuild.

Android APK is explicitly out of scope for this SPEC — a separate P3 issue is parked for later.

---

## 2. Tech stack

- **`eframe` + `egui` 0.28** — pure-Rust immediate-mode GUI
- **`serde` / `serde_json`** — preset serialization
- **`crossbeam-channel`** — UI ↔ audio-thread messaging
- **`directories` 5** — platform-correct config path resolution
- **`winres` 0.1** (Windows build-dep) — embed `.exe` icon

Release build target: `cargo build --release` → `target/release/harmonyengine.exe` on Windows, `target/release/harmonyengine` on Linux. Self-contained; no DLL or shared-object dependencies beyond OS audio.

---

## 3. Architecture

Existing `rust/src/` engine modules are untouched. A new `rust/src-ui/` tree adds the UI layer and a bridge to the engine.

```
rust/
  src/            (existing — engine, untouched)
  src-ui/         (new)
    main.rs                eframe::run_native entry point
    app.rs                 App struct, update loop, tab routing, hotkey dispatch
    tabs/
      simple.rs            Simple tab widgets
      engineer.rs          Engineer tab widgets (collapsible sections)
      visualizer.rs        Inline + fullscreen visualizer
    widgets/
      knob.rs              Custom circular knob
      meter.rs             Peak / RMS level meter
      phase_indicator.rs   Top-bar beat + phase + cycle readout
    presets.rs             Load / save autosave + named + QA repro
    bridge.rs              UI ↔ AudioHost channel protocol
    shortcuts.rs           Keyboard map + action dispatch
    theme.rs               Minimal egui::Visuals customization
```

`bridge.rs` owns the `AudioHost`, exposes parameter setters, and pulls FFT + diagnostic frames via a small lock-free ring.

---

## 4. Simple tab

Controls the listener would use daily.

- Large play / pause button
- Palette grid — 10 buttons, currently active highlighted
- BPM slider (60–180), snap-to-mood option
- Mood selector (Chill / Normal / Intense)
- Phase override row (Pulse · Swell · Surge · Storm · Maelstrom · Auto)
- Master volume slider
- "New song" button (reseed + restart)
- Seed display + copy-to-clipboard button
- Visualizer on/off toggle + fullscreen button
- Quick-load preset dropdown (recent / starred)

---

## 5. Engineer tab

Collapsible sections, one per engine subsystem. ~55 parameters total. All changes take effect live (no restart).

### [Conductor]
- Cycle mode on/off
- Phase progression: Auto / Manual / Frozen
- Per-phase DC thresholds (5 sliders)
- Maelstrom sustain range (min/max bars)

### [Harmony]
- Palette recency decay strength
- Voicing profile override (any palette's style)
- Collision mode override
- Harmonic rhythm override (beats per chord)

### [Sequencer]
- Per-track gain scalars (drums · bass · chords · pad · melody)
- WalkingBass tier cap
- Chord rhythm pattern picker (8 patterns)

### [Melody]
- Variation weight sliders (repeat · transpose · invert · diminish · fragment)
- Interval affinity strength
- Phrase length min/max

### [Groove]
- Swing (0–100%)
- Humanize ms jitter
- Ghost note probability

### [Tension]
- Plateau frequency
- Spike magnitude
- Retreat depth

### [Diagnostic]
- Per-detector enable toggles (15)
- Master sensitivity
- Anomaly count display
- Open log viewer

### [2b-2 Flags] — QA essential
- VoicingEngine on/off
- HarmonicRhythm on/off
- WalkingBass next-chord on/off
- CadentialPlanning on/off
- LookaheadAllVoices on/off
- Master "Enable all 2b-2" toggle

All 2b-2 flags flip live — no restart, no rebuild. Listen to the difference in real time.

---

## 6. QA tooling (priority)

The SPEC owner has emphasized QA as a top priority. The following features exist specifically to shorten the QA loop between hearing a bug and reporting it with full context.

1. **Live A/B flag toggles** — every 2b-2 flag flips without restart.
2. **Diagnostic log viewer** — panel showing last 50 anomaly-detector entries with timestamp + single-click copy-to-clipboard.
3. **Always-visible top bar** — current beat number, phase, cycle state. Every screenshot carries this context automatically.
4. **Freeze beat** button (Ctrl+B) — pauses the beat clock so state can be inspected without the song advancing.
5. **Save QA repro preset** (Ctrl+Shift+S) — one click captures `{ seed, palette, all engineer-tab values, current beat, current phase, active 2b-2 flags }` into `qa-YYYYMMDD-HHMMSS.json`.
6. **Seed baked into every preset** — reloading any preset reproduces exact playback deterministically.
7. **"Copy state as JSON" button** — dumps full current state to clipboard. Paste alongside a screenshot in chat for full visual + data context.
8. **Baseline/delta indicator** — each control shows a dot when modified from default; per-section and global "reset to default".
9. **Recent-tweaks list** — last 10 parameter changes in this session, for recall when a bug appears after tweaking.

---

## 7. Preset system

- **Path:** `%APPDATA%\HarmonyEngine\presets\` (Windows), `~/.config/harmonyengine/presets/` (Linux) via `directories` crate
- **Format:** JSON via `serde_json`, one file per preset
- **Reserved filenames:**
  - `autosave.json` — current running state, written every 5 seconds
  - `default.json` — factory defaults
  - `qa-<timestamp>.json` — QA repro presets
- **Named presets:** user-chosen filename
- **Import:** drag any `.json` onto the window → load
- **Export:** menu → copy JSON to clipboard, or save to chosen path
- **Schema versioning:** top-level `"schema_version"` field, loader tolerates missing fields

---

## 8. Visualizer

- **Inline mode:** ~80px strip at top of Simple tab
- **Fullscreen mode:** fills the window; controls auto-hide after 3s idle; reappear on mouse move
- **Hotkeys:** `F` enter fullscreen · `Esc` exit fullscreen · `V` toggle on/off
- **Render:** egui `Painter` for Build A scope; richer wgpu shader pass deferred to a later polish pass if needed
- **FFT source:** audio thread exposes a small lock-free ring of FFT frames; UI pulls at frame rate

Specific visual design deferred to Build A execution — goal is "readable + pleasant for OBS capture," nothing more.

---

## 9. Keyboard shortcuts

Cleaner set than the old `shell.html` bindings:

| Key | Action |
|---|---|
| Space | Play / Pause |
| N | New song (reseed) |
| ← / → | Previous / next palette |
| 1–5 | Force phase 1–5 |
| 0 | Auto phase |
| ↑ / ↓ | Volume +/- |
| M | Mute |
| V | Visualizer on/off |
| F | Fullscreen visualizer |
| Esc | Exit fullscreen |
| Tab | Switch Simple / Engineer |
| Ctrl+S | Save preset (name dialog) |
| Ctrl+O | Open preset |
| Ctrl+Shift+S | Save QA repro preset |
| Ctrl+B | Freeze beat |
| ? | Shortcut cheat sheet |

---

## 10. Build split

### Build A — Scaffold + Simple tab + presets + visualizer + shortcuts

Delivers a usable `.exe` on its own. User can already listen, stream, save/load presets after Build A ships. Estimated ~30 edits.

**Acceptance:**

1. `cargo run --release` launches a window on Windows.
2. Simple tab: every listed control is functional; pressing play produces audio.
3. Inline + fullscreen visualizer render; `F`/`Esc` toggle works; `V` toggles on/off.
4. All Simple-tab-relevant keyboard shortcuts work.
5. Preset system: autosave runs; named save+load round-trips across restart; seed is preserved.
6. `cargo build --release` emits `target/release/harmonyengine.exe` that runs on a clean Windows machine with no runtime dependencies.
7. No regression in Phase 2b-1 / 2b-2 CLI parity — `--enable-2b2` still works and produces byte-identical output to pre-UI runs.

### Build B — Engineer tab + parameter surface + QA tooling

Requires Build A shipped. Estimated ~30 edits.

**Acceptance:**

1. Engineer tab renders all 8 sections with live controls.
2. Every exposed parameter round-trips UI → engine with audible effect.
3. 2b-2 feature-flag toggles flip live and produce audible A/B difference.
4. Diagnostic log viewer shows last 50 anomaly entries with copy-to-clipboard.
5. QA repro preset captures + replays exact seed + state (beat-accurate is a stretch goal; state-accurate is mandatory).
6. Reset-to-default per section and globally both work.
7. Top bar shows beat / phase / cycle at all times.
8. Recent-tweaks list (last 10 parameter changes) visible in a side panel or menu.

---

## 11. Out of scope

- Android APK — separate P3 backlog issue
- iOS packaging
- macOS `.app` bundle (Windows + Linux only for now)
- Store submission (App Store, Play Store)
- Cloud sync, online preset sharing
- Custom wgpu shader visualizer (deferred to post-launch polish)
- Advanced theming beyond minimal readability

---

## 12. Dependencies (new, add to `rust/Cargo.toml`)

```toml
[dependencies]
eframe = "0.28"
egui = "0.28"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
crossbeam-channel = "0.5"
directories = "5"

[target.'cfg(windows)'.build-dependencies]
winres = "0.1"
```

---

## 13. Risks + mitigations

| Risk | Mitigation |
|---|---|
| UI ↔ audio thread parameter contention | `crossbeam-channel` bounded queue; all engine reads via `arc-swap` or atomic types; no locks on audio thread |
| FFT frame drop on slow UI | Ring buffer with drop-oldest policy; UI shows "lagging" indicator if frames missed |
| Preset schema drift across builds | Top-level `"schema_version"` field; loader tolerates missing fields; unknown fields logged and ignored |
| 2b-2 flag toggle mid-song causes audible glitch | Document as known; flag transitions happen on next beat boundary (use existing `plan_publisher` dispatch) |
| Visualizer CPU cost in fullscreen | Default inline mode disabled; fullscreen is opt-in; `request_repaint_after` used when visualizer off |
| Windows `.exe` triggers SmartScreen | Expected for unsigned binary; documented; code signing deferred |
