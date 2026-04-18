# SPEC_057 — HarmonyEngine Rust Native Migration

**Umbrella issue:** #58
**Phase issues:** #59 (Phase 1), #60 (Phase 2a), #61 (Phase 2b), #62 (Phase 3)

**Status:** Confirmed
**Model:** Opus for Phase 1, 2a, 2b (architecture judgment); Sonnet for Phase 3 (UI port, mostly mechanical)
**Depends on:** None — this is a generational architecture change
**Addresses:** Headroom ceiling — single-thread JS will cap the ambition behind #40, #41, future VoicingEngine deepening, counterpoint lines, per-track FX chains, symphony-scale arrangements
**Plan artifact:** `/root/.claude/plans/plan-we-have-a-steady-peach.md` (detailed reasoning + alternatives considered)

---

## 1 · Problem summary

HarmonyEngine today is ~12,100 LOC of vanilla JS + Web Audio API. Current main-thread cost is ~5–15ms per beat — well under budget. But the ambitions queued in §7 (VoicingEngine #40, phase-driven harmonic rhythm #41, future counterpoint/strings/brass) compound on a single thread. Audio synthesis already runs on Web Audio's native thread; JS is the bottleneck-to-be for *composition decisions*.

Aram's call: **Rust, native desktop + mobile, B+A cascading architecture.** Per-voice parallelism (B) as the engineering skeleton. Pipeline-ahead (A) as the per-voice enrichment layer. The vision: **a live band of composers** — each voice its own musician with its own head, thinking ahead, playing its part. Scales to symphonies without architectural rewrite.

---

## 2 · Approach: B+A hybrid

**B — per-voice parallelism (the skeleton).** Bass, drums, melody, chord, pad, FX — each subsystem runs on its own worker thread. Each voice composes its own next note concurrently, writes events into a per-voice SPSC ring buffer, drained by a single lock-free audio thread at the cpal callback.

**A — per-voice pipeline-ahead (the intelligence).** Each voice thread extends its composition horizon 1–4 bars past the current beat. Drums short (~1 bar), bass/chord/pad medium (~2 bars), melody long (~4 bars). Expensive algorithms (VoicingEngine global solving, cadential planning, motivic callbacks, I-R filter across whole phrases) stop racing the beat clock.

**Conductor thread** publishes a read-mostly plan struct `{ chord, phase, dc, tension, palette, section_mask }` via `basedrop` pointer swap each beat. Voice threads read the latest plan and compose inside it. Plan changes (palette swap, forced phase, tension spike) trigger a **plan-flush protocol**: voices drain stale lookahead using the existing `PhaseStagger` order (rhythm out last, melody out first on downward transitions, reversed on upward).

### Why B+A maps cleanly onto today's architecture

The current JS architecture is already a B+A design serialized onto one thread:

| Today (single-threaded JS) | Tomorrow (B+A Rust) |
|---|---|
| `Conductor` computes phase + DC + tension per beat | **Conductor thread** — publishes plan struct each beat |
| `StateMapper._dispatchRhythm/Harmony/Texture/Melody` fires 4 groups | **4 voice threads** — each reads plan, pipelines ahead, writes to ring buffer |
| `HarmonyEngine.pickChord()` called inline | **Harmonic planner** — inside Conductor, result in plan struct |
| `VoicePool` allocates synth nodes on main thread | **Audio thread** — drains ring buffers on cpal callback, never blocks |
| `PhaseStagger` (SPEC_010) staggers phase response | **Plan-flush protocol** — same stagger order drains stale lookahead |

Dispatch boundaries in `state_mapper.js:788–964` are literally the thread split points of Shape B. Architectural work already done.

---

## 3 · Stack

| Layer | Pick | Rationale |
|---|---|---|
| Audio I/O | **cpal** | Only Rust audio crate with real shipped iOS + Android apps |
| DSP primitives | **dasp** + hand-rolled voices | Matches per-palette × per-voice architecture cleanly; current JS voice code translates 1:1 |
| Voice graph | **knyst** (study, possibly adopt) | Designed for dynamic generative music — closest spiritual match to Sequencer + VoicePool |
| Threading | **ringbuf** (SPSC lock-free) + **crossbeam** (channels) + **basedrop** (RT-safe struct swap) | Canonical real-time Rust audio pattern |
| UI | **Slint** | Best mobile-readiness today (iOS + Android backends active); declarative, HTML-familiar |
| Mobile packaging | **cargo-mobile2** | Most mature path — generates Xcode + Android Studio projects wrapping Rust `cdylib` |

**Fallback if Slint iOS quality is insufficient at Phase 3:** native Swift UI + Rust `cdylib` core (more work, best polish).

**Prior art to study before Phase 1:** knyst source, basedrop RT-safe swap patterns, kira mixer source, fundsp examples.

---

## 4 · Phases

Four phases. Each is its own session per §3 issue-to-session mapping — QA-gated, independent, model-appropriate.

### Phase 1 · Parity port (~60 edits) — Issue #59, Opus

Desktop-only Rust binary plays **one palette** audibly identical to current JS. Single-threaded still — no cascading yet. Goal is parity.

**Scope:**
- Port `config.js`, `state.js` (G + Mulberry32 PRNG), `harmony.js` (PALETTES + HarmonyEngine) verbatim — pure data/math, 1:1.
- Port `voice_pool.js`, `wavetables.js`, core `audio.js` synthesis onto cpal + dasp.
- Port `conductor.js` scheduler with ringbuf-fed audio thread (still one composer thread).
- Pick one palette to prove end-to-end (recommend: **dark_techno** — densest, stressiest, most predictable).

**Acceptance:**
1. Rust desktop binary runs on macOS + Linux + Windows.
2. Blind A/B listen test (10 samples, same seed, same palette) — Aram cannot reliably pick JS vs Rust.
3. No audio thread underruns in a 10-minute session.
4. Seeded PRNG produces byte-identical note sequences to JS for the same seed (golden-test).

### Phase 2a · Shape B — per-voice threads (~80 edits) — Issue #60, Opus

**Status (2026-04-18):** qa-pass. Split into three sub-sessions per §3 40-edit rule: #68 (threading skeleton, dark_techno, byte-identical golden), #69 (all 10 palettes + wavetables), #70 (groove + narrative + diagnostic + per-voice detectors). #60 closed as umbrella.

Split dispatch groups onto threads. Still composing beat-by-beat, no lookahead yet.

**Scope:**
- Conductor plan struct `{ chord, phase, dc, tension, palette, section_mask }`, published via `basedrop` swap each beat.
- Split `StateMapper._dispatchRhythm/Harmony/Texture/Melody` into four voice threads. Each reads plan, composes its next beat, writes events to its own SPSC ring buffer.
- Audio thread drains ring buffers on cpal callback, routes to voice pool.
- Port `melody.js`, `sequencer.js` (PadTrack/WalkingBass/ChordTrack), `state_mapper.js`, `groove.js`, `narrative.js`.
- Port diagnostic system (#42/#43) with new per-voice detectors: jitter, ring-buffer underruns, plan-publish latency.

**Acceptance:**
1. Same seed + same palette plays identical to Phase 1 in B mode (byte-identical golden test).
2. All 10 palettes ported.
3. Run 2× today's voice count at Storm/Maelstrom without CPU saturation on a mid-range laptop.
4. 10-minute Storm session: zero audio-thread underruns, zero ring-buffer overflows.
5. `assert_no_alloc` passes on the audio thread in debug builds.

### Phase 2b · Shape A — per-voice lookahead (~40 edits) — Issue #61, Opus

Each voice thread extends its composition horizon. Smartness comes online.

**Scope:**
- Per-voice lookahead budget (configurable 1–4 bars):
  - Drums: ~1 bar (fast response to groove/fill changes)
  - Bass: ~2 bars (walking toward next chord)
  - Chord/Pad: ~2 bars (VoicingEngine #40 solves across chord changes)
  - Melody: ~4 bars (full phrase — cadential planning, motivic callbacks, I-R filter)
- Plan-flush protocol: Conductor publishes new plan → voices drain stale lookahead using `PhaseStagger` order (§6 decision: rhythm out last on downward, melody out first).
- Upgrade composition algorithms: MelodyEngine gets real phrase-level cadential planning; VoicingEngine (#40 ported here) gets global voice-leading across next chord change; WalkingBass gets "walking toward next chord" intelligence.

**Acceptance:**
1. A/B listen test between 2a and 2b on same seed: 2b sounds *more musical* (tighter cadences, better phrase shapes, smarter voice-leading). Aram decides.
2. Lookahead-flush latency on palette swap <1 bar (measured, logged in diagnostic).
3. Cycle mode transitions (SPEC_008) still feel live — no perceptible snap or lag.
4. Manual phase forcing still staggers (CLAUDE.md §6 decision preserved).

### Phase 3 · UI + mobile (~50 edits) — Issue #62, Sonnet

Shippable app on both stores.

**Scope:**
- Listener UI in Slint (palette picker, BPM slider, phase override, visualizer, seed share) — ports SPEC_014 deliverables onto the Rust core.
- Dev panel (diagnostic) in Slint or egui.
- `cargo-mobile2` scaffold → iOS + Android builds. Background audio, lock-screen controls, MediaSession parity.
- Store polish: icons, permissions, review submissions.

**Acceptance:**
1. iOS TestFlight + Android internal track builds shipped.
2. Background audio works on both platforms.
3. Lock-screen controls (play/pause/stop) work on both.
4. 30-minute session on each platform: no crash, no audio glitch.
5. Desktop parity preserved (macOS + Linux + Windows).

---

## 5 · What stays verbatim

- **10 palettes and their DNA** — PALETTES object, per-palette tierCap/gainScalar/phaseFilter, noir_jazz melody timbreWeights/restRange/maxPhraseLen (#56)
- **Wavetables recipes** — all 80+ palette×role recipes
- **Phase progression** — Pulse→Swell→Surge→Storm→Maelstrom, DC thresholds, PHASE_FLOOR
- **Cycle mode** — SPEC_008 mechanics, decision log §6 (cycle transition = Pulse phase, randomized sustain, Swell re-entry)
- **Staggered phase transitions** — SPEC_010, per-palette stagger profiles, downward-reverse rule
- **Tension curve randomization** — SPEC_011, TensionMap, plateaus/spikes/retreats
- **Storm/Maelstrom palette personality** — SPEC_028
- **Voice overhaul** — SPEC_032 per-palette synth chains, legato state machine
- **Melody evolution** — SPEC_036/037/038/039 motif + I-R + interval affinity + rhythm
- **Chord evolution** — SPEC_040 VoicingEngine rules (implemented for the first time in Rust during Phase 2b)
- **Diagnostic vocabulary** — SPEC_042 17-term DIAGNOSTIC_VOCAB survives language change
- **Design rules** (CLAUDE.md §5) — beat is king, no samples, musical coherence, phase-driven evolution, genre identity, single-artifact output (now native binary)

## 6 · What dies or mutates

- `build.js` single-file concat → `cargo build` workflow
- `dist/index.html` → native binaries + store bundles
- Web-only concerns: MediaSession shim (OS handles natively), visibilitychange handler, hidden `<audio>` mobile-bg-audio workaround, `<audio>`-element routing
- Shell.html UI → Slint
- JS validation/gate scripts → `cargo check` + `cargo test` + `cargo clippy`
- `INDEX.md` reshapes around Rust module addresses

---

## 7 · Risks

- **Scope creep.** 12k LOC + cascading + mobile across 4 phases (~230 edits total). Biggest risk: building all of B+A before any UI ships = shelfware. **Mitigation:** Phase 1 is already a playable desktop binary with one palette. Ship it, listen, then 2a.
- **Plan-flush semantics in 2b.** Lookahead drain under UI changes is the subtle bit. **Mitigation:** prototype with 2 voices (drums + melody) before scaling to all.
- **cpal on Android.** AAudio vs OpenSL, API-level gotchas. **Mitigation:** budget +1 week on first Android build.
- **Slint mobile maturity.** Best of Rust options, still behind SwiftUI/Compose. **Mitigation:** fall back to native Swift UI + Rust cdylib if iOS store polish is non-negotiable.
- **Audio-thread discipline.** Rust catches memory safety; doesn't catch accidental heap-alloc on audio thread. **Mitigation:** `assert_no_alloc` in debug, ring buffer + basedrop discipline.
- **Symphony scope creep.** B+A enables symphonies; doesn't require them day one. **Mitigation:** ship 10 palettes first. Orchestral sections are a separate spec after Phase 3.

---

## 8 · Reference parity protection

Keep JS build alive in `legacy/` at the repo root until Phase 3 ships store builds. Every phase's acceptance criteria includes an A/B listen test against the JS reference.

---

## 9 · §7 impact

Per Aram's call ("Rust is the road"), all JS feature work pauses. In-flight QA (issues currently `needs-aram`) still completes its QA cycle. New build sessions on #40/#41/#43/#45/#46/#47/#38/#18/#19/#13/#12/#11 pause — work ports into Phase 2b (#40, #41), Phase 2a diagnostic extension (#43), Phase 3 UI (#45/#46/#47), Phase 3 distribution (#19), or is re-evaluated for Rust (#13, #18).
