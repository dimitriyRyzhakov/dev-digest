# dev-digest (cross-cutting) — insights

Append-only. Written via the `engineering-insights` skill (.claude/skills/engineering-insights). One insight per bullet.
Format: `- YYYY-MM-DD — <context/trigger> → <what to do instead> (evidence: path#symbol | command)`
Never edit or delete entries; correct with a new dated `supersedes …` entry.

## What Works
<!-- approaches and solutions that worked here -->
- 2026-11-25 — Testing whether a review skill actually changes findings → run the real engine offline: a tsx script in `server/` calling `reviewPullRequest` + `OpenRouterProvider` with the agent's `system_prompt`/model from `GET /agents/:id` and skills from `GET /skills`, on diffs built with `git diff` from before/after trees, control (no skills) vs with-skills, ≥3 reps each, plus negative cases that must stay `approve`; no GitHub PR needed, ~$0.02 per 40 runs on deepseek-v4-flash (evidence: docs/skills/breaking-change.md, reviewer-core/src/review/run.ts#reviewPullRequest)
- 2026-11-28 — Checking an LLM-backed UI card (IntentCard) without paying for a model call → insert one fixture row into the local DB (`docker exec -i devdigest-postgres psql -U devdigest -d devdigest`), tagged with a marker column value (`input_hash='tmpfixture'`), load the page in the browser pane, flip fields with UPDATE for each state (medium/low), then DELETE by the marker (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard)

## What Doesn't Work
<!-- dead ends and antipatterns, with why — the most valuable section -->
- 2026-11-25 — Skill scope gates and exceptions written only in the skill BODY ("no version line in the diff → report nothing", "pre-1.0 break → WARNING") were ignored by deepseek-v4-flash (2/3 runs still flagged "missing MAJOR bump") → put the gate in the skill `description` (read first, ≤500 chars): that fixed it 3/3; an exception that needs facts from ANOTHER file (package.json version vs a cli.ts break) stayed ignored 0/3 even there (evidence: docs/skills/semver-discipline.md, docs/skills/breaking-change.md)

## Codebase Patterns
<!-- conventions and architecture decisions, with the reason -->
- 2026-11-24 — Agent instructions are shared with Codex/other agents → ALWAYS edit `AGENTS.md` (root + per package); `CLAUDE.md` is only an `@AGENTS.md` import stub for Claude Code, put nothing shared there (evidence: CLAUDE.md, server/CLAUDE.md)

## Tool & Library Notes
<!-- dependency / CLI quirks -->
- 2026-11-19 — Creating several new files in one Bash call (`mkdir -p` + multiple `cat > … <<EOF`) got rejected by Claude Code's removal safety check → use the Write tool per new file; Python heredoc string-replace edits of existing files pass fine (evidence: client/src/components/run-cost-badge/*)
- 2026-11-24 — The self-review PreToolUse hook sees the WHOLE Bash command text, so a plain `gh pr create` substring match blocked heredocs/echo/test commands that only mention it → match only in command position, and feed gate test cases from a file, never inline in the Bash call (evidence: .claude/skills/self-review/scripts/self-review.mjs#PR_CREATE)
- 2026-11-24 — `pnpm lint:arch` in a scratch `git worktree` with symlinked `node_modules` reports baseline violations as new (drizzle resolves to an absolute `../../Users/…/node_modules` path, not the baseline's) → judge lint:arch only in the real checkout, or `pnpm install` inside the worktree (evidence: server/.dependency-cruiser-known-violations.json)
- 2026-11-27 — A subagent file created mid-session in `.claude/agents/` is not picked up by the Agent tool (`Agent type 'researcher' not found`) → smoke-test new agents in a NEW session; in the creating session only check the frontmatter parses (evidence: .claude/agents/researcher.md)

- 2026-11-24 — Built-in browser pane has no file-upload tool, so a hidden `<input type=file>` can't be driven by clicks → in `javascript_tool` build a `File` from base64, set it via `new DataTransfer()` → `input.files = dt.files`, then dispatch a bubbling `change` event (evidence: client/src/app/skills/_components/SkillImportModal)
- 2026-11-25 — Built-in browser pane `fetch` to another local port (`http://127.0.0.1:8765`, even with CORS headers) fails with `TypeError: Failed to fetch` → to feed files into the UI, copy them temporarily to `client/public/<tmp>/`, fetch same-origin from :3000, then delete the folder (evidence: client/src/app/skills/import)
- 2026-11-25 — Scripts outside the API that need the OpenRouter key: `server/.env` `OPENROUTER_API_KEY` is empty here; the key entered in the UI lives in `~/.devdigest/secrets.json` → read it with `new LocalSecretsProvider(join(homedir(), '.devdigest', 'secrets.json')).get('OPENROUTER_API_KEY')`, never print it (evidence: server/src/adapters/secrets/local.ts, server/src/platform/config.ts#secretsPath)
- 2026-11-27 — Write of a new `.claude/agents/*.md` in auto mode was denied by the classifier ("Destructive or Unwanted Actions") — agent configs count as self-modification → don't work around it; show the drafted content, ask the user to allow it explicitly, then retry the same Write (passed after the user's yes) (evidence: .claude/agents/planner.md)
- 2026-11-27 — supersedes 2026-11-27 "subagent file … not picked up": `.claude/agents/{doc-writer,architecture-reviewer,test-writer,plan-verifier}.md` written by forks mid-session DID appear in the Agent tool within minutes of each Write → a new agent may be usable in the same session; still smoke-test before relying on it, and fall back to a new session if `Agent type … not found` (evidence: .claude/agents/doc-writer.md)
- 2026-11-27 — `node --test .claude/agents/hooks/` (a folder) on Node 26 also runs the guard modules themselves; their `main()` waits on stdin, so the run hangs to the timeout → pass test files: `node --test '.claude/agents/hooks/*.test.mjs'`; readonly-bash-guard allows only `*.test.mjs` paths for that reason (evidence: .claude/agents/hooks/readonly-bash-guard.mjs#checkNode)
- 2026-11-27 — `segments()` drops the word `exec` (and `env`, `sudo`, `command`, `VAR=x`) anywhere in a segment, so `pnpm exec vitest -u` reaches a guard as `pnpm vitest -u` → guards built on it must match both forms of an exec'd tool (evidence: .claude/agents/hooks/shell-segments.mjs#segments)
- 2026-11-27 — Smoke run of architecture-reviewer: `segments()` is not quote-aware, so `git diff -G"a|b"` and `--grep='a -> b'` were blocked as pipe / redirect → readonly-bash-guard masks metacharacters inside quotes first (`maskQuoted`), but must keep `$(` inside `"…"` visible — a first version masked the `(` and let `git log "$(rm x)"` through; a block-case test caught it (evidence: .claude/agents/hooks/readonly-bash-guard.mjs#maskQuoted)
- 2026-11-27 — Three security passes on the agent guard hooks each found new bypasses of word-matching rules: path / quoted command words (`/usr/bin/git`, `"gh"`), `VAR=x` prefixes (`GIT_EXTERNAL_DIFF=rm git diff`), and shell expansion AFTER the guard (`--out\put=…`, `{--output=…,x}`, `.cl*/`), plus write-capable tool flags a denylist missed (vitest `--output-file`, eslint `--suppress-all`) → for restricted agents use allowlists on three levels: command names (bare word only), characters (`unsafeShellChar`: anything the shell would expand or un-escape is blocked) and tool flags (`tool-flags.mjs`); a denylist guard (implementer) is only a tripwire — say so and rely on Claude Code sandbox / permissions for isolation (evidence: .claude/agents/hooks/shell-segments.mjs#unsafeShellChar, .claude/agents/hooks/tool-flags.mjs)
- 2026-11-28 — As the implementer agent, implementer-guard blocked: Bash heredocs (`python3 - <<'EOF'`, `cat >> f <<'EOF'`), grep patterns containing `\b`/`\s`/`|`-escapes or the word `patch`, `cd` into `[repoId]` paths, `for` loops writing to `$i` paths and any write outside the repo (even the scratchpad) → edit with the Edit/Write tools, grep with plain `-e word -e word` patterns, quote bracketed paths as `ls "<abs path>"` instead of `cd` (evidence: .claude/agents/hooks/implementer-guard.mjs)
- 2026-11-28 — As the test-writer agent, test-writer-guard blocked `pnpm lint`, `grep`, any `*`/`\` in a command and every `[repoId]`/`[number]` path (ls, vitest) → use Read for bracketed files, `pnpm exec eslint --no-warn-ignored src` for lint, and run route tests by name filter (`pnpm exec vitest run DiffTab.test useStickyOffset.test`) (evidence: .claude/agents/hooks/test-writer-guard.mjs)

## Recurring Errors & Fixes
<!-- error message → fix -->
- 2026-11-19 — `EADDRINUSE` on :3000/:3001 or port still busy after stopping a dev server → an earlier `./scripts/dev.sh` run leaves orphaned `next-server` / `tsx watch src/server.ts` processes; find them with `lsof -nP -iTCP:<port> -sTCP:LISTEN`, kill the `tsx watch` parent (not only the child), then restart (evidence: scripts/dev.sh#cleanup)

## Session Notes
<!-- ### YYYY-MM-DD + 1–3 bullets: what was done, what was decided -->

## Open Questions
<!-- still unclear; move out once answered -->
