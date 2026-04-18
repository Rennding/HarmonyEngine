# HarmonyEngine — Claude Operating File
<!-- This file is Claude's single source of truth. Human-facing notes go in DEVLOG.md. -->
<!-- LINE BUDGET: 350 max. If exceeded, archive stale decisions/failure modes. -->

---

## 1 · Session start

1. Read this file. **Nothing else unless routing says so.**
2. Read `INDEX.md` — symbol-level lookup table. Use it instead of reading whole source files. To find any function/const: find its address → `Read file:line` with ±20 line window.
3. **Quick sync:** `issue_read` on §7 current issue only — confirm it's open. If closed, run `list_issues state:OPEN label:P1` to find next priority and update §7. Skip for `q:`/`quick:`/`decision:`/`code:` prefixes.
4. Full `list_issues` only during Plan/Audit sessions. Trust §7 otherwise.
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
Relabel/close/comment the issue, update §7 — all in one pass before session end.

### Spec references
Always use full filename when referencing specs in GitHub issues, comments, and PR bodies (e.g. `SPEC_001_FEATURE_NAME.md`, never `SPEC_001`).

### Forbidden
- `create_or_update_file` / `push_files` (GitHub MCP) — they write directly to the remote, bypassing local git, hooks, and `npm run validate`. Use `git add/commit/push` instead.
- Editing `dist/` or any build output directory — build output only
- Mixing Plan and Build in one session
- Rewriting whole files — targeted edits only
- Guessing on ambiguous spec — stop and ask
- Fixing unrelated bugs mid-session — note in report, don't fix

### Self-improvement
Every session, evaluate: did a new pattern repeat, did a rule fail, did I invent a workflow on the fly? If yes, update CLAUDE.md in the same session — §2/§2a/§3 when rules change, §8 when a failure repeats. CLAUDE.md drifts when updates are deferred.

### Validation
- `npm run validate` — build + syntax check (every session)
- `npm run gate` — validate + tests (build sessions)

### PR subscription
After opening a PR, call `subscribe_pr_activity` to receive CI failures and review comments automatically.

### Roles
- **Aram** = designer + QA. Never codes. Tests in browser, reports via GitHub issues/comments.
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
- **Rust Build sessions: max 2 file reads before first edit.** If a symbol is missing from INDEX.md or the line window looks wrong, grep for it — never open a whole `.rs` file to orient.
- Grep before edit — confirm target exists, then edit
- Batch related edits without commentary
- If GitHub MCP unavailable, work local-only immediately
- MCP calls: use number types for IDs, real arrays for labels. On validation error: fix ALL fields from error payload in one pass, propagate to sibling calls.

### INDEX.md maintenance
- After any build session that adds/moves/removes functions: update INDEX.md (add/edit/delete rows, fix line numbers).
- Keep INDEX.md ≤ 250 lines. If exceeded, collapse cold symbols into section ranges.

---

## 2a · GitHub lifecycle contract

Every session = one open issue. Every commit = one issue ref. Every PR = one `Closes` line.

| Event | Required action |
|---|---|
| Session start (plan/build/audit/infra) | Issue exists or create one. Post opening comment: `Session started — scope: <one line>, model: <name>`. |
| Branch create | `claude/NN-short-slug` — e.g. `claude/70-groove-narrative`. Deterministic: one branch per issue, delete on merge. |
| Commit | Message prefix: `[#NN] <subject>`. Use `[#infra]` only for meta work with no issue. Reject vague messages. |
| Mid-session pivot | Comment on issue: `Scope change: <what/why>`. Update issue body if permanent. |
| PR open | Body includes `Closes #NN` (or `Refs #NN` for partial). Title ≤70 chars. |
| PR merge | Verify linked issue auto-closed. If not, close manually + comment. |
| QA verdict | See §3 `qa[NN]:` workflow — unchanged. |
| Session end | See §4 checklist. |
| Aram closes issue directly on GitHub | Apply `aram-closed` label before closing. Claude treats any closed issue with this label as owner-approved — no flag at session start. |

**Exemptions:** `q:` / `quick:` / `decision:` / `code:` prefixes skip issue creation, but still require a one-line comment on the most-recent relevant issue if the work touches code.

---

## 3 · Session types & output

| Type | Output |
|---|---|
| Audit | Issue list P1/P2/P3, GitHub issues |
| Plan | SPEC file + GitHub issues |
| Build | Updated modules + rebuilt project + QA Brief |
| Infra | Updated files |

### Labels
needs-aram, P1/P2/P3, build/plan/audit-session, qa-pass/qa-improve/qa-fail, bug, blocker/dependency, aram-closed, rust-backlog

### QA workflow
- `qalist` → list needs-aram issues (P1 first, 2 sentences each)
- `qa[NN]:` → process verdict immediately:
  1. Relabel (remove needs-aram, apply verdict), close if pass
  2. Post structured QA comment — plain English, no dev terms, no file paths
  3. If improve/fail: write SPEC in same session, open new build issue

**Shortcut:** qa-pass can be applied directly on GitHub (close issue + `qa-pass` label) — no chat needed. Claude posts QA brief on closed issue at next session start. qa-improve and qa-fail always require chat — new SPEC must be confirmed in real time.

QA Briefs = user-facing: what changed, how to test (numbered steps), risks (observable symptoms). No function names, no file paths.

### Spec flow
Draft → "Any revisions?" → confirm → fire in one pass: SPEC file + GitHub issues. Never ask twice. Every SPEC includes a MODEL line (Sonnet=mechanical, Opus=judgment).

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

## 4 · Session end (in this order)

1. Update issue body if scope drifted; post closing comment (QA Brief for build sessions).
2. Relabel and close the issue (or apply `needs-aram` if QA pending).
3. Update §7 DO THIS NEXT below (title + model + prompt = atomic unit). Advance header.
4. Extract 0–3 learnings → §8 failure modes.
5. **If a rule changed or a new pattern appeared twice, update §2/§2a/§3 — not just §8.**
6. Push unpushed commits. Plan approval (ExitPlanMode) covers the follow-through push — no second confirmation. For sessions with no plan-approval step (quick prefixes, audits, ad-hoc edits), summarize unpushed commits and ask for a one-word go/no-go first. Never force-push.
7. State model + next steps directly in chat.

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
| 2026-04-17 | Migrate to Rust native (desktop + mobile), B+A cascading architecture — per-voice threads + per-voice pipeline-ahead | Headroom for ambition — #40/#41 and future counterpoint/symphony work will cap JS single-thread. Audio synthesis already on native thread; JS bottleneck is composition decisions. B is skeleton (per-voice threads), A is intelligence (lookahead per voice). Vision: live band of composers. Spec: SPEC_057. Umbrella: #58. |
| 2026-04-17 | "Rust is the road" — pause new JS feature work during migration | Momentum > parallel tracks. In-flight QA (#30/#42/#44/#56) finishes its cycle; new build sessions on #40/#41/#43/#45/#46/#47/#38/#18/#19/#13/#12/#11 pause. Work ports into Phase 2a/2b/3 or re-evaluates for Rust. |

---

## 7 · DO THIS NEXT

**Status: Rust migration — Phase 2b-2 (#82) built, awaiting QA. Phase 2b-1 (#81) qa-pass aram-closed. Phase 2a complete (#60).**

| | |
|---|---|
| **Umbrella** | **#61** Phase 2b (open) — closes qa-pass once #82 passes (#81 already closed) |
| **Awaiting QA** | **#82** Phase 2b-2: VoicingEngine (SPEC_040 §3/§5/§6) + harmonic rhythm (SPEC_040 §4) + WalkingBass next-chord + cadential planning + 4-voice lookahead infra, all feature-flagged behind `--enable-2b2` (Opus) — needs-aram |
| **After 2b** | **#89** Desktop UI overhaul (egui, Windows v1) [umbrella] — sub-issues **#90** Build A (scaffold + Simple tab + presets + visualizer + shortcuts) → **#91** Build B (Engineer tab + parameter surface + QA tooling) (Sonnet both). Supersedes #62 per SPEC_062_UI_OVERHAUL.md. |
| **Rust backlog** | **#56** noir_jazz palette design — reference for Rust port<br>**#92** Android APK via eframe + cargo-apk (P3, parked until #89 stable) |
| **Chain** | #82 → #90 → #91 |

JS backlog cleared 2026-04-18 — all legacy issues closed as not_planned. Logic migrates into Rust phases per comments on each issue.

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
| Closed issue lingers in Backlog | Trust §7. Quick sync only checks current issue. Full `list_issues` in Plan/Audit sessions only — that's when §7 gets reconciled. |
| §7 description written without reading the issue | Never change or write a §7 issue description unless the issue was read in the same session. Restructuring the table (removing rows, reformatting) = preserve existing text exactly, word for word. |
| INDEX.md stale after build | After adding/moving/removing functions, update INDEX.md rows + line numbers in same session. |
| Reading whole src/ files | Use INDEX.md address → Read file:line±20. Never read a whole module to locate a function. |
| QA Brief only in chat, not GitHub | Build sessions must post QA Brief as a GitHub comment on the issue. Chat is not a substitute. |
| Over-splitting build issues | Default = batch. Split only when: model mismatch, QA gate, scope >40 edits, or true independence. |
| MCP validation errors | Fix ALL fields from error payload in one pass, propagate to sibling calls. Never use \n in body fields — use real newlines. |
| onPhaseChange fires before mute clears | Any `_playMelodyNote` call in `onPhaseChange` while `_muted=true` creates a live legato osc — poisoning the first real tick. Always guard with `this._muted` check. |
| Legato LPF burst at phrase entry | Legato re-trigger path fires LPF from peak even after a rest, when filter was already closed. Use `_phraseEntry` flag (true on `_phrasePos===1`) to start LPF at base not peak on first note of each phrase. |
| Game state reference in audio | All G.* fields must exist in state.js — grep for G. references after any audio module change |
| StateMapper expects game objects | StateMapper references PerkEffects* — stub or guard with typeof checks |
| Standalone synth fns lack palette access | _synthBass/_synthDrum are module-scope functions, not Sequencer methods — they only see _activePaletteName, not the full palette object. When adding per-palette config reads, ensure _activePalette (full object) is set alongside _activePaletteName in Sequencer.initRun(). |
| `git push` scope | Plan approval covers follow-through push — don't re-ask. For no-plan sessions, confirm once before pushing. If Aram says no-go, ask what to improve instead of stopping silently. Never force-push. |
| Large file truncation by Edit/Write tool | **Never use Edit or Write on files >600 lines.** Use bash+sed/awk for targeted edits: `sed -i 's/old/new/g'` for replacements, heredoc+awk for insertions. Always verify line count after: `wc -l src/file.js` and check tail: `tail -5 src/file.js`. If line count drops unexpectedly, restore from git immediately: `git checkout HEAD -- src/file.js`. Affected files: melody.js (1644), sequencer.js (2719), harmony.js (2492), state_mapper.js (1069), narrative.js (1054). |
| Orphan branch (no issue, no PR) | All branches named `claude/issue-NN-slug`. Session-start §1 step 4 flags bare `claude/*` branches. Never delete a branch without Aram's OK. |
| PR merged without `Closes #NN` | PR body must include `Closes #NN` or `Refs #NN`. Session-start check audits last 10 merged PRs; flag misses to Aram. |
| Commit without issue ref | Commit messages use `[#NN] subject` prefix. `[#infra]` allowed for meta work. Reject vague messages like "edits" — rewrite before push. |
| qa-improve via GitHub label only | qa-improve/fail always require chat — Claude must write and confirm new SPEC immediately. Only qa-pass is GitHub-async. |
| Sub-issue created without native parent link | Body-text `Parent: #NN` is not enough — GitHub's native sub-issue tree drives the progress bar and issue-list nesting. After `issue_write method:create`, always follow with `sub_issue_write method:add issue_number:<parent> sub_issue_id:<child GraphQL id>`. The `sub_issue_id` comes from the `id` field of the create response, NOT the issue number. |
| Commits orphaned on a branch after its PR merged | Once a PR merges mid-session, its branch is a dead-end — further commits on it don't reach main. Before committing any additional "should go to main" work, check the branch state: if the PR is merged, `git checkout -b claude/<new-slug> origin/main` and `git cherry-pick` any orphaned commits onto the fresh branch. Push the new branch as a separate PR. Session-end checklist step 6 ("push unpushed commits") must verify the target branch still has an open path to main. |

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
