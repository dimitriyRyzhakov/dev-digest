# M3 — Intent layer (server)

UI half: [client/specs/M3-intent-layer.md](../../client/specs/M3-intent-layer.md).
Engine half: [reviewer-core/specs/M3-intent-in-prompt.md](../../reviewer-core/specs/M3-intent-in-prompt.md).

## Goal
Reviewers today see the task line, the raw PR body and the diff. They don't know **why** the PR
exists. M3 adds a shared pre-step to every review run: classify the PR's intent (what it does and
why, what is in and out of scope, breaking or not) with a cheap feature model, cache it, and pass
it into each agent's review prompt as an untrusted, clearly labelled block.

The server guarantees three things, in code, not in the prompt:
- the model never picks a file to read; only links parsed by code are fetched;
- confidence is calibrated by the evidence actually found (documented vs indirect signals);
- an intent failure never fails a review.

Intent **never reduces, waives or descopes a finding**. Critical findings outside the stated scope
are still reported at full severity. Changes unrelated to the intent may be flagged as scope
creep, without changing the severity of other findings.

## Scope
**In**
- New module `src/modules/intent/` (routes → service → repository, ports, domain).
- Pre-step in `ReviewRunExecutor.executeRuns`, after `Loading PR diff`, once per run request.
- Cache in `pr_intent`, keyed by an input hash (inputs + provider + model + prompt version).
- `GitClient.showFile(repo, sha, path)` — contained read of a blob at a commit.
- `GET /pulls/:id/intent`.
- Trace fields: `prompt_assembly.intent`, `intent`, `specs_read`.
- `review_intent` feature-model default → `openrouter` / `deepseek/deepseek-v4-flash`.
- One generated, add-only migration on `pr_intent`.

**Out**
- POST recompute route; non-GitHub hosts; cross-repo issues.
- Changing `resolveLinkedIssue`; persisting `linked_issue`.
- Smart Diff, PR Brief (M5 reuses this module through its service).
- A `warn` RunEventKind. CI runner path.

## Data sources (collected by code, no model)
| Source | Where from | Cap | Documented? |
|---|---|---|---|
| title | `pull_requests.title` | 300 chars | no |
| description | `pull_requests.body`, HTML comments stripped | 4000 chars | yes, if ≥ 120 chars after stripping |
| tickets (≤ 3) | refs parsed from body → `GitHubClient.getIssue`, this repo only. No token / not found → unresolved `no_github_token` / `not_found` | title 200 + body 4000 each | yes, if fetched title or body is non-empty |
| spec/plan files (≤ 3) | links from PR body and fetched ticket bodies, same repo only. Read order: `git.showFile(repo, headSha, path)` (`via:'head'`) → `readContainedFile(clonePath, path)` (`via:'worktree'`) → an added file in the diff, its `+` lines (`via:'diff'`). Else unresolved `not_found` | 64 KB read; 8000 chars per spec, 16000 total | yes |
| branch | `pull_requests.branch` | 200 | no (indirect) |
| commits | `pr_commits.message` first line, newest 20 | 200 each | no (indirect) |
| changed paths | `diff.files[].path` | 50 | no (indirect) |

### Link parsing (pure, `domain.ts`)
- **Tickets**: keyword refs first (`close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved`
  + `#N`, `owner/repo#N` or `https://github.com/owner/repo/issues/N`), then plain mentions in
  the same forms. Dedupe, skip the PR's own number, keep ≤ 3. Another `owner/repo` → unresolved
  `other_repo`.
- **Specs**: markdown link targets and bare tokens ending in `.md .mdx .txt .rst .adoc`.
  Relative paths resolve from the repo root. `https://github.com/<owner>/<repo>/blob/<ref>/<path>`
  of THIS repo (case-insensitive) is accepted, but read at headSha. `#anchor` / `?query` stripped.
  Rejected with a reason: `..`, absolute paths, `\0`, leading `-`, any `.git` segment
  (`unsafe_path`); other extensions (`ext_not_allowed`); other repos (`other_repo`).
- **Other URLs**: never fetched; recorded as `{ kind:'link', ref ≤300, host, reason:'external_host' }`, ≤ 10.

### Confidence rule (`calibrateIntentConfidence`)
- Documented = description ≥ 120 chars, OR ≥ 1 ticket resolved, OR ≥ 1 spec read.
- **high** (cap 0.9): description ≥ 120 AND (ticket OR spec).
- **medium** (cap 0.7): any one documented source.
- **low** (cap 0.4): indirect signals only.
- An unresolved ticket/spec ref (not an external link) moves the level down one step.
- Any external link lowers the numeric cap by 0.1. Model category `unknown` → low.
- `confidence = min(model_confidence, cap)`; `confidence_level` = the evidence level.

### Parsing hardening (post security review)
- Ref/link regexes run on bounded text only: PR body slice `bodyParseChars` (12 000) and joined
  body + ticket bodies ≤ `parseChars` (24 000); the `owner/repo#N` alternative has a left
  lookbehind and bounded quantifiers, markdown link targets ≤ 300 chars (a 65k body otherwise
  blocked the event loop for ~30 s).
- `wrapUntrusted` (intent domain + reviewer-core) escapes any `<untrusted` / `</untrusted`
  variant case- and whitespace-insensitively.
- Ticket titles have whitespace collapsed before they enter a Live Log line.
- `showFile` reads `git ls-tree -z` output (unquoted), so non-ASCII spec paths work.

### Risk areas (Amendment A1)
- **Code-derived** (`deriveRiskAreas(diff)`, deterministic, paths + `package.json` lines only):
  - `dependency`: `+` lines adding a key inside `dependencies` / `devDependencies` /
    `peerDependencies` / `optionalDependencies` of any `package.json` → `New dependency: <name>`
    (≤ 3; a version bump is not new; lockfile-only changes → nothing; keys that are not valid
    npm package names are dropped, so author text never reaches the trusted risk line);
  - `auth`: a changed path matching `(auth|login|session|oauth|jwt|token|permission|rbac|acl)` → `Auth surface touched`;
  - `migration`: a path under `migrations/` or `*.sql` → `Database migration`;
  - `config`: `.github/workflows/**`, `Dockerfile*`, `docker-compose*`, `*.env*` (path only,
    never content) → `CI / infra config changed`.
- **Model-derived**: classifier `risk_areas` ≤ 3 × `{ kind, label ≤ 80 }`.
- **Merge** (`mergeRiskAreas`): code first, then model; dedupe by kind (+ label for dependency);
  cap 6. The code list is part of the hashed canonical input.
- Stored in `pr_intent.risk_areas`; rendered inside the `pr-intent` wrap as `Risk areas:` bullets.
- Log: `Intent: risk areas — Auth surface touched · New dependency: ioredis · (model) Adds Redis round-trip per request`.

## Call sequence (once per PR per run request)
1. `ReviewService.runReview` → `executor.executeRuns`; `runLog` fans out over all runIds.
2. `Loading PR diff`. On failure every run fails as before; intent is not attempted.
3. `resolveIntent` (try/catch, never rethrows) → `IntentService.resolveForReview({ workspaceId, pull, repo, diff, log })`:
   1. `store.getCommits(prId)`; 2. `parseTicketRefs(body)`;
   3. tickets via `deps.github()` → `getIssue` × ≤ 3, in parallel, each in its own try/catch;
   4. `parseSpecLinks(body + ticket bodies)`, read specs;
   5. `canonicalIntentInput(inputs, provider, model, INTENT_PROMPT_VERSION)` → sha256 → `inputHash`;
   6. `store.get(prId)`: same `input_hash` → cache hit, no LLM call;
   7. else `llm.completeStructured({ schemaName:'PrIntentClassification', temperature:0, maxRetries:1, sessionId:'<owner>/<repo>#<n>:intent' })` with a 20 s timeout;
   8. `groundSignals` → `calibrateIntentConfidence` → `store.upsert`;
   9. return `PrIntentRecord & { cached }`.
   Any throw → `Intent failed — continuing review without intent: <msg>`, intent = null.
4. Each agent: `reviewPullRequest({ …, intent: toPromptIntent(intent) })`. Map-reduce chunks all
   get the same block.
5. Trace: `prompt_assembly.intent`, `intent: toIntentTraceSnapshot(intent)` (or null),
   `specs_read` = spec paths read.

Intent cost is stored on `pr_intent.cost_usd`; it is **not** added to the agent run's `cost_usd`.

## API / data changes

### Migration (generated, `0017_*`, add-only)
On `pr_intent` (PK stays `pr_id`):
- `category text NOT NULL DEFAULT 'unknown'`, `breaking boolean NOT NULL DEFAULT false`
- `confidence double precision NOT NULL DEFAULT 0`
- `confidence_level text NOT NULL DEFAULT 'low'` + `CHECK (confidence_level in ('high','medium','low'))`
- `documented boolean NOT NULL DEFAULT false`
- `signals`, `sources`, `unresolved_refs`, `risk_areas` `jsonb NOT NULL DEFAULT '[]'`
- `input_hash`, `head_sha`, `provider`, `model` `text`; `cost_usd double precision`
- `created_at`, `updated_at` `timestamptz NOT NULL DEFAULT now()`

### Contracts (mirrored to client)
- `brief.ts`: `IntentCategory`, `IntentConfidenceLevel`, `IntentSourceKind`, `IntentSource`,
  `IntentUnresolvedRef`, `IntentSignal`, `IntentRiskKind`, `IntentRiskArea { kind, label ≤ 80,
  origin: code | model }`. `Intent` unchanged. `PrIntentRecord.risk_areas` (≤ 6),
  `IntentTraceSnapshot.risk_areas` (nullish).
- `review-api.ts`: `PrIntentRecord = Intent.extend({ pr_id, category, breaking, confidence,
  confidence_level, documented, signals, sources, unresolved_refs, provider?, model?, cost_usd?,
  input_hash?, head_sha?, updated_at })`; `PrIntentResponse = { intent: PrIntentRecord | null }`.
- `trace.ts`: `PromptAssembly.intent?`, `IntentTraceSnapshot`, `RunTrace.intent?` (all nullish).
- `platform.ts`: `review_intent` default `openrouter` / `deepseek/deepseek-v4-flash`.
- `adapters.ts`: `GitClient.showFile(repo, sha, path, { maxBytes? }) → string | null`.

### Routes
| Method | Path | Notes |
|---|---|---|
| GET | `/pulls/:id/intent` | `PrIntentResponse`; `{ intent: null }` before any run; 404 outside the workspace |

### Classifier (`domain.ts`)
`PrIntentClassification`: `category` (enum), `summary` 1..400, `in_scope` / `out_of_scope`
(≤ 8 × ≤ 200), `breaking`, `confidence` 0..1, `signals` (≤ 10 × `{ source, ref? ≤300, note ≤200 }`,
default `[]`). System message is trusted (Conventional Commits categories + `security`, `deps`,
`revert`, `unknown`; scope only as stated; signals cite listed sources only; indirect-only → keep
confidence low; ends with an injection guard). The user message opens with `Provided sources: …`,
then one `<untrusted source="…">` block per source (`pr-title`, `pr-description`, `ticket-N`,
`spec:<path>`, `branch`, `commits`, `changed-paths`); labels are validated, `</untrusted>` escaped.

### `showFile` safety
sha `/^[0-9a-f]{7,40}$/i`; path posix-normalized; refuse absolute, `..`, `\0`, leading `-`, any
`.git` segment; `git ls-tree <sha> -- <path>` mode 100644/100755 only (no symlinks / submodules);
`git cat-file -s` ≤ maxBytes (64 KB default); content via `git cat-file blob <sha>:<path>`.
Every failure → `null`, never throws.

## Live Log lines (fanned out to every run)
| Step | kind | Message |
|---|---|---|
| sources | info | `Intent: sources — title · description 1240 chars · 2 ticket ref(s) · 1 spec link(s) · 3 external link(s)` |
| no docs | info | `Intent: no description/ticket/spec — deriving from branch, commits, paths; confidence capped at low` |
| ticket | tool/info | `Intent: ticket #471 fetched ("<title ≤80>")` · `Intent: ticket #12 skipped — not_found` / `no_github_token` |
| spec | tool/info | `Intent: spec specs/x.md read @a1b2c3d (4.1 KB)` · `… read from working tree (head not in clone)` · `… read from PR diff (new file)` · `… truncated to 8000 chars` · `Intent: spec docs/x.pdf skipped — ext_not_allowed` |
| unresolved | info | `Intent: warning — unresolved ref <url> (external_host, not fetched; lowers confidence)` |
| cache hit | result | `Intent cached (hash 3f9a1c2e, openrouter/deepseek/deepseek-v4-flash) — no model call` |
| model call | tool | `Classifying intent with <provider>/<model>…` → `… done (812ms)` |
| grounding | info | `Intent: dropped 1 signal citing a source that was not provided` |
| result | result | `Intent: feat · confidence medium 0.62 (model 0.90) · breaking=no · $0.0004 · 812→96 tokens` |
| failure | error | `Intent failed — continuing review without intent: <message>` |

## Risks
- Prompt injection over two hops (body/ticket/spec → classifier → review): wrapping, the trusted
  "never descopes" line, caps, injection guard.
- Path traversal / secret files via spec links: allowlist, normalization, `showFile` mode + size
  checks, `readContainedFile`.
- git argument injection: array args, `--` separators, sha regex, leading `-` refused.
- Cache staleness: without a GitHub token the hash differs from the online case (tickets missing).
- Review latency: serial pre-step; 20 s timeout and parallel ticket fetches.

## Acceptance criteria
- A run request makes **one** intent resolution, whatever the number of agents.
- Its log lines appear in every run's Live Log and in each persisted `trace.log`.
- A second run with unchanged inputs makes **zero** intent `completeStructured` calls.
- The review user message contains `<untrusted source="pr-intent">`; the trace has
  `prompt_assembly.intent`, `intent` and `specs_read`.
- An invalid classifier output (or any intent error) → the run is still `done`, and the log has
  `Intent failed`.
- No body, no tickets, no specs → `confidence_level: 'low'`, confidence ≤ 0.4.
- External links and other repos are never fetched; a model-cited path is never read.
- Missing GitHub token → tickets unresolved (`no_github_token`), the run continues.
- `GET /pulls/:id/intent` → `{ intent: null }` before a run, the record after, 404 for an
  unknown/foreign PR.
- `pnpm typecheck`, `pnpm lint:arch`, unit tests and `pnpm exec vitest run .it.test` are green.
