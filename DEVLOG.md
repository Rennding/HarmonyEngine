# DEVLOG — HarmonyEngine Project History

<!-- 
  This file is for YOU (Aram). Claude writes entries here at the end of each session,
  but never reads it at session start. It's your project diary.
  
  Format: reverse chronological (newest first).
-->

---

## 2026-04-18 — Rust migration Phase 1b — chord/pad/melody/tension/master chain — #66 built, awaiting QA

Phase 1b layers the missing musical voices onto the 1a foundation so `dark_techno` can finally hit AC#2 blind A/B parity. New modules: `tension.rs` (TensionMap with plateau/spike/retreat events feeding DC), `chord_track.rs` (four-on-the-floor stabs through an 8-voice pool with AHDSR + LPF), `pad_track.rs` (sustained 3-osc unison pad with retrigger on chord change, 16-voice pool, gated below Swell), `melody.rs` (Markov pentatonic phrase generator with five variation types — repeat/transpose/invert/diminish/fragment — chosen by per-phase weights). Sequencer grows a `TrackGains` mix bus (per-track gain coefficients with per-sample lerp) and per-phase floors via `TrackGains::for_phase`. Conductor wires the master chain (peak compressor → tanh soft-clip → brick-wall limiter → master gain) and applies tension offsets to the DC curve each beat. Palette extended with `melody_rhythm`, `motif`, and `tension` configs. Wavetables get a chord stab recipe (pulse 0.5/32 partials).

19 tests pass (added: tension empty/generate/spike-cap, melody constructs/markov-rows/fires-in-swell). `cargo build --release` clean, `cargo clippy --all-targets -- -D warnings` clean. JS engine still untouched. Phase progression Pulse→Maelstrom now audible end-to-end on dark_techno.

**Files changed:** rust/src/{tension,chord_track,pad_track,melody}.rs (new), rust/src/{config,palette,wavetables,harmony,synth,sequencer,conductor,lib}.rs (extended), INDEX.md (Rust block updated).

---

## 2026-04-18 — Rust migration Phase 1 foundation landed — #59 built, awaiting QA

Scaffolded `rust/` workspace (cpal + hand-rolled DSP), ported Mulberry32 PRNG byte-identical (golden test against Node.js output passes), ported `dark_techno` palette + wavetable recipes + chord progression stepper, implemented synth primitives (oscillator, biquad LP, AHDSR envelope, xorshift noise, tanh soft-clip), wired a cpal output stream driving kick/snare/hat + tier-0/1 walking bass for `dark_techno`. 13 tests pass (golden PRNG + oscillator + filter attenuation + envelope lifecycle + chord progression walk); `cargo clippy --all-targets -- -D warnings` clean; `cargo build --release` green on Linux. JS engine untouched (stays the A/B parity reference). Deferred to Phase 1.5 / Phase 2a: ringbuf-fed composer-thread split, tier-2+ chord-tone walking bass, ChordTrack/PadTrack/MelodyEngine audibility, tension/stagger/cycle/narrative. Aram needs to A/B against the JS reference (AC #2) — current state is audibly recognisable as `dark_techno` (four-on-floor + backbeat + offbeat hats + sawtooth root-pump bass) but lacks chord stabs, pad sustain, and melody, so full "blind A/B" parity is not yet hit.

---

## 2026-04-17 — Rust native migration planned — B+A cascading → SPEC_057, #58/#59/#60/#61/#62

Generational architecture plan. HarmonyEngine migrates off single-thread JS to Rust native (desktop + mobile). Motivation isn't current perf (main-thread cost is 5–15ms/beat, fine) — it's headroom for ambition: #40 VoicingEngine, #41 harmonic rhythm, future counterpoint/strings/brass/symphony work will cap a single thread.

Key finding that shaped the plan: audio synthesis already runs on Web Audio's native thread. JS is the *composition-decision* bottleneck-to-be, not the audio bottleneck. So the Rust story isn't about faster DSP — it's about parallelizing composition.

Aram chose **B+A cascading hybrid**: per-voice parallelism (B) as engineering skeleton — bass, drums, melody, chord, pad each on their own thread, meeting at a lock-free audio thread via SPSC ring buffers. Pipeline-ahead (A) layered on top as per-voice enrichment — each voice extends its composition horizon 1–4 bars past the current beat (melody the longest at 4 bars for cadential planning + motivic callbacks; drums shortest at 1 bar for groove responsiveness). Conductor thread publishes a read-mostly plan struct via basedrop; voices read it and compose inside it; plan changes trigger a flush using the existing PhaseStagger order.

Vision: **a live band of composers**. Each voice is its own musician with its own head, thinking ahead, playing its part. Scales to symphonies (strings/winds/brass sections) without architectural rewrite — add another voice thread + ring buffer.

Stack: cpal (audio I/O — only option with real shipped iOS/Android apps), dasp + hand-rolled voices (matches per-palette×per-voice cleanly), ringbuf + crossbeam + basedrop (canonical RT-audio threading), Slint (best mobile-ready Rust UI), cargo-mobile2 (packaging).

Four phases, each its own session:
- **#59 Phase 1** — parity port, desktop, one palette (dark_techno), single-threaded (6–8 weeks, Opus)
- **#60 Phase 2a** — Shape B per-voice threads, all 10 palettes, beat-by-beat (4–5 weeks, Opus)
- **#61 Phase 2b** — Shape A per-voice lookahead, VoicingEngine + harmonic rhythm first real implementation (3–4 weeks, Opus)
- **#62 Phase 3** — Slint UI + cargo-mobile2 + store submission (4–8 weeks, Sonnet)

Honest total: 4–6 months part-time solo. Decision "Rust is the road" — pause new JS feature work (#40/#41/#43/#45/#46/#47/#38/#18/#19/#13/#12/#11 port or re-evaluate into Rust phases). In-flight QA (#30/#42/#44/#56) finishes its cycle. JS engine frozen at current capability, kept playable in `legacy/` as A/B parity reference until Phase 3 ships.

Plan artifact saved at `/root/.claude/plans/plan-we-have-a-steady-peach.md`.

**Files changed:** `specs/SPEC_057_RUST_MIGRATION.md` (new), `CLAUDE.md` §6 (2 decisions logged) + §7 (Tier 0 block, paused block, awaiting QA regrouped, rest collapsed under Historical backlog).

---

## 2026-04-17 — #56 noir_jazz 60s detective overhaul built

Retuned noir_jazz to a 60s film-noir feel: thick crawling upright bass as the always-on foundation; violin and harmonica as occasional sparse lead phrases instead of a sustained single lead. Bass wavetable gets 3rd/5th/7th partials + gainScalar 1.15 + filter opens to 950Hz at Maelstrom. Melody engine gets three opt-in palette hooks — `timbreWeights` (per-phrase dice picks violin or harmonica wavetable), `restRange` (long gaps between phrases), `maxPhraseLen` (short 2–5 note fragments). Chord gainScalar 0.75→0.40 + entryPhase moved to Storm so leads own Swell/Surge. Drum synth internal gains -3 dB. No other palettes affected — hooks are opt-in. #56 awaiting QA.

---

## 2026-04-17 — UI overhaul rescope → SPEC_014, #45, #46, #47

Re-planned all of Tier 5 against the current engine. #14 (the original UI overhaul) was written before ChordTrack, cycle mode, staggered phase transitions, tension curve randomization, melody motifs, and the D-key diagnostic panel (#42) all landed. Its instrument list, chord surface, and phase representation were stale.

One umbrella spec (SPEC_014_UI_OVERHAUL.md), three build issues:

1. **#45 Build A — listener UI + palette colors** (P2, Sonnet) — replaces dev-flavored status bar with listener display: palette name (colored), current chord, 5-segment phase track with DC fill + tension/plateau/spike/retreat variants + cycle-state label, 7 instrument dots driven by `StateMapper._lastTargetGains`. Per-palette `colors: { primary, accent, bg }` on all 10 palettes. Visualizer reads palette colors, interpolates on palette change. DC/beat/stagger demoted behind a "Dev" checkbox persisted in localStorage. Sim Hit / Sim Graze buttons removed. ~50 edits.
2. **#46 Build B — keyboard shortcuts** (P3, Sonnet, depends on #45) — Space/Esc/arrows/1-5/0/M/?. Help overlay. D-key (diagnostic panel) preserved. ~20 edits.
3. **#47 Build C — responsive/mobile** (P3, Sonnet, depends on #45) — canvas viewport sizing, 640px breakpoint, ≥44px touch targets, iOS safe-area insets. ~30 edits.

Closed #14, #16, #17 as not-planned with supersede comments.

**Files changed:** `specs/SPEC_014_UI_OVERHAUL.md` (new), `CLAUDE.md` §7 Tier 5.

---

## 2026-04-17 — #44 Legato pop — third root cause found, fixed

Pop persisted after onPhaseChange guard. Real cause: legato re-trigger path re-fires LPF from peak on every phrase-start note, while filter was already closed during the preceding rest. For noir_jazz (lpfEnvAmount=300): 2000→2300Hz burst = pop, every phrase. Fix: `_phraseEntry` flag set on first note of each phrase, suppresses LPF to start at base not peak in the legato re-trigger path. Gate passes.

---

## 2026-04-17 — #44 Legato pop — new root cause found, re-fixed

Original fix (guard window + LPF suppression) addressed the hold-gap expiry case but missed the real dominant cause. Aram confirmed pops happen specifically at melody entry on a bar. Root cause: `onPhaseChange()` fires 3 resolution notes unconditionally even when `_muted = true` — creating a live legato oscillator chain before melody's stagger delay fires. On the very next tick when melody unmutes, `_liveOsc` is non-null → freshKill path → pop. Fix: one-line `|| this._muted` guard in `onPhaseChange`. Also repaired a pre-existing melody.js file truncation (file was cut off mid-line on disk; restored from git HEAD). Gate passes.

---

## 2026-04-17 — #44 Legato pop fix built

Fixed brittle pops in legato palettes (noir_jazz, vaporwave, synthwave). Three changes in melody.js: dynamic guard window scaled to sub-beat duration instead of hardcoded 150ms, LPF burst suppressed on legato-death restart, chainStart gap widened to 30ms. Awaiting QA.

---

## 2026-04-17 — #39 QA pass + #44 legato pop bug filed

Closed #39 (melody rhythm palette fix) — swing×syncopation, syncopation reduction, legato guard, attack pop all working as specced.

Residual bug found during QA: brittle pops / "laser beam" transients in legato palettes. noir_jazz (constant), vaporwave (storm→surge ~60%), synthwave (rare, surge). Root cause: hardcoded `_liveNoteEnd` guard (+0.15s) doesn't survive hold skips — the legato voice dies and the fresh chain fires the LPF envelope from peak, creating a bright transient burst. The timing math perfectly explains the per-palette frequency of the bug. Filed as #44 (P1 bug, Opus, ~6 edits in melody.js).

**Files changed:** none (QA session)

---

## 2026-04-17 — #42 Diagnostic foundation (Opus build)

New `src/diagnostic.js` module: real-time audio diagnostic overlay for QA. Press D to toggle.

**Built:** DIAGNOSTIC_VOCAB (17 terms), DiagnosticPanel (state + tracks + anomaly log), DiagnosticLog (50-entry ring buffer + clipboard copy), AnomalyDetector (9 detectors), NoteEventBus, glossary popup, CFG.DIAGNOSTIC thresholds. Thin hooks in voice_pool.js (activeCount, stealCount), audio.js (getLimiterReduction), state_mapper.js (_lastTargetGains, _lastStaggerFire). Shell integration + build inclusion.

**Files changed:** src/diagnostic.js (new), src/config.js, src/voice_pool.js, src/audio.js, src/state_mapper.js, src/shell.html, build.js, INDEX.md

**Status:** Awaiting QA. Next: #30 (Post-Maelstrom decay), then #40/#41 (chord evolution).

---

## 2026-04-17 — Audio Diagnostic System plan → SPEC_042, #42, #43

Designed a two-part QA tooling system to fix the "I can't describe what I hear" problem. Part A: shared vocabulary of 17 audio descriptors (muddy, boomy, harsh, etc.) mapping human symptoms to technical causes. Part B: active diagnostic overlay toggled with D key — 25 anomaly detectors across 7 categories (gain, spectral/FFT, voice pool, musical coherence, envelope, phase transition, rhythm) that auto-log issues with full reproduction context (beat, phase, palette, seed). Copy-to-clipboard for instant QA paste. Split into #42 (foundation: panel + vocab + 9 gain/voice detectors) and #43 (expansion: 16 spectral/musical/rhythm/envelope detectors, depends on #42). Both Opus.

**Files changed:** `specs/SPEC_042_AUDIO_DIAGNOSTIC_SYSTEM.md` (new), `CLAUDE.md` §5/§7

---

## 2026-04-17 — #39 Melody rhythm palette fix (build)
Fixed four QA issues from #38: swing×syncopation mutual exclusion (noir_jazz no longer sounds like ambient_dread), noir_jazz syncopation 0.70→0.40, 20ms phrase-boundary gap + wider legato guard (no more pops/plucks in synthwave/noir_jazz/ambient_dread), synthwave attack 0.04→0.08, ambient_dread melody gain 0.9→0.75. Gate passes. Awaiting QA.

**Files changed:** `src/melody.js`, `src/harmony.js`

---

## 2026-04-17 — Chord Evolution plan → SPEC_040, #40, #41

**What:** Plan session for chord system evolution. Designed four subsystems based on AUDIT_MELODY_CHORDS_RESEARCH.md Part 2 + Part 6 items 9–12:

1. **VoicingEngine** (#40, Opus) — new object in harmony.js that sits between HarmonyEngine's chord symbols and ChordTrack/PadTrack. Per-palette voicing styles: drop-2 for jazz, power chords for techno/industrial, open spread for synthwave, shell for lo-fi, cluster for ambient_dread, close triads for chiptune. Includes voice leading, register enforcement (octave 3 max 2 notes), and chord-melody collision avoidance (three modes: avoid, split, none).
2. **Extension ramp** (part of #40) — per-palette × per-phase whitelist replacing the binary allow9th flag. Swell = triads only. Surge = +7ths. Storm = +9ths. Maelstrom = full extensions for jazz/lo-fi (11ths, 13ths). Techno/industrial/chiptune stay bare throughout.
3. **Phase-driven harmonic rhythm** (#41, Sonnet) — replaces hardcoded `_beatsPerChord = 4` with per-palette × per-phase table. dark_techno: 32 beats at Pulse → 4 at Maelstrom. noir_jazz: 2 beats at Pulse → 0.5 at Maelstrom. ambient_dread: 64 → 8.
4. **Chord-melody collision avoidance** (part of #40) — VoicingEngine checks MelodyEngine's last note, avoids doubling at same octave. Register split mode for minimal palettes.

**Spec:** SPEC_040_CHORD_EVOLUTION.md
**Issues:** #40 (VoicingEngine, Opus, ~35 edits), #41 (harmonic rhythm, Sonnet, ~20 edits, depends on #40)

---

## 2026-04-17 — #38 QA: qa-improve → #39 opened

**What:** Three issues diagnosed in #38 melody rhythm extensions. (1) noir_jazz sounds like ambient_dread — swing inheritance and syncopation both displacing the same note steps simultaneously, producing chaotic off-grid timing instead of jazz feel; syncopation rate also far too high at 70%. (2) Note pops at phrase boundaries in synthwave and noir_jazz — fresh oscillator chain starts too close to prior voice kill, 40ms attack creating transient click. (3) ambient_dread and noir_jazz both sounding like plucks instead of legato — legato chain continuity guard too tight (50ms) causing chain-break and fresh-attack on notes that should sustain.

**Spec written:** SPEC_039_MELODY_RHYTHM_PALETTE_FIX.md. Four fixes: swing×syncopation mutual exclusion, noir_jazz syncopation rate 70%→40%, legato guard 50ms→150ms, 20ms phrase-boundary gap + synthwave attack 40ms→80ms.

**Files:** specs/SPEC_039_MELODY_RHYTHM_PALETTE_FIX.md (new)

---

## 2026-04-17 — #38 Build: Melody evolution — melodic rhythm extensions

**What:** Three new `melodyRhythm` fields wired into `MelodyEngine.tick()`: `syncopationProbability` shifts a note's scheduled time early by half a sub-unit (jazzy push), `dottedBias` makes a note 1.5× duration with the next note shortened by 0.5× to compensate (long-short feel), and `rubato` adds ±12.5ms freeform timing drift. All three cached in `initRun()` from palette config. Per-palette values added to all 10 palettes — noir_jazz and lo_fi_chill are heavy syncopators, synthwave and breakbeat use dotted rhythm, ambient/vaporwave/lo_fi use rubato, dark_techno and industrial stay mechanically on-grid.

**Files:** `src/melody.js`, `src/harmony.js`

---

## 2026-04-17 — #37 Build: Melody evolution — I-R post-filter + interval affinity

**What:** Added two note-selection refinement layers to the melody engine. I-R (Implication-Realization) post-filter tracks gap-fill obligations and direction runs — after a large leap, the next 1–3 notes are biased toward opposite stepwise motion. Direction closure kicks in after 3+ same-direction moves. Interval affinity gives each palette a soft weight map on semitone intervals — jazz favors chromatic m2 and tritone, synthwave favors bright M3/P4, ambient favors tense m2/tritone, techno favors open P4/P5. Both layers are multiplied into the existing candidate tournament alongside contour bias. Per-palette `ir` and `intervalAffinity` configs added to all 10 palettes.

**Files:** melody.js (3 new functions: `_irFilter`, `_irUpdate`, `_intervalAffinity` + state wiring), harmony.js (×10 palette configs).

---

## 2026-04-17 — #36 Build: Melody evolution — seed motif + phrase pairing + contour bias

**What:** Built the first three melody evolution subsystems from SPEC_036. The melody engine now generates a seed motif at song/cycle start and derives all subsequent phrases from it via variation (repeat, transpose, invert, diminish, fragment). Phrases come in antecedent-consequent pairs (question ends unresolved, answer resolves to root). Per-palette contour bias shapes phrases toward genre-appropriate arcs (synthwave arches, jazz descends, ambient undulates, techno stays flat). Replaced NarrativeConductor motif seeding (25% chance) with the full motif system. Added `motif`, `contour`, `phrasing` configs to all 10 palettes.

**Files changed:** melody.js (new: `_generateMotif`, `_applyVariation`, `_pickVariationType`, `_contourBias`; rewrite: `_generatePhrase`), harmony.js (×10 palette configs), INDEX.md.

**Next:** #36 awaiting QA → then #37 (I-R post-filter + interval affinity).

---

## 2026-04-17 — #33 qa-pass, #34 qa-pass, #35 Build: ChordTrack stagger + phase tuning

**What:** Processed QA passes for #33 (melody synth rebuild) and #34 (ChordTrack engine). Then built #35 — wired ChordTrack into the harmony stagger group. Added `ChordTrack.onPhaseChange()` in sequencer.js: checks palette's `entryPhase` and mutes/unmutes accordingly on each phase transition. Called from `StateMapper._dispatchHarmony()` so ChordTrack enters with bass during staggered transitions, never before. Updated INDEX.md with new symbol.

**Files changed:** src/sequencer.js, src/state_mapper.js, INDEX.md

---

## 2026-04-17 — #36 Plan: Melody Evolution — motivic development, contour, phrase pairing

**What:** Planned the melody evolution system — six subsystems layered on top of the existing Markov chain to give melodies higher-level musical structure. (1) Seed motif: 4–8 note motif generated at song/cycle start, all phrases derive via variation (repeat, transpose, invert, diminish, fragment). Phase controls which variations unlock. (2) Contour bias: per-palette target phrase shape (arch for synthwave, descending for jazz, wave for ambient). (3) Antecedent-consequent pairing: phrases in question-answer pairs. (4) I-R post-filter: Narmour gap-fill rules enforce stepwise recovery after large leaps. (5) Interval affinity: per-palette soft bias on interval selection (dark_techno→4ths/5ths, ambient_dread→m2/tritones). (6) Melodic rhythm extensions: syncopation, dotted rhythms, rubato per palette.

**Spec:** SPEC_036_MELODY_EVOLUTION.md
**Build issues:** #36 motif+pairing+contour (Opus), #37 I-R+affinity (Opus), #38 rhythm extensions (Sonnet)

---

## 2026-04-17 — #34 Build: ChordTrack — rhythmic chord articulation engine

**What:** New rhythmic chord layer between bass and melody. 8 genre-specific chord patterns: synthwave offbeat power stabs, chiptune NES arp cycling, dark_techno four-on-floor stabs, noir_jazz ghosted swung comps, industrial 8th-note stutter stabs, lo_fi ghosted Rhodes comps, glitch ascending arps, breakbeat euclidean stabs. Ambient_dread and vaporwave get nothing (pad wash only). Full audio infrastructure: dedicated gain bus, EQ chain, sidechain, reverb send. Phase floor integration — chords enter at Swell, gain ramps with intensity. Stagger dispatch integration (#35) still pending.

**Files:** `src/sequencer.js` (ChordTrack object + 8 patterns), `src/harmony.js` (10 palette.chord profiles), `src/audio.js` (gain bus + EQ + sidechain + reverb send), `src/config.js` (CFG.GAIN.chord + PHASE_FLOOR + INTENSITY_LAYER_THRESHOLDS), `src/state_mapper.js` (chord in tracks array + stagger floor map)

---

## 2026-04-17 — #32 Plan: Per-palette voice overhaul (melody synth + chord articulation)

**What:** Planned the melody synth rebuild and a new ChordTrack system. Melody was muted (#31) because all 10 palettes share the same single-oscillator synth chain — wavetable swaps alone don't create genre identity. The fix: full per-palette synthesis profiles with AHDSR envelopes, filter envelope sweeps (acid techno), legato/staccato articulation modes, PWM (chiptune), per-note detune (glitch/vaporwave), and delayed vibrato. Also identified a missing layer: no rhythmic chord component exists (pad is just a sustained wash). New ChordTrack adds per-palette stabs, comps, and arpeggiated triads — synthwave power stabs on 2+4, NES arp cycling for chiptune, ghosted jazz comps for noir_jazz, nothing for ambient/vaporwave.

**Spec:** SPEC_032_PER_PALETTE_VOICE_OVERHAUL.md
**Build issues:** #33 melody synth rebuild (Opus), #34 ChordTrack engine (Opus), #35 stagger wiring (Sonnet)

---

## 2026-04-17 — #31 Mute melody engine + #32 plan filed

**What:** Melody engine muted across all phases. Single-osc synthesis path sounds identical across all 10 palettes — thin, artifact-like tones that ruin every listening session. Root cause: all palettes share the same synth topology (osc→LP→gain), wavetable swaps don't create real timbral variety, and `voiceConfig` isn't even read by the melody engine. Muted by zeroing `_PHASE_DENSITY` gains. Filed #32 for a full per-palette melody synth overhaul (plan session, Opus).

**Files:** `src/melody.js`

---

## 2026-04-17 — #12 Plan: Post-Maelstrom theatrical decrescendo

**What:** Planned the decay arc overhaul. Current cycle decay is pure gain ramps — musically inert. New design: each instrument gets a "musical exit" before its gain fade. Melody plays a final descending phrase (or sustains, or stutters — per palette). Bass drops to root-only. Drums go half-time. Pad freezes chord and rings out into reverb. 10 per-palette decay profiles control the feel: glitch = abrupt stutter-cut, ambient_dread = long reverb dissolve, noir_jazz = band wrapping up. 16-bar envelope preserved. Explored 4 options (album outro, DJ breakdown, radio crossfade, theatrical decrescendo) — Aram chose theatrical decrescendo.

**Spec:** SPEC_012_POST_MAELSTROM_DECAY_ARC.md
**Build issue:** #30 (Opus, ~35 edits, single session)

---

## 2026-04-17 — #27 QA pass

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
