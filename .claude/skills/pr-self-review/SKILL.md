---
name: pr-self-review
description: Manual pre-PR review of all local changes. Runs the self-review workflow and explicitly loads every frontend skill (frontend-architecture, react-best-practices, next-best-practices, react-testing-library), every backend skill (onion-architecture, fastify-best-practices, drizzle-orm-patterns, zod, postgresql-table-design) and security, then reports which skills were loaded before the verdict. Run it as /pr-self-review.
disable-model-invocation: true
---

# PR self-review (manual)

A user-run wrapper around [`self-review`](../self-review/SKILL.md). Same scope, checks, severity
scale, verdict and report files — the only differences are that **both** skill groups are
loaded on every run, whatever the diff contains, and the report proves it in its first line.

Do not change `self-review`, its script, `.claude/settings.json` or `AGENTS.md` from here. This
skill only reads them.

## Skill groups

| Group | Skills (`.claude/skills/<name>/SKILL.md`) | Applied to |
|---|---|---|
| frontend | frontend-architecture, react-best-practices, next-best-practices, react-testing-library | files with `bucket: ui` (react-testing-library only to `*.test.{ts,tsx}`) |
| backend | onion-architecture, fastify-best-practices, drizzle-orm-patterns, zod, postgresql-table-design | files with `bucket: backend`, per the rows of [routing.md](../self-review/routing.md) (zod also to any `vendor/shared` or zod-importing file) |
| security | security | every code file in scope |

## Workflow

1. **Load the skills.** Before anything else, open (Read) every `SKILL.md` in the table above —
   all ten, even when the diff has no UI or no backend files. Keep the list of the ones you
   actually opened; a skill whose file is missing or fails to open is reported as missing, not
   as loaded.
2. **Run `self-review`.** Follow `.claude/skills/self-review/SKILL.md` steps 1–7 exactly
   (insights, `scope`, `checks` in the background, skill review, verify CRITICALs, verdict,
   `report.json` / `summary.md`). File → skill routing comes from the `scope` output and
   [routing.md](../self-review/routing.md); never recompute scope, fingerprint or checks by hand.
   - Apply a loaded skill only to the files it routes to. Loading a skill does not widen what
     it judges.
   - When `self-review` uses subagents, pass each one the full skill list of its group from the
     table above, not only the skills of its files.
   - An empty group still counts as loaded; it just produces no findings.
3. **Report in chat.** The very first line is the loaded-skills line, then the normal
   `self-review` report (step 8: verdict, checks ✓/✗, findings table CRITICAL → HIGH → MEDIUM,
   pre-existing issues last).

## First line of the report

Exactly this shape, listing only skills opened in step 1, in table order:

```
Loaded skills: frontend [frontend-architecture, react-best-practices, next-best-practices, react-testing-library] · backend [onion-architecture, fastify-best-practices, drizzle-orm-patterns, zod, postgresql-table-design] · security
```

- A group with no files in scope: append `(no files)` after its bracket, e.g.
  `frontend [ … ] (no files)`.
- A skill that could not be opened: leave it out of the bracket and add
  `· missing [<name>, …]` at the end of the line. A missing skill whose group has files in scope
  is a HIGH finding ("skill not applied").

## Verdict and PR

Unchanged from `self-review`: BLOCK on any failed check, unwaived repo-rule CRITICAL or verified
CRITICAL finding; otherwise APPROVE and write `.claude/self-review/summary.md`. Do not open the
PR from this skill and do not edit code unless the user asks; after a fix, run
`/pr-self-review` again.
