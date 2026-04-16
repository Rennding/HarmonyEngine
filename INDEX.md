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
| CFG.STAGGER_OVERRIDE | config.js | 129 | Override stagger profile (null = palette default) |
| CFG.STAGGER_DEFAULT | config.js | 130 | Fallback stagger profile when palette has none |
| CFG.CYCLE | config.js | 85 | Cycle mode timing constants (SPEC_008) |
| CFG.VIZ | config.js | 142 | Visualizer constants |

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

## A · audio.js — Web Audio core

| Symbol | File | Line | Description |
|---|---|---|---|
| initAudio() | audio.js | 129 | Builds full Web Audio graph |
| startBeatClock() | audio.js | 419 | Chris Wilson lookahead scheduler |
| stopBeatClock() | audio.js | 437 | Clears scheduler |
| _trackGains | audio.js | 24 | Per-track gain nodes |
| _pumpTrackSidechains() | audio.js | 478 | Per-track sidechain pump |
| playImpactSFX() | audio.js | 513 | Hit feedback SFX |
| playNearSFX() | audio.js | 596 | 3-tier near-event SFX |
| getAnalyser() | audio.js | 401 | FFT analyser node |

---

## H · harmony.js — Harmonic engine

| Symbol | File | Line | Description |
|---|---|---|---|
| PALETTES | harmony.js | 83 | 10 genre palette objects |
| HarmonyEngine | harmony.js | 1214 | Chord/scale/voice-leading methods |
| PaletteBlender | harmony.js | 1862 | Maelstrom cross-palette interpolation |
| _selectPalette() | harmony.js | 1812 | Weighted recency palette picker |
| midiToFreq() | harmony.js | 78 | MIDI to Hz conversion |

---

## T · wavetables.js — Wavetable library

| Symbol | File | Line | Description |
|---|---|---|---|
| Wavetables | wavetables.js | 10 | 80 palette×role wavetable recipes |

---

## Q · sequencer.js — Sequencer + drums + bass + arp

| Symbol | File | Line | Description |
|---|---|---|---|
| Sequencer | sequencer.js | ~1968 | Main sequencer object |
| PadTrack | sequencer.js | 764 | Pad/chord track |
| ArpTrack | sequencer.js | 945 | Monophonic arp |
| WalkingBass | sequencer.js | ~1251 | Dynamic bass pitch engine |

---

## V · voice_pool.js — Voice pool

| Symbol | File | Line | Description |
|---|---|---|---|
| VoicePool | voice_pool.js | 7 | 16-voice polyphonic pool |

---

## M · state_mapper.js — State→Audio mapper

| Symbol | File | Line | Description |
|---|---|---|---|
| StateMapper | state_mapper.js | 6 | Maps virtual state to audio params |
| StateMapper._resolveStagger | state_mapper.js | 719 | Resolve stagger profile (override→palette→default) |
| StateMapper.cancelStagger | state_mapper.js | 728 | Cancel active stagger queue |
| StateMapper._processStaggerQueue | state_mapper.js | 737 | Per-beat stagger queue processing |
| StateMapper._fireStaggerGroup | state_mapper.js | 756 | Fire single stagger group's subsystems |
| StateMapper._dispatchRhythm | state_mapper.js | 788 | Rhythm group dispatch (drums, groove, fills) |
| StateMapper._dispatchHarmony | state_mapper.js | 809 | Harmony group dispatch (chords, bass, modulation) |
| StateMapper._dispatchTexture | state_mapper.js | 842 | Texture group dispatch (FX, narrative, pad) |
| StateMapper._dispatchMelody | state_mapper.js | 853 | Melody group dispatch (melody, poly, blender) |
| StateMapper._fireAllGroups | state_mapper.js | 964 | Fire all groups synchronously (no stagger) |
| StateMapper._effectiveFloor | state_mapper.js | 24 | Per-track floor override during stagger |

---

## F · melody.js — Melody engine

| Symbol | File | Line | Description |
|---|---|---|---|
| MelodyEngine | melody.js | 6 | Markov melody generator |

---

## R · groove.js — Groove engine

| Symbol | File | Line | Description |
|---|---|---|---|
| GrooveEngine | groove.js | 14 | Swing, humanize, ghost-note probability |

---

## N · narrative.js — Narrative conductor

| Symbol | File | Line | Description |
|---|---|---|---|
| NarrativeConductor | narrative.js | 7 | Musical narrative state machine |

---

## D · conductor.js — Virtual conductor

| Symbol | File | Line | Description |
|---|---|---|---|
| Conductor | conductor.js | 5 | Virtual game loop driving all subsystems |
| _cycleState / _cycleBeats | conductor.js | 12–13 | Cycle mode internal state |
| _barsToBts() | conductor.js | 18 | Convert bars to beats (4/4) |
| _checkMaelstromSustain() | conductor.js | 21 | Check if sustain expired → enter decay |
| _onMaelstromEntry() | conductor.js | 30 | Set randomized sustain timer |
| _enterDecay/Bridge/Rebuild() | conductor.js | 38–60 | Cycle state transition functions |
| _exitCycle() | conductor.js | 62 | End rebuild → resume at surge |
| _doPaletteSwap() | conductor.js | 78 | Palette swap during bridge (§4) |
| _processCycleBeat() | conductor.js | 100 | Per-beat cycle state machine |
| _resetCycleState() | conductor.js | 153 | Reset all cycle state vars |
| Conductor.start() | conductor.js | 161 | Start playback with optional palette |
| Conductor.stop() | conductor.js | 176 | Stop all audio |
| Conductor.setCycleMode() | conductor.js | 198 | Toggle cycle mode on/off |
| Conductor.isCycleMode() | conductor.js | 202 | Read cycle mode state |
| Conductor.getCycleState() | conductor.js | 203 | Current cycle transition state |
| Conductor.forcePhase() | conductor.js | 221 | Override phase progression (locked during cycle) |
