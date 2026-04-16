# HarmonyEngine Index
<!-- FORMAT: Module.Symbol → file:line · brief -->
<!-- LOOKUP: ctrl-F the symbol name -->
<!-- UPDATE: after any build session that adds/moves/removes symbols -->

## Addressing scheme
`[Module].[Symbol]` — e.g. `C.GAIN` = Config → GAIN object

Modules: **C**onfig · **S**tate · **A**udio · **H**armony · **T**wavetables · **Q**sequencer · **V**oice · **M**apper · **F**melody · **R**groove · **N**arrative · **D**conductor

---

## C · config.js — CFG constant

| Symbol | File | Line | Description |
|---|---|---|---|
| CFG | config.js | 3 | Root config object |
| CFG.BPM / BEAT_MS | config.js | 2–3 | Base BPM, computed beat ms |
| CFG.MOODS | config.js | 15 | Chill/Normal/Intense BPM values |
| CFG.DIFFICULTY | config.js | 22 | DC curves per mood |
| CFG.PHASES | config.js | 32 | Phase array: name, DC threshold |
| CFG.PHASE_FLOOR | config.js | 40 | Tracks always audible per phase |
| CFG.COMBO_LAYER_THRESHOLDS | config.js | 50 | Combo needed per track above floor |
| CFG.PHASE_FX | config.js | 60 | Per-phase additive FX |
| CFG.GAIN | config.js | 82 | Volume levels for all audio elements |
| CFG.VIZ | config.js | 132 | Visualizer constants |

---

## S · state.js — G state + PRNG + virtual conductor state

| Symbol | File | Line | Description |
|---|---|---|---|
| _songRng / _createSongRng | state.js | 3–14 | Mulberry32 seeded PRNG |
| G | state.js | 21 | Global mutable state |
| updateDC() | state.js | 66 | Difficulty coefficient engine |
| onPhaseChange() | state.js | 87 | Register phase-change listener |
| resetRun() | state.js | 102 | Initialize all subsystems for new run |

---

## A · 03_audio.js — Web Audio core

| Symbol | File | Line | Description |
|---|---|---|---|
| initAudio() | 03_audio.js | 129 | Builds full Web Audio graph |
| startBeatClock() | 03_audio.js | 419 | Chris Wilson lookahead scheduler |
| stopBeatClock() | 03_audio.js | 437 | Clears scheduler |
| _trackGains | 03_audio.js | 24 | Per-track gain nodes |
| _pumpTrackSidechains() | 03_audio.js | 478 | Per-track sidechain pump |
| playHitSFX() | 03_audio.js | 513 | Hit feedback SFX |
| playGrazeSFX() | 03_audio.js | 596 | 3-tier graze SFX |
| getAnalyser() | 03_audio.js | 401 | FFT analyser node |

---

## H · 03a_harmony.js — Harmonic engine

| Symbol | File | Line | Description |
|---|---|---|---|
| PALETTES | 03a_harmony.js | 83 | 10 genre palette objects |
| HarmonyEngine | 03a_harmony.js | 1214 | Chord/scale/voice-leading methods |
| PaletteBlender | 03a_harmony.js | 1862 | Maelstrom cross-palette interpolation |
| _selectPalette() | 03a_harmony.js | 1812 | Weighted recency palette picker |
| midiToFreq() | 03a_harmony.js | 78 | MIDI to Hz conversion |

---

## T · 03e_wavetables.js — Wavetable library

| Symbol | File | Line | Description |
|---|---|---|---|
| Wavetables | 03e_wavetables.js | 10 | 80 palette×role wavetable recipes |

---

## Q · 03b_sequencer.js — Sequencer + drums + bass + arp

| Symbol | File | Line | Description |
|---|---|---|---|
| Sequencer | 03b_sequencer.js | ~1968 | Main sequencer object |
| PadTrack | 03b_sequencer.js | 764 | Pad/chord track |
| ArpTrack | 03b_sequencer.js | 945 | Monophonic arp |
| WalkingBass | 03b_sequencer.js | ~1251 | Dynamic bass pitch engine |

---

## V · 03c_bullet_voice.js — Voice pool

| Symbol | File | Line | Description |
|---|---|---|---|
| VoicePool | 03c_bullet_voice.js | 7 | 16-voice polyphonic pool |

---

## M · 03d_state_mapper.js — State→Audio mapper

| Symbol | File | Line | Description |
|---|---|---|---|
| StateMapper | 03d_state_mapper.js | 6 | Maps virtual state to audio params |

---

## F · 03f_melody.js — Melody engine

| Symbol | File | Line | Description |
|---|---|---|---|
| MelodyEngine | 03f_melody.js | 6 | Markov melody generator |

---

## R · 03d_groove.js — Groove engine

| Symbol | File | Line | Description |
|---|---|---|---|
| GrooveEngine | 03d_groove.js | 14 | Swing, humanize, ghost-note probability |

---

## N · 03g_narrative.js — Narrative conductor

| Symbol | File | Line | Description |
|---|---|---|---|
| NarrativeConductor | 03g_narrative.js | 7 | Musical narrative state machine |

---

## D · conductor.js — Virtual conductor

| Symbol | File | Line | Description |
|---|---|---|---|
| Conductor | conductor.js | 6 | Virtual game loop driving all subsystems |
| Conductor.start() | conductor.js | ~60 | Start playback with optional palette |
| Conductor.stop() | conductor.js | ~72 | Stop all audio |
| Conductor.forcePhase() | conductor.js | ~90 | Override phase progression |
| Conductor.simulateHit() | conductor.js | ~100 | Simulate damage event |
