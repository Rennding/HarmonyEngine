# Harmony Engine

Procedural music station. Browser-based, Web Audio API, no samples. Generates infinite evolving songs in real time from 10 genre palettes.

Extracted from [DemoShooter](https://github.com/Rennding/DemoShooter1) — the procedural audio engine that made bullets into instruments, now standalone.

## Quick start

```
git clone https://github.com/Rennding/HarmonyEngine.git
cd HarmonyEngine
npm run dev
```

Open `http://localhost:3001`. No dependencies to install — pure vanilla JS.

## How it works

Every song is built from scratch using Web Audio API oscillators, noise shapers, and custom wavetables. No samples, no prerecorded audio. A beat clock drives everything — chord progressions, drum patterns, melody generation, and FX are all synthesized and sequenced in real time.

### Phase progression

Songs evolve through five phases, each adding instruments, FX depth, and compositional complexity:

**Pulse** → **Swell** → **Surge** → **Storm** → **Maelstrom**

Pulse is sparse — a kick and silence. Maelstrom is every voice firing, detuned, drenched in reverb. The Conductor drives phase advancement automatically based on time and intensity.

### Cycle mode

When a song reaches Maelstrom, it sustains for a randomized window (8–32 bars), then decays through a musical bridge — stripping instruments down to a lone kick — before rebuilding into a new palette starting at Surge. The result is an infinite radio station that transitions between genres musically.

### Palettes (10 genres)

`dark_techno` · `synthwave` · `glitch` · `ambient_dread` · `lo_fi_chill` · `chiptune` · `noir_jazz` · `industrial` · `vaporwave` · `breakbeat`

Each palette defines its own chord progressions, drum patterns, wavetable timbres, FX profiles, BPM ranges, and phase transition timing. Locking a palette loops it indefinitely; otherwise Cycle mode rotates through them.

### Staggered transitions

Phase changes don't snap — they stagger. Rhythm shifts first, then harmony, texture, and melody follow over a configurable beat window. Each palette has its own stagger profile (techno = tight, ambient = wide). The effect is a band shifting gears, not a switch flip.

## Controls

- **Play / Stop** — start or stop the engine
- **Palette selector** — choose a genre or leave on auto-rotate
- **Palette lock** — loop a single palette indefinitely
- **BPM slider** — override tempo independent of palette range
- **Phase buttons** — manually force phase transitions (still staggers musically)
- **Seed display** — current song seed, shareable via URL params

## Project structure

```
src/                    ← all edits happen here
  shell.html            ← HTML template with inline styles
  config.js             ← constants, palettes, phase config, gain table
  state.js              ← mutable engine state
  audio.js              ← AudioContext lifecycle, master gain, FX chain
  harmony.js            ← chord progressions, scale engine, voice leading
  wavetables.js         ← PeriodicWave recipes per palette × role
  groove.js             ← drum pattern generation
  sequencer.js          ← beat clock, lookahead scheduler
  voice_pool.js         ← oscillator voice management
  state_mapper.js       ← intensity → audio parameter mapping
  melody.js             ← melodic phrase generation
  narrative.js          ← musical storytelling (motifs, callbacks, variation)
  conductor.js          ← phase advancement, cycle mode state machine

scripts/
  dev-server.js         ← zero-dependency static server

build.js                ← concatenates src/ → dist/index.html
dist/                   ← build output (gitignored)
specs/                  ← design specs
```

## npm scripts

| Command | What it does |
|---------|-------------|
| `npm run build` | Concat build → `dist/index.html` |
| `npm run serve` | Dev server on `:3001` |
| `npm run dev` | Build + serve |
| `npm run validate` | Build + syntax check |
| `npm run gate` | Validate + tests |

## Build system

No bundler. `build.js` concatenates `src/*.js` modules in a fixed order into a single `dist/index.html`. Module order is defined in `build.js` → `MODULE_ORDER` — dependencies must come before dependents. The entire app ships as one HTML file.

## Tech stack

- **Web Audio API** — all synthesis, scheduling, and FX
- **HTML5 Canvas** — visualizer
- **Vanilla JavaScript** — no framework, no runtime dependencies
- **Node.js** — build script + dev server only

## Requirements

- Node.js 18+
- A browser with Web Audio support (all modern browsers)
- No npm dependencies

## Development

All source edits go in `src/`. Never edit `dist/` — it's rebuilt from source on every build.

After any change:

```
npm run gate
```

## License

All rights reserved.
