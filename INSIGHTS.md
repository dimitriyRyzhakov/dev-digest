# dev-digest (cross-cutting) — insights

Append-only. Written via the `engineering-insights` skill (.claude/skills/engineering-insights). One insight per bullet.
Format: `- YYYY-MM-DD — <context/trigger> → <what to do instead> (evidence: path#symbol | command)`
Never edit or delete entries; correct with a new dated `supersedes …` entry.

## What Works
<!-- approaches and solutions that worked here -->

## What Doesn't Work
<!-- dead ends and antipatterns, with why — the most valuable section -->

## Codebase Patterns
<!-- conventions and architecture decisions, with the reason -->
- 2026-11-24 — Agent instructions are shared with Codex/other agents → ALWAYS edit `AGENTS.md` (root + per package); `CLAUDE.md` is only an `@AGENTS.md` import stub for Claude Code, put nothing shared there (evidence: CLAUDE.md, server/CLAUDE.md)

## Tool & Library Notes
<!-- dependency / CLI quirks -->
- 2026-11-19 — Creating several new files in one Bash call (`mkdir -p` + multiple `cat > … <<EOF`) got rejected by Claude Code's removal safety check → use the Write tool per new file; Python heredoc string-replace edits of existing files pass fine (evidence: client/src/components/run-cost-badge/*)
- 2026-11-24 — The self-review PreToolUse hook sees the WHOLE Bash command text, so a plain `gh pr create` substring match blocked heredocs/echo/test commands that only mention it → match only in command position, and feed gate test cases from a file, never inline in the Bash call (evidence: .claude/skills/self-review/scripts/self-review.mjs#PR_CREATE)
- 2026-11-24 — `pnpm lint:arch` in a scratch `git worktree` with symlinked `node_modules` reports baseline violations as new (drizzle resolves to an absolute `../../Users/…/node_modules` path, not the baseline's) → judge lint:arch only in the real checkout, or `pnpm install` inside the worktree (evidence: server/.dependency-cruiser-known-violations.json)

- 2026-11-24 — Built-in browser pane has no file-upload tool, so a hidden `<input type=file>` can't be driven by clicks → in `javascript_tool` build a `File` from base64, set it via `new DataTransfer()` → `input.files = dt.files`, then dispatch a bubbling `change` event (evidence: client/src/app/skills/_components/SkillImportModal)

## Recurring Errors & Fixes
<!-- error message → fix -->
- 2026-11-19 — `EADDRINUSE` on :3000/:3001 or port still busy after stopping a dev server → an earlier `./scripts/dev.sh` run leaves orphaned `next-server` / `tsx watch src/server.ts` processes; find them with `lsof -nP -iTCP:<port> -sTCP:LISTEN`, kill the `tsx watch` parent (not only the child), then restart (evidence: scripts/dev.sh#cleanup)

## Session Notes
<!-- ### YYYY-MM-DD + 1–3 bullets: what was done, what was decided -->

## Open Questions
<!-- still unclear; move out once answered -->
