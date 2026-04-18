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
| CFG.TENSION | config.js | 132 | Tension curve randomization constants (SPEC_011) |
| CFG.STAGGER_OVERRIDE | config.js | 147 | Override stagger profile (null = palette default) |
| CFG.STAGGER_DEFAULT | config.js | 130 | Fallback stagger profile when palette has none |
| CFG.CYCLE | config.js | 85 | Cycle mode timing constants (SPEC_008) |
| CFG.VIZ | config.js | 142 | Visualizer constants |

---

## S · state.js — G state + PRNG + virtual conductor state

| Symbol | File | Line | Description |
|---|---|---|---|
| _songRng / _createSongRng | state.js | 3–14 | Mulberry32 seeded PRNG |
| TensionMap | state.js | 18 | Tension curve modulation system (SPEC_011) |
| TensionMap.generate() | state.js | ~55 | Build event array from PRNG + palette |
| TensionMap.getOffset() | state.js | ~110 | Per-beat DC offset (or plateau freeze) |
| TensionMap._capSpike() | state.js | ~130 | Cap spike to ≤1 phase skip |
| G | state.js | ~165 | Global mutable state |
| updateDC() | state.js | ~210 | Difficulty coefficient engine + tension integration |
| onPhaseChange() | state.js | ~245 | Register phase-change listener |
| resetRun() | state.js | ~250 | Initialize all subsystems for new run |

---

## A · audio.js — Web Audio core

| Symbol | File | Line | Description |
|---|---|---|---|
| initAudio() | audio.js | 180 | Builds full Web Audio graph (limiter → MediaStreamDestination → `<audio>`) |
| startBeatClock() | audio.js | 493 | Chris Wilson lookahead scheduler |
| stopBeatClock() | audio.js | 511 | Clears scheduler |
| _trackGains | audio.js | 24 | Per-track gain nodes |
| _pumpTrackSidechains() | audio.js | ~530 | Per-track sidechain pump |
| playImpactSFX() | audio.js | ~565 | Hit feedback SFX |
| playNearSFX() | audio.js | ~648 | 3-tier near-event SFX |
| getAnalyser() | audio.js | 470 | FFT analyser node |
| _mediaDest / _mediaElement | audio.js | 24–25 | MediaStream sink + hidden `<audio id="hePlayback">` — mobile background-audio routing |
| _attachMediaElement() | audio.js | 136 | Bind _mediaDest.stream to hidden audio element, autoplay/play() |
| _installVisibilityHandler() | audio.js | 162 | visibilitychange: resume ctx + clamp _nextBeatTime on tab return |

---

## H · harmony.js — Harmonic engine

| Symbol | File | Line | Description |
|---|---|---|---|
| PALETTES | harmony.js | 84 | 10 genre palette objects (each .bass has tierCap, gainScalar, phaseFilter — SPEC_028; noir_jazz also carries melody.restRange/maxPhraseLen/timbreWeights — #56) |
| HarmonyEngine | harmony.js | 1400 | Chord/scale/voice-leading methods |
| PaletteBlender | harmony.js | 2049 | Maelstrom cross-palette interpolation |
| _selectPalette() | harmony.js | 2000 | Weighted recency palette picker |
| midiToFreq() | harmony.js | 78 | MIDI to Hz conversion |

---

## T · wavetables.js — Wavetable library

| Symbol | File | Line | Description |
|---|---|---|---|
| Wavetables | wavetables.js | 10 | 80+ palette×role wavetable recipes (noir_jazz adds `melody_violin` + `melody_harmonica` pair — #56) |

---

## Q · sequencer.js — Sequencer + drums + bass + chords + arp

| Symbol | File | Line | Description |
|---|---|---|---|
| Sequencer | sequencer.js | 2161 | Main sequencer object |
| PadTrack | sequencer.js | 1018 | Pad/chord track |
| WalkingBass | sequencer.js | 1453 | Dynamic bass pitch engine (tierCap from palette — SPEC_028) |
| _CHORD_PATTERNS | sequencer.js | 1942 | 8 chord rhythm patterns (SPEC_032 §4) |
| ChordTrack | sequencer.js | 2001 | Rhythmic chord stabs/comps/arps per palette (SPEC_032 §4) |
| ChordTrack.onPhaseChange | sequencer.js | ~2145 | Harmony-group phase-entry gate: unmute at entryPhase (#35) |
| ChordTrack.tickStep | sequencer.js | ~2055 | Per-16th-note chord dispatch |
| ChordTrack._playStab | sequencer.js | ~2083 | Multi-voice chord stab synthesis |
| ChordTrack._playArpNote | sequencer.js | ~2115 | Single-voice arp note synthesis |

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
| MelodyEngine._motif/_phrIdx | melody.js | 25 | Motif state: seed motif, phrase index, antecedent cache (SPEC_036) |
| MelodyEngine._irState | melody.js | 32 | I-R state: lastInterval, gapFillRemaining, directionRun (SPEC_036 §5) |
| MelodyEngine._generateMotif | melody.js | 793 | Generate seed motif from Markov chain (SPEC_036 §3) |
| MelodyEngine._applyVariation | melody.js | 829 | Apply variation to motif: repeat/transpose/invert/diminish/fragment (SPEC_036 §3.6) |
| MelodyEngine._pickVariationType | melody.js | 892 | Pick variation type based on phase + palette weights (SPEC_036 §3.5) |
| MelodyEngine._contourBias | melody.js | 920 | Contour direction bias per phrase position (SPEC_036 §4) |
| MelodyEngine._irFilter | melody.js | 956 | I-R post-filter: gap-fill + direction closure probability modifier (SPEC_036 §5) |
| MelodyEngine._irUpdate | melody.js | 1007 | Update I-R state after note pick (SPEC_036 §5.3) |
| MelodyEngine._intervalAffinity | melody.js | 1035 | Per-palette interval affinity soft bias (SPEC_036 §7) |
| MelodyEngine._killLiveVoice | melody.js | 1295 | Kill persistent legato oscillator chain (SPEC_032) |
| MelodyEngine._playMelodyNote | melody.js | 1322 | Per-palette AHDSR + filter env + legato/staccato + PWM (SPEC_032) |
| MelodyEngine._liveOsc/Gain/Filter | melody.js | 30 | Legato state: persistent osc, gain, filter refs (SPEC_032) |
| MelodyEngine._currentPhraseTimbre | melody.js | 45 | Per-phrase wavetable role (#56 noir_jazz violin/harmonica) |

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
| _updateMediaSession() | conductor.js | 39 | MediaSession metadata + play/pause/stop handlers (mobile bg audio) |

---

## X · diagnostic.js — Audio diagnostic system (SPEC_042)

| Symbol | File | Line | Description |
|---|---|---|---|
| DIAGNOSTIC_VOCAB | diagnostic.js | 6 | 17-term shared QA vocabulary (key → label, description, technicalHint, freqRange) |
| NoteEventBus | diagnostic.js | 28 | Lightweight pub/sub for note-on/note-off timestamps |
| DiagnosticLog | diagnostic.js | 39 | Ring buffer (50 entries) + clipboard formatter |
| AnomalyDetector | diagnostic.js | 78 | Per-beat detector runner: 9 gain/voice/state detectors |
| DiagnosticPanel | diagnostic.js | 313 | DOM construction, D-key toggle, beat-driven update loop |

### Thin hooks added by SPEC_042

| Symbol | File | Description |
|---|---|---|
| VoicePool.activeCount() | voice_pool.js | Returns count of active voices |
| VoicePool.stealCount | voice_pool.js | Per-beat steal counter (reset by diagnostic) |
| getLimiterReduction() | audio.js | Returns _limiter.reduction for clip detection |
| StateMapper._lastTargetGains | state_mapper.js | Last target gain per track (written on ramp) |
| StateMapper._lastStaggerFire | state_mapper.js | { group, beat } after each stagger group fires |
| CFG.DIAGNOSTIC | config.js | All detector thresholds + per-detector enable flags |

---

## ⓡ · rust/ — Rust port (SPEC_057)

| Symbol (line) | File | Line | Description |
|---|---|---|---|
| Mulberry32 | rust/src/rng.rs | 16 | Byte-identical port of `_createSongRng` |
| BPM / beat_ms / Phase (41) / melody_density (120) / DC_SCALE (132) | rust/src/config.rs | 7 | Tempo + phase enum + DC constants + per-phase melody density + 15 diagnostic thresholds (#70) |
| Palette (201) / DrumPattern (28) / all_palettes (833) / palette_by_name (850) / select_palette (870) | rust/src/palette.rs | 28 | All 10 palettes + 18-variant DrumPattern + weighted-recency picker; DrumKit:69 BassConfig:81 MelodyConfig:122 GrooveConfig:151 (#69 #70) |
| TABLE_LEN (15) / Wavetable (18) / PaletteWavetables (97) | rust/src/wavetables.rs | 15 | Fourier recipe builders + per-palette dispatcher for all 10 palettes (#69) |
| Oscillator (12) / BiquadLowpass (46) / Envelope (123) / NoiseGen (231) / soft_clip (256) / PeakCompressor (268) / BrickwallLimiter (322) | rust/src/synth.rs | 12 | DSP primitives + master chain |
| Voice (16) / VoicePool (57) / render_voice (125) / NoteParams (133) / start_voice (146) | rust/src/voice_pool.rs | 16 | 16-voice pool + steal_oldest/steal_count (#70) |
| MINOR_PENTATONIC (12) / parse_numeral (25) / triad_intervals (56) / HarmonyEngine (64) / midi_to_freq (214) | rust/src/harmony.rs | 12 | Scale constants + chord stepper + voicing helpers |
| TensionEvent (29) / TensionOutput (45) / TensionMap (52) | rust/src/tension.rs | 29 | DC plateau/spike/retreat schedule (SPEC_011 port) |
| ChordTrack | rust/src/chord_track.rs | 60 | Four-on-the-floor chord stabs, 8-voice pool, AHDSR + LPF |
| PadTrack | rust/src/pad_track.rs | 66 | Sustained 3-osc unison pad, 16-voice pool, retrigger on chord change |
| MARKOV (34) / MelodyEngine (131) | rust/src/melody.rs | 34 | Markov pentatonic phrase + variation engine |
| TrackGains (29) / pattern_16 (97) / DrumVoice (258) / WalkingBass (389) / Sequencer (421) | rust/src/sequencer.rs | 29 | Drums + bass + chord/pad/melody dispatch + per-track gain mix bus |
| Conductor (25) | rust/src/conductor.rs | 25 | Beat clock + phase progression + tension DC + master chain (#69) |
| plan_publisher (126) / plan_generation (131) / force_publish_plan (138) | rust/src/conductor.rs | 126 | Per-beat plan publish + out-of-band force-publish (#81) |
| AudioHost | rust/src/audio.rs | 19 | cpal output stream + `--palette <name>` override (#69) |
| Plan (23) / PlanPublisher (86) | rust/src/plan.rs | 23 | RT-safe beat snapshot via arc-swap + monotonic generation counter (#68 #81) |
| DrumHit (21) / BassNote (30) / ChordStab (40) / PadRetrigger (50) / MelodyNote (58) | rust/src/voice_event.rs | 13 | Copy event enums w/ sample-indexed `time` + plan_generation flush tag (#68 #81) |
| RING_CAPACITY (24) / LOOKAHEAD_CAPACITY_BEATS (37) / RhythmRing (27) / HarmonyRing (46) / TextureRing (65) / MelodyRing (84) | rust/src/voice_ring.rs | 24 | Typed SPSC HeapRb wrappers, 4-beat lookahead-capable (#68 #81) |
| VoiceKind (37) / LookaheadBudget (61) / FlushDirection (102) / STAGGER_DOWN (113) / stagger_order (131) / FlushReport (140) / drain_rhythm_ring (175) / drain_melody_ring (198) / compose_drums_ahead (227) / compose_melody_ahead (264) | rust/src/workers.rs | 37 | Per-voice lookahead budgets + plan-flush protocol + drums/melody prototype composers (#81) |
| GrooveEngine | rust/src/groove.rs | 27 | Per-16th swing + humanize jitter + ghost-note prob, phase mults — port SPEC_018 §1 (#70) |
| NarrativeCue (65) / Motif (89) / NarrativeConductor (95) / generate_motif (390) / render_variation (436) | rust/src/narrative.rs | 65 | 4-note motif + variation cues per phase (#70) |
| DiagnosticEntry (96) / DiagnosticLog (114) / MasterSnapshot (209) / VoiceSnapshot (218) / AnomalyDetector (227) | rust/src/diagnostic.rs | 96 | 9+4 SPEC_042/SPEC_057 detectors + 2 Phase 2b-1 detectors (lookahead_fill/flush_latency) + 50-entry ring log (#70 #81) |

Phase 2a (#60) complete — per-voice threads + all 10 palettes. Phase 2b (#61): #81 flush protocol + drums/melody prototype done; #82 bass/chord/pad + SPEC_040/041 next.
