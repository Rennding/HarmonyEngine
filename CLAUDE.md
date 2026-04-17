# HarmonyEngine — Claude Operating File
<!-- This file is Claude's single source of truth. Human-facing notes go in DEVLOG.md. -->
<!-- LINE BUDGET: 300 max. If exceeded, archive stale decisions/failure modes. -->

---

## 1 · Session start

1. Read this file. **Nothing else unless routing says so.**
2. Read `INDEX.md` — symbol-level lookup table. Use it instead of reading whole source files. To find any function/const: find its address → `Read file:line` with ±20 line window.
3. Sync GitHub: `list_issues` state:open on Rennding/HarmonyEngine (when repo exists)
4. **Desync check:** Cross-check §7 (Backlog, Awaiting QA, Build queue) against open issues. Remove any entry whose issue is closed. Advance §7 header if next task is ready. Fix before doing anything else.
5. Routing:

| Session type | Also read | Skip |
|---|---|---|
| Build | specs/SPEC_[ID].md | — |
| Plan / Audit | §5 Design below (already here) | — |
| Quick (q: / quick: / decision: / code:) | INDEX.md only | Everything else |
| Infra | Nothing extra | — |

Never read DEVLOG.md at session start — it is human-facing only.

---

## 2 · Protocol

### Write order
GitHub first (relabel, close, comment), local second (DEVLOG, this file).

### Spec references
Always use full filename when referencing specs in GitHub issues, comments, and PR bodies (e.g. `SPEC_001_FEATURE_NAME.md`, never `SPEC_001`).

### Forbidden
- `create_or_update_file` / `push_files` — these ARE pushes
- Editing `dist/` or any build output directory — build output only
- Mixing Plan and Build in one session
- Rewriting whole files — targeted edits only
- Guessing on ambiguous spec — stop and ask
- Fixing unrelated bugs mid-session — note in report, don't fix

### Validation
- `npm run validate` — build + syntax check (every session)
- `npm run gate` — validate + tests (build sessions)

### Roles
- **Aram** = designer + QA. Never codes. Tests in browser, reports via GitHub or Cowork.
- **Claude** = implementer. Reads specs, writes code, runs builds, manages GitHub. Pushes back when a prescribed fix has a clearly better alternative — one sentence, no elaboration. Only when it matters.

### Communication
Work silently, speak human. Cut: narration of tool calls, step-by-step replays, post-session summaries. Keep: error explanations, decisions needing input, QA briefs, model + next steps in chat, files-changed list.

### Quick prefixes
`q:` `quick:` `decision:` `code: [fn]` `qalist` `qa[NN]:`

### Explore flag (`+`)
Append `+` to any prefix: `q+:` `decision+:` `qa[NN]+:` etc.

Signals: Aram knows what he wants, but the *shape* of the solution needs research and creative judgment. Claude's job is to look outward (competitor games, industry conventions, UX patterns) and recommend — never decide.

**Response format:** 2–4 named options. Each option includes:
- What it is (1 sentence)
- A real comparable (game, product, or convention it comes from)
- Why it fits or doesn't fit Harmony Engine specifically

**Hard rules:**
- Always end with "Your call." — Aram decides, Claude never picks for him
- No implementation until Aram selects an option
- Creative latitude is allowed within HarmonyEngine's design rules (§5) — don't recommend anything that violates beat-king, dodge-purity, or mobile-first

### Token efficiency
- **INDEX.md first** — look up address → Read file:line±20. Never read a whole src/ file to find a function.
- Grep before edit — confirm target exists, then edit
- Batch related edits without commentary
- If GitHub MCP unavailable, work local-only immediately
- MCP calls: use number types for IDs, real arrays for labels. On validation error: fix ALL fields from error payload in one pass, propagate to sibling calls.

### INDEX.md maintenance
- After any build session that adds/moves/removes functions: update INDEX.md (add/edit/delete rows, fix line numbers).
- Keep INDEX.md ≤ 250 lines. If exceeded, collapse cold symbols into section ranges.

---

## 3 · Session types & output

| Type | Output |
|---|---|
| Audit | Issue list P1/P2/P3, GitHub issues |
| Plan | SPEC file + GitHub issues + DEVLOG entry |
| Build | Updated modules + rebuilt project + QA Brief |
| Infra | Updated files + DEVLOG entry |

### Labels
needs-aram, P1/P2/P3, build/plan/audit-session, qa-pass/qa-improve/qa-fail, bug, blocker/dependency

### QA workflow
- `qalist` → list needs-aram issues (P1 first, 2 sentences each)
- `qa[NN]:` → process verdict immediately:
  1. GitHub first: relabel (remove needs-aram, apply verdict), close if pass
  2. Post structured QA comment — plain English, no dev terms, no file paths
  3. If improve/fail: write SPEC in same session, open new build issue

QA Briefs = user-facing: what changed, how to test (numbered steps), risks (observable symptoms). No function names, no file paths.

### Spec flow
Draft → "Any revisions?" → confirm → fire in one pass: SPEC file + GitHub issues + DEVLOG. Never ask twice. Every SPEC includes a MODEL line (Sonnet=mechanical, Opus=judgment).

Every build issue body must include a **Model:** line (e.g. `Model: Sonnet`) near the top, so Aram knows which model to select when starting the session.

### Issue-to-session mapping
Default: one spec → one build issue → one session. Issues are fine-grained (one per deliverable) for QA tracking, but multiple issues can batch into a single build session.

**Split into separate sessions only when:**
1. **Model mismatch** — subsystems need different models (Opus judgment vs Sonnet mechanical)
2. **QA gate** — later work depends on user's feedback on earlier work
3. **Scope overflow** — total edits would exceed ~40 (accuracy degrades past this)
4. **True independence** — subsystems are separately testable AND separately useful

**Keep as one session when:** subsystems are tightly coupled, intermediate states are broken/untestable, total scope fits in one session, same model throughout.

**§7 notation:** batch sessions marked as `#5+#6+#7 (one session)`. Individual issues still exist as QA checkpoints.

**Decision test (run this before creating build issues):** "If I build issue N alone and stop, does the user get something testable?" If no → batch with its neighbors.

---

## 4 · Session end

1. GitHub updates first
2. Mirror to DEVLOG.md (human summary only)
3. Update §7 DO THIS NEXT below (title + model + prompt = atomic unit)
4. Extract 0–3 learnings → §8 failure modes
5. State model + next steps directly in chat
6. Remind Aram to push via GitHub Desktop

---

## 5 · Design

<!-- FILLED DURING ONBOARDING — this section holds the project's design bible -->

### What is HarmonyEngine
Standalone procedural music generator extracted from DemoShooter. Browser-based, Web Audio API, single-file build. 10 genre palettes, phase-driven musical evolution, beat-synced everything. Generates unique songs in real time with no samples or prerecorded audio.

Core fantasy: a music station that plays an infinite procedural song that evolves through phases — starting minimal, growing richer, and eventually reaching a chaotic peak.

### Design rules (non-negotiable)
- Beat is king — everything syncs to the beat clock
- Musical coherence — chord tones, voice leading, harmonic rhythm at all times
- Phase-driven evolution — the song must grow audibly richer over time
- Genre identity — each of the 10 palettes must sound distinctly different
- No samples — all audio is synthesized via Web Audio API oscillators, noise, and wavetables
- Single-file output — build.js concatenates src/ into one dist/index.html

### Palettes (10 genres)
dark_techno, synthwave, glitch, ambient_dread, lo_fi_chill, chiptune, noir_jazz, industrial, vaporwave, breakbeat

### Phase progression
Pulse → Swell → Surge → Storm → Maelstrom. Each phase adds instruments, FX depth, and compositional complexity. The Conductor drives progression automatically or can be overridden via UI.

### File structure
```
src/ → config.js, state.js, conductor.js,
       audio.js, harmony.js, sequencer.js,
       voice_pool.js, groove.js, state_mapper.js,
       wavetables.js, melody.js, narrative.js,
       diagnostic.js, shell.html
scripts/dev-server.js
build.js, package.json, CLAUDE.md, DEVLOG.md, INDEX.md
specs/ dist/
```

### Tech stack
JavaScript (vanilla, no framework), Web Audio API, HTML5 Canvas (visualizer only), Node.js build tooling. No npm dependencies at runtime.

---

## 6 · Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-16 | Cycle transition = musical bridge (decay→kick-only→rebuild), not crossfade or silence gap | Single audio graph, no resource doubling, phase-native. Crossfade doubles Web Audio cost; silence gap breaks radio fantasy. |
| 2026-04-16 | Song arc = full Pulse→Maelstrom + randomized sustain (8–32 bars), rebuild starts at Surge | Complete phase journey every cycle. Random sustain adds variation. Surge entry avoids 30+ bar sparse gap. |
| 2026-04-17 | Cycle exit enters at Swell (dc=0.30), not Pulse — cycle transition *is* the Pulse phase | Full arc per cycle, but new palette starts audible at Swell. beatCountCycleBase back-computed from mood curve so power curve is continuous with no snap. |
| 2026-04-16 | Stagger timing = per-palette hardcoded + optional override, not UI-configurable initially | Palette identity drives transition feel (techno=tight, ambient=wide). Override exists for future tuning. Avoids premature UI complexity. |
| 2026-04-16 | Manual phase forcing still staggers (no snap) | Consistency — user expects same musical behavior regardless of trigger source. Snap would break the "band shifting gears" feel. |
| 2026-04-16 | Downward phase transitions reverse stagger order (melody out first, rhythm last) | Mirrors real arrangement: lead instruments drop first, rhythm section is last to simplify. Musical convention. |

---

## 7 · DO THIS NEXT

**Status: #42 + #44 awaiting QA. Next: #30, then #40/#41, then #43.**

### Tier 1 · Foundation (P1)
✅ #1 AudioContext lifecycle — qa-pass
✅ #2 Fix validate/gate script — qa-pass

### Tier 2 · Clean Extraction (P1–P3)
✅ **#3** Kill dead code — stubs, vestigial G fields, CFG.PERKS (P1, Sonnet) — qa-pass
✅ **#4** Rename game vocabulary — combo→intensity, hp→energy, bullet→voice (P2) — qa-pass
✅ **#5** Rename source files — drop numeric prefixes (P3) — qa-pass

### Tier 3 · Core Product (P1–P2)
✅ **#6** Palette lock — play one palette on repeat (P1) — qa-pass
✅ **#7** BPM override slider — independent of palette range (P1) — qa-pass
✅ **#8** Cycle mode — plan-session complete, spec written
✅ **#22** Bug: Auto BPM always 120 — qa-pass
✅ **#23** Cycle mode — core engine + state machine (P1, Opus) — qa-pass
✅ **#24** Cycle mode — track gain choreography (P1, Sonnet) — qa-pass
✅ **#25** Cycle mode — UI + polish (P1, Sonnet) — qa-pass
✅ **#9** Song identity — seed display + shareable URL params (P2, Sonnet) — qa-pass

### Tier 4 · Musicality (P2)
✅ **#10** Staggered phase transitions — plan complete → SPEC_010_STAGGERED_PHASE_TRANSITIONS.md
✅ **#26** Staggered phase transitions — PhaseStagger scheduler + per-palette profiles (Opus) — qa-pass
✅ **#11** Tension curve randomization — plan complete → SPEC_011_TENSION_CURVE_RANDOMIZATION.md
✅ **#27** Tension curve randomization — TensionMap + palette profiles + DC integration (Opus) — qa-pass
✅ **#28** Per-palette Storm/Maelstrom personality — plan complete → SPEC_028_PALETTE_STORM_PERSONALITY.md
✅ **#29** Per-palette Storm/Maelstrom personality — tier caps + gain scalars + phase filters (Opus) — qa-pass
✅ **#31** Mute melody engine pending overhaul — applied
✅ **#32** Per-palette voice overhaul — plan complete → SPEC_032_PER_PALETTE_VOICE_OVERHAUL.md
✅ **#33** Melody synth rebuild — per-palette synthesis chain (Opus) — qa-pass
✅ **#34** ChordTrack — rhythmic chord articulation engine (Opus) — qa-pass
✅ **#35** ChordTrack stagger + phase tuning (Sonnet) — qa-pass
✅ Melody evolution — plan complete → SPEC_036_MELODY_EVOLUTION.md
✅ **#36** Melody evolution — seed motif + phrase pairing + contour bias (Opus) — qa-pass
✅ **#37** Melody evolution — I-R post-filter + interval affinity (Opus) — qa-pass
⚠️ **#38** Melody evolution — melodic rhythm extensions (Sonnet) — qa-improve → see #39
✅ Melody rhythm palette fix — plan complete → SPEC_039_MELODY_RHYTHM_PALETTE_FIX.md
✅ **#39** Melody rhythm palette fix — swing×syncopation + legato guard + attack pop (Opus) — qa-pass
⚠️ **#44** Bug: Legato voice expiration causes brittle pops in noir_jazz, vaporwave, synthwave (Opus, P1) — built, awaiting QA
✅ **#12** Post-Maelstrom decay arc — plan complete → SPEC_012_POST_MAELSTROM_DECAY_ARC.md
- **#30** Post-Maelstrom theatrical decrescendo — wind-down behaviors + per-palette decay profiles (Opus)
✅ Chord evolution — plan complete → SPEC_040_CHORD_EVOLUTION.md
- **#40** VoicingEngine — per-palette voicing intelligence + extension ramp + collision avoidance (Opus)
- **#41** Phase-driven harmonic rhythm — per-palette × per-phase chord change rate (Sonnet, depends on #40)
- **#13** Faster start — skip empty Pulse or add intro phrase (plan)

### Tier 4b · QA Tooling (P2)
✅ Audio diagnostic system — plan complete → SPEC_042_AUDIO_DIAGNOSTIC_SYSTEM.md
✅ **#42** Diagnostic foundation — vocab + panel + 9 gain/voice detectors + hooks (Opus) — built, awaiting QA
- **#43** Diagnostic expansion — 16 spectral + musical + rhythm + envelope detectors (Opus, depends on #42)

### Tier 5 · UI/UX (P2–P3)
- **#14** UI overhaul — musical feedback + per-palette visualizer colors (P2, Sonnet) [absorbed #15]
- **#16** Keyboard shortcuts — space, arrows, standard music player keys (P3, Sonnet)
- **#17** Responsive layout + mobile support (P3, Sonnet)

### Tier 6 · Distribution (P3)
- **#18** WAV export via OfflineAudioContext (plan)
- **#19** Distribution polish — PWA manifest + dev watch mode + prod build (P3, Sonnet) [absorbed #20, #21]

---

## 8 · Known failure modes

| Failure | Avoidance |
|---|---|
| Template literal corruption | Syntax-check after backtick edits |
| dist/ edited | All edits in src/ (or equivalent source dir) |
| Plan+Build mixed | Never same session |
| DO THIS NEXT desync | Title + Model + prompt = atomic unit, all three updated together |
| Stale build prompts | When spec's builds complete, purge from §7 immediately |
| Issue body not updated | update_issue must include body=. Title + labels + body = atomic unit. |
| Build issues not created after spec | Spec confirmed = build issues created same session, no exceptions |
| §7 stale after QA pass | When processing qa-pass: (1) close GitHub issue, (2) remove from §7 Awaiting QA, (3) advance §7 header, (4) remove closed issues from Backlog — all four in same session |
| Closed issue lingers in Backlog | Session-start sync: cross-check §7 Backlog against `list_issues state:open`. Remove any entry whose issue is closed. |
| INDEX.md stale after build | After adding/moving/removing functions, update INDEX.md rows + line numbers in same session. |
| Reading whole src/ files | Use INDEX.md address → Read file:line±20. Never read a whole module to locate a function. |
| QA Brief only in chat, not GitHub | Build sessions must post QA Brief as a GitHub comment on the issue. Chat is not a substitute. |
| Over-splitting build issues | Default = batch. Split only when: model mismatch, QA gate, scope >40 edits, or true independence. |
| MCP validation errors | Fix ALL fields from error payload in one pass, propagate to sibling calls. Never use \n in body fields — use real newlines. |
| Game state reference in audio | All G.* fields must exist in state.js — grep for G. references after any audio module change |
| StateMapper expects game objects | StateMapper references PerkEffects* — stub or guard with typeof checks |
| Standalone synth fns lack palette access | _synthBass/_synthDrum are module-scope functions, not Sequencer methods — they only see _activePaletteName, not the full palette object. When adding per-palette config reads, ensure _activePalette (full object) is set alongside _activePaletteName in Sequencer.initRun(). |

---

## 9 · How to run

```bash
npm run build          # build → dist/index.html
npm run serve          # dev server → localhost:3001
npm run dev            # build + serve
npm run gate           # validate + tests
```

---

## 10 · Audio architecture notes

| # | Learning | Detail |
|---|----------|--------|
| 1 | Use Canvas native primitives for per-frame drawing | For visualizer — fillCircle/fillRect, never compound arc paths |
| 2 | Measure before shipping visual changes | Chrome Performance Monitor with FFT running |
| 3 | arc() is the most expensive Canvas operation | Avoid in per-frame visualizer draws |
| 4 | Shared Graphics batch cost ∝ draw calls, not objects | Minimize draw calls per frame in visualizer |
