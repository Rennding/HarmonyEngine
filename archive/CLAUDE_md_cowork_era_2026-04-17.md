# Archive: CLAUDE.md Cowork-era rules removed 2026-04-17

Context: Aram migrated from Cowork (web AI with limited fs/git) to Claude Code (CLI with full fs + direct git). Lines below were removed or reworded in CLAUDE.md because they encoded Cowork-era constraints or referred to a retired tool (GitHub Desktop, Cowork).

If any of these rules turns out to matter again, restore the "Before" text.

---

## §2 Protocol · Write order (line 29)

**Before**
```
GitHub first (relabel, close, comment), local second (DEVLOG, this file).
```

**After**
```
Relabel/close/comment the issue, mirror to DEVLOG, update §7 — all in one pass before session end.
```

**Why changed**: "GitHub first" ordering existed because Cowork's remote writes were fragile, so they were done first to bail early on MCP failure. Claude Code writes both local and remote cheaply — ordering no longer matters.

---

## §2 Protocol · Forbidden (line 35)

**Before**
```
- `create_or_update_file` / `push_files` — these ARE pushes
```

**After**
```
- `create_or_update_file` / `push_files` (GitHub MCP) — they write directly to the remote, bypassing local git, hooks, and `npm run validate`. Use `git add/commit/push` instead.
```

**Why changed**: Rule retained, rationale sharpened. The MCP write tools still exist in Claude Code and would still skip local git flow if used.

---

## §2 Protocol · Roles (line 47)

**Before**
```
- **Aram** = designer + QA. Never codes. Tests in browser, reports via GitHub or Cowork.
```

**After**
```
- **Aram** = designer + QA. Never codes. Tests in browser, reports via GitHub issues/comments.
```

**Why changed**: Cowork retired.

---

## §3 Session types · QA workflow (line 99)

**Before**
```
1. GitHub first: relabel (remove needs-aram, apply verdict), close if pass
```

**After**
```
1. Relabel (remove needs-aram, apply verdict), close if pass
```

**Why changed**: Drop Cowork-era ordering; the action is the same.

---

## §4 Session end · step 6 (line 134)

**Before**
```
6. Remind Aram to push via GitHub Desktop
```

**After**
```
6. Push unpushed commits at session end. Plan approval (ExitPlanMode) covers the follow-through push — no second confirmation. For sessions with no plan-approval step (quick prefixes, audits, ad-hoc edits), summarize unpushed commits and ask for a one-word go/no-go first. Never force-push.
```

**Why changed**: Aram retired GitHub Desktop. Claude Code can run `git push` directly. Aram's preference: the ExitPlanMode approval itself is the go-ahead — re-asking at session end is redundant. For sessions without a plan-approval step, a one-word confirmation is still needed because there was no prior scope approval.

---

## §8 Failure modes · new row added

**Added**
```
| `git push` scope | Plan approval covers follow-through push — don't re-ask. For no-plan sessions, confirm once before pushing. If Aram says no-go, ask what to improve instead of stopping silently. Never force-push. |
```

**Why added**: New affordance (`git push`) needs a guardrail row matching session-end step 6.

---

## Deferred (not changed this pass)

- `src/diagnostic.js:60` — `// Format for clipboard (paste-ready for GitHub/Cowork)` — code comment, not user-visible.
- `specs/SPEC_042_AUDIO_DIAGNOSTIC_SYSTEM.md:235, 393` — "paste-ready for GitHub/Cowork" strings in a shipped spec; left in historical record.
- `ONBOARDING.md:53` — push-method template question for future projects, not day-to-day for this repo.

These can be swept later in one pass.
