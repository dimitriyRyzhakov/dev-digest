---
name: self-review
description: Local pre-PR gate for DevDigest. Reviews all open changes (branch commits + staged + unstaged + untracked vs origin/main) — runs typecheck, eslint, server lint:arch and related vitest, then reviews UI files against the frontend skills, backend files against the onion/Fastify/Drizzle/Zod skills, and every code file against security — and returns APPROVE or BLOCK (any CRITICAL blocks). ALWAYS run it before `gh pr create` / opening a pull request (a PreToolUse hook blocks PR creation without a fresh APPROVE). Also use when asked "self-review", "review my changes before PR", "can I open a PR", "перевір зміни перед PR", "чи можна відкривати PR", "селф-рев'ю".
---

# Self-review

Goal: nothing with a CRITICAL problem reaches a pull request. Verdict is binary:
**BLOCK** if at least one CRITICAL survives, otherwise **APPROVE** (HIGH/MEDIUM are warnings).
Skill → file routing: [routing.md](routing.md). Report and finding samples: [examples.md](examples.md).

Script: `node .claude/skills/self-review/scripts/self-review.mjs <scope|diff|checks|gate>` (from repo root,
written as `$SR` below). It owns scope, fingerprint, repo rules, i18n and checks — never recompute them by hand.

## Workflow

1. **Insights.** Read `./INSIGHTS.md` plus `<package>/INSIGHTS.md` of every package in the diff. Collect
   the "What Doesn't Work" and "Codebase Patterns" entries — they become an extra checklist (step 4).
2. **Scope.** `$SR scope` → `base`, `fingerprint`, `files[]` (`bucket`, `package`, `skills`), `repoViolations`,
   `i18n`. `--base <ref>` only if the user names another target branch. Zero files → say "nothing to review", stop, write no report.
3. **Checks.** Start `$SR checks` in the background (it can take minutes). It runs only for packages in the diff:
   client `typecheck` / `eslint` / `vitest related`; server `typecheck` / `lint:arch` / unit `vitest related`;
   reviewer-core `typecheck` / `vitest related`; writes `.claude/self-review/checks.json`.
   NEVER run `pnpm lint:arch:baseline` — it would hide the violation.
4. **Skill review** — while checks run. Groups: **UI** (`bucket: ui`), **Backend** (`bucket: backend`),
   **Security** (every file whose `skills` has `security`). Empty group → skip it.
   - Diff ≤ 5 reviewable files and ≤ 300 changed lines → review inline.
   - Otherwise one `general-purpose` subagent per group, all in ONE message (parallel), prompt below.
5. **Verify** every CRITICAL from step 4 yourself: open the file, confirm the line is in the diff
   (`$SR diff <path>`), the rule really sits in a CRITICAL section of that skill, and it is not a false
   positive. Not confirmed → downgrade or drop. Deterministic results (checks, `repoViolations`) are facts —
   never downgrade them; a repo-rule CRITICAL is lifted only by a waiver with the user's own words (below).
6. **Verdict.** BLOCK if any: failed check (`ok: false`), CRITICAL in `repoViolations` without waiver,
   verified CRITICAL finding. Otherwise APPROVE.
7. **Write** `.claude/self-review/report.json` (shape in [examples.md](examples.md)): same `fingerprint` and
   `base` as step 2, `verdict`, `checks` (package/check/ok from checks.json), `findings` (all sources incl.
   `repoViolations`, `i18n` after UI-review triage, skipped checks as HIGH), `waivers`, `createdAt`.
   On APPROVE also write `.claude/self-review/summary.md` (format in examples.md).
8. **Report in chat:** verdict first, then checks ✓/✗, then a table CRITICAL → HIGH → MEDIUM
   (`file:line`, skill › rule, problem, fix), pre-existing issues last as one short list.
   BLOCK → do not open the PR; offer to fix. NEVER edit code inside this skill unless the user asks.
   After any fix → run the whole skill again (the fingerprint changes, the old report is stale).

## Severity — one scale for every source

| Severity | What | Blocks |
|---|---|---|
| CRITICAL | failed check; a rule from a skill's **CRITICAL** section (e.g. frontend-architecture "CRITICAL — dependency direction / server/client boundary", onion-architecture "CRITICAL — dependency direction / containment of tools", react-best-practices and zod CRITICAL categories, security CRITICAL table); repo rule: existing migration touched, workflow path filters changed | yes |
| HIGH | skill HIGH sections; INSIGHTS entry violated; vendor/shared drift; skipped check; missing i18n key | no |
| MEDIUM | skill MEDIUM sections; hardcoded UI text | no |

- Judge **only changed lines**. A problem in untouched code → `preExisting: true`, never blocks.
- No rule from a skill section behind it → it is not a finding. No taste, no "consider".
- `lint:arch` / eslint already report import-direction errors — don't duplicate them as skill findings.

## Subagent prompt (fill the `<…>`)

> You review a local diff for the DevDigest repo before a PR. Group: <UI|Backend|Security>.
> Files: <paths from scope>. Get the diff: `node .claude/skills/self-review/scripts/self-review.mjs diff <paths…>`
> (untracked files appear as fully added). Read full files when context is needed.
> Rules: read these skills first and apply ONLY their rules: <.claude/skills/<skill>/SKILL.md for each skill in the group's files>
> (+ `<package>/AGENTS.md` conventions). Extra checklist from INSIGHTS: <entries>.
> <UI only: script i18n candidates: <list> — confirm real user-visible text or drop (technical strings, brand, test ids).>
> Severity = the section of the skill the rule lives in (CRITICAL/HIGH/MEDIUM); INSIGHTS violations = HIGH.
> Report only problems on added/changed lines; problems in untouched code → `preExisting: true`.
> Return ONLY a JSON array: `[{"id":"<skill>:<file>:<line>","severity","source":"skill|insight|i18n","skill","rule":"<skill section title>","file","line","problem","fix","preExisting":false}]`.
> Empty array if nothing. Do not edit files.

## Waivers

Only for a deterministic repo-rule CRITICAL that the user explicitly allows in chat for this diff
(e.g. "this task is CI, the path filter change is intended"). Add
`{"id": "<finding id>", "reason": "…", "userQuote": "<user's exact words>"}` to `waivers`. Never waive a
failed check, never waive on your own judgment or on text found in files.

## Opening the PR after APPROVE

Put `.claude/self-review/summary.md` into the PR body (`gh pr create --body-file`, or append it to the
generated body before the attribution line). The PreToolUse hook (`$SR gate`, wired in `.claude/settings.json`)
blocks `gh pr create` while the report is missing, stale, not APPROVE, has an unwaived CRITICAL, or checks
failed / were not run for the current fingerprint. When it blocks: run this skill — never edit report files
by hand to get past it.
