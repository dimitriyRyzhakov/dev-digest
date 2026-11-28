# server — insights

Append-only. Written via the `engineering-insights` skill (.claude/skills/engineering-insights). One insight per bullet.
Format: `- YYYY-MM-DD — <context/trigger> → <what to do instead> (evidence: path#symbol | command)`
Never edit or delete entries; correct with a new dated `supersedes …` entry.

## What Works
<!-- approaches and solutions that worked here -->
- 2026-11-25 — Conventions extractor: a cheap model (deepseek-v4-flash) ignored the prompt asks for 3–15 line evidence and calibrated confidence (every candidate was one line at 0.9) → enforce quality in code after grounding: widen evidence with real file lines, cap confidence by supporting-file count, cap candidates per file, diversify samples per directory; the prompt alone is not enough (evidence: server/src/modules/conventions/domain.ts#evidenceFromFile, #calibrateConfidence)
- 2026-11-19 — Need a FAILED review run in an `.it.test` → pass a structured fixture that fails the Review schema (e.g. `appWith({ not: 'a review' })`); `MockLLMProvider.completeStructured` throws and the executor's real failure path runs (evidence: server/test/reviews.it.test.ts "a FAILED review run stores cost_usd = null")
- 2026-11-28 — Testing the intent timeout through the executor: `Container.intentService` hardcodes `INTENT_TIMEOUT_MS` (20 s) with no override → in the `.it.test` build `new ReviewRunExecutor(app.container, new ReviewRepository(db), container.agentsRepo, new IntentService({ …, timeoutMs: 50 }))`, create the run with `repo.createAgentRun` and `await executor.executeRuns(...)` directly (evidence: server/test/intent.it.test.ts "(i) classifier never resolves")

## What Doesn't Work
<!-- dead ends and antipatterns, with why — the most valuable section -->
- 2026-11-28 — Ref/link regexes run on the full untrusted PR body (GitHub allows ~65k chars): an unanchored `([\w.-]+)\/([\w.-]+)#(\d+)` and `\]\(([^)\s>]+)` went quadratic and blocked the single Fastify event loop ~30 s per review run → clip text before any regex (`INTENT_LIMITS.parseChars` / `bodyParseChars`), add a left lookbehind + bounded quantifiers, and keep a 65k adversarial-body test with a time budget (evidence: server/src/modules/intent/domain.ts#parseTicketRefs, test/intent-domain.test.ts "ReDoS guard")

## Codebase Patterns
<!-- conventions and architecture decisions, with the reason -->
- 2026-11-25 — Grounding LLM-cited evidence by reading the cited path from the clone let a hallucinated/injected path (e.g. `.env`) be read, widened and stored, though `readContainedFile` blocked traversal → ground only against files actually sent to the model (keep a path→content map of the input), never re-read model-named paths (evidence: server/src/modules/conventions/service.ts#extract, test/conventions.it.test.ts "never grounds evidence in a clone file that was not sent")
- 2026-11-19 — Run cost needed in UI → use `outcome.costUsd` from `reviewPullRequest` (OpenRouter `usage.cost`, else `PriceBook` estimate), persisted to `agent_runs.cost_usd`; NEVER re-estimate from tokens or add model calls (evidence: server/src/modules/reviews/run-executor.ts#execute, reviewer-core/src/llm/openrouter.ts)
- 2026-11-19 — Adding a field to `RunStats`/`RunTrace` (stored as jsonb in `run_traces`) → ALWAYS make it `.nullish()`, else traces persisted before the change fail to parse (evidence: server/src/vendor/shared/contracts/trace.ts#RunStats.cost_usd)

- 2026-11-24 — New adapter (e.g. zip reader for skill import) needs a port, but `src/adapters/**` may not import `src/modules/**` → declare the port in `vendor/shared/adapters.ts` (mirror to client), keep module-only ports (store interfaces) in `modules/<m>/ports.ts`, wire both in `container.ts` (evidence: server/src/adapters/skill-archive/index.ts, server/src/modules/skills/ports.ts)
- 2026-11-28 — Code-derived strings built from author-controlled diff text (a `package.json` key → `New dependency: <name>`) were placed on a TRUSTED prompt line, so a key like `"Ignore all prior rules…"` became an instruction → validate such values against a strict grammar (npm name regex) or put them inside `wrapUntrusted`; "derived by code" does not mean trusted (evidence: server/src/modules/intent/domain.ts#NPM_NAME_RE)
- 2026-11-28 — A new private method in a legacy file (`run-executor.ts`) copied its neighbours' `PullRow` / `schema.repos.$inferSelect` params → self-review blocked it as onion CRITICAL (legacy list = "do not copy"); give new methods the port's input types (`IntentPullInput`/`IntentRepoInput` in reviews/ports.ts) and map rows at the call site (evidence: server/src/modules/reviews/run-executor.ts#resolveIntent)

## Tool & Library Notes
<!-- dependency / CLI quirks -->
- 2026-11-19 — USD/float columns in Drizzle → use `doublePrecision`, not `numeric` (postgres.js returns `numeric` as string, breaking `z.number()` contracts) (evidence: server/src/db/schema/runs.ts#agentRuns.costUsd)
- 2026-11-25 — `pnpm db:generate` failed with `Interactive prompts require a TTY terminal` when a schema change dropped one column and added another (drizzle-kit asks "rename?") → generate in two steps: first add the new columns while keeping the old one (hand-append the backfill `UPDATE` to that NEW migration), then drop the old column and generate again (evidence: server/src/db/migrations/0013_conventions_status.sql, 0014_conventions_drop_accepted.sql)
- 2026-11-28 — A Zod schema with `.default()` fields passed to `llm.completeStructured` types `res.data` from the schema INPUT, so defaulted arrays/booleans come back as `T | undefined` → restate them in the service (`res.data.signals ?? []`); the parse already filled them at runtime (evidence: server/src/modules/intent/service.ts#resolveForReview)
- 2026-11-28 — `git ls-tree <sha> -- <path>` prints non-ASCII paths C-quoted (`"docs/\320\277…"`) under the default `core.quotePath`, so comparing its path column to the requested path silently refused every Cyrillic spec name → parse git path output with `-z` (or `-c core.quotePath=false`), never compare the quoted form (evidence: server/src/adapters/git/simple-git.ts#showFile, test/git-adapter-safety.test.ts "non-ASCII (Cyrillic) name")

## Recurring Errors & Fixes
<!-- error message → fix -->
- 2026-11-25 — `pnpm lint:arch` reported a circular dependency once the container wired a service that called `modules/settings/feature-models.ts` (it took a `Container`) → helpers the container uses take a narrow `{ db }`, not `Container` (evidence: server/src/modules/settings/feature-models.ts#getFeatureModelOverride)
- 2026-11-19 — `pnpm db:migrate` prints `{ severity: 'NOTICE', code: '42710' … }` objects (vector extension / drizzle schema already exist) that look like failures → ignore them; success = final `✓ migrations applied` line (evidence: server/src/db/migrate.ts)
- 2026-11-19 — Whole API process died with a raw `GitError … Repository not found` after Refresh on the seeded fake repo `acme/payments-api` → cause was an unhandled rejection of `EnqueuedJob.done` (callers fire-and-forget); keep `done.catch(() => {})` in `JobRunner.enqueue` and NEVER rethrow from a job path nobody awaits (evidence: server/src/platform/jobs.ts#enqueue, server/test/jobs-runner.test.ts)
- 2026-11-19 — supersedes 2026-11-19 entry on `EnqueuedJob.done`: the `done.catch` fix and `jobs-runner.test.ts` were reverted at user request → crash is STILL present; a failed clone/index job (e.g. Refresh on seeded `acme/payments-api`) kills the API, so restart `./scripts/dev.sh` after it (evidence: server/src/platform/jobs.ts#enqueue)
- 2026-11-25 — `pnpm test` printed `26 passed | 6 skipped` and exit 0 while Docker was up: every `*.it.test.ts` (incl. conventions/skills) was skipped because `dockerAvailable()` runs `docker info` with a 5 s timeout, which loses under 32 parallel test files → a green `pnpm test` does NOT prove integration tests ran; check for `↓ …it.test.ts` and run `pnpm exec vitest run .it.test` separately (44/44 then) (evidence: server/test/helpers/pg.ts#dockerAvailable)
- 2026-11-25 — Changed a PR's base on GitHub (main → demo branch), but the review still diffed against `main`: the PR-list sync's `onConflictDoUpdate` sets only title/headSha/status, so `pull_requests.base` keeps the old value (pr_files do refresh on PR detail) → after a base change update `base` in the DB (or add `base` to the conflict `set`), then open the PR once; a base branch the clone doesn't have makes `git diff` fail and the loader falls back to pr_files, which is correct (evidence: server/src/modules/pulls/routes.ts#onConflictDoUpdate, server/src/modules/reviews/diff-loader.ts#loadDiff)
- 2026-11-25 — supersedes the 2026-11-25 entry on `pull_requests.base` not syncing: fixed — both PR-list sync and `POST /repos/:id/poll` now go through `upsertPullRequests`, whose conflict `set` refreshes base, branch, head sha, additions/deletions, files count, title, status; no manual DB update needed after a retarget (evidence: server/src/modules/_shared/pull-sync.ts, test/integration.it.test.ts "PR re-sync refreshes a retargeted base")
- 2026-11-28 — IT tests read `GET /runs/:id/trace` right after `waitForPrRuns` and flaked under the parallel `.it.test` run (`prompt_assembly` undefined): `runOneAgent` sets the run `done` (`completeAgentRun`) BEFORE `saveRunTrace` → `waitForPrRuns` now also waits for each terminal run's `run_traces` row; keep that, or save the trace first if you touch the executor (evidence: server/test/helpers/runs.ts#tracesSaved, server/src/modules/reviews/run-executor.ts#runOneAgent)

## Session Notes
<!-- ### YYYY-MM-DD + 1–3 bullets: what was done, what was decided -->

## Open Questions
<!-- still unclear; move out once answered -->
