# M2 — Conventions extractor (server)

UI half: [client/specs/M2-conventions.md](../../client/specs/M2-conventions.md).
Builds on: [M2-skills.md](./M2-skills.md) (skills, agent links, `skill_blocks` in the trace).

## Goal
Some house rules (code style, error handling, structure) are written down nowhere. They exist
only in the code. The **conventions extractor** reads a cloned repo and drafts **candidate
conventions**. Each candidate is a rule plus evidence from real code: a file, a line range and
a snippet. A person accepts, rejects or edits each candidate. The accepted ones are then merged
into **one skill** (`type: convention`, `source: extracted`). That skill is linked to agents like
any other skill and reaches the reviewer's system prompt.

Weak candidates are expected. Curation is the user's job. The server guarantees one thing:
**every stored candidate is grounded**. Its file exists and contains its snippet. Code checks
this, not the model.

## Scope
**In**
- New module `src/modules/conventions/` (routes → service → repository, ports, domain).
- Extraction run:
  - code picks the input: repo config files + top-12 ranked files
  - **one** structured LLM call per run, using the Settings feature model `conventions`
  - code verifies the evidence, then stores the candidates
- Candidate list, edit of the rule text, accept / reject.
- Merge the accepted candidates into one `extracted` skill. Re-saving updates the same skill as a
  new version.
- One generated migration on `conventions`.

**Out**
- Two-step dialogue (`ConventionFileSelection` → `ConventionExtraction`). The mock supports it,
  but this milestone uses a single call.
- Background jobs or progress streaming. Extraction runs inside the request.
- Memory items, per-candidate skills, community sharing.
- Any outbound call besides the configured LLM (local-first).

## API / data changes

### Migration (generated, next number)
On `conventions`:
- `status text NOT NULL DEFAULT 'pending'`: `pending | accepted | rejected`. The migration
  backfills it from `accepted` (`true → 'accepted'`) and then drops `accepted`.
- `evidence_start_line integer`, `evidence_end_line integer` (1-based, inclusive).
- `created_at timestamptz NOT NULL DEFAULT now()`.
- Index `conventions_repo_idx` on `(repo_id)`.
- `CHECK (status IN ('pending','accepted','rejected'))` (migration 0015).

Existing migration files are not touched (`pnpm db:generate`, plus a hand-written backfill in the
new file only).

### Contracts (`src/vendor/shared/contracts/knowledge.ts`, mirrored to client)
- `ConventionStatus = 'pending' | 'accepted' | 'rejected'`.
- `ConventionCandidate`: `{ id, rule, evidence_path, evidence_snippet, confidence 0..1,
  accepted, status, evidence_start_line?, evidence_end_line?, created_at }`.
  - `accepted` stays, derived as `status === 'accepted'`.
  - The line fields are `.nullish()`.
- `ConventionList { candidates: ConventionCandidate[], last_scan_at: string | null }`.
- `ConventionPatch { rule?: string (trim, 1–500), status?: ConventionStatus }`. At least one is
  required.
- `ConventionExtractResult { candidates, dropped: number, cost_usd: number | null }`.
- `ConventionSkillInput { name 1–80, description 1–500, body 1–20000, enabled: boolean }`.
  `type` and `source` are fixed by the server, never sent by the client.
- LLM output schema `ConventionExtraction` (module `domain.ts`, not shared):
  `{ candidates: [{ rule, evidence_path, evidence_snippet, confidence, also_seen_in[] }] }`, max 20 items.

### Routes
| Method | Path | Notes |
|---|---|---|
| GET | `/repos/:id/conventions` | `ConventionList`, newest first. 404 if the repo is outside the workspace |
| POST | `/repos/:id/conventions/extract` | runs the extraction → `ConventionExtractResult`. Rate limit 3/min. 409 `repo_not_cloned` without `clone_path` |
| PATCH | `/conventions/:id` | `ConventionPatch` → `ConventionCandidate`. 404 outside the workspace |
| POST | `/repos/:id/conventions/skill` | `ConventionSkillInput` → `Skill`. 201 created / 200 updated. 422 with no accepted candidates. 409 on a name clash with a non-`extracted` skill |

### Extraction pipeline (`POST …/extract`)
1. **Input (code only, no model)**
   - Config files probed at the repo root with `readContainedFile`: `eslint.config.*`,
     `.eslintrc*`, `tsconfig.json`, `.prettierrc*`, `prettier.config.*`, `.editorconfig`,
     `biome.json`.
   - Sample files: `repoIntel.getConventionSamples(repoId, 60)` (ranked; skips tests, configs and
     migrations). `diversifySamples` then picks 12, at most 2 per directory, so one folder of
     look-alike files (e.g. `db/schema`) can't fill the sample.
   - Each file is capped at about 12 KB / 400 lines.
2. **Model**
   - `getFeatureModelOverride(ws, 'conventions')`, else the registry default.
   - `container.llm(provider).completeStructured({ schemaName: 'ConventionExtraction' })`,
     called **exactly once**.
   - File contents go in as delimiter-wrapped untrusted data, with an injection-guard line.
3. **Grounding (code)**, for each candidate:
   - `evidence_path` must be one of the files **sent to the model** (configs + samples, read once
     with `readContainedFile`, ≤ 512 KB). Any other path — even an existing clone file such as
     `.env` — is **dropped** and never read.
   - `locateSnippet` matches the snippet as a contiguous block of lines, ignoring leading and
     trailing whitespace on each line. No match → **dropped**.
   - a match sets `evidence_start_line` / `evidence_end_line`. The stored snippet is copied from
     the **file** (original indentation). A match shorter than 3 lines is widened with up to 2
     real lines on each side (`evidenceFromFile`), because models tend to cite a lone line.
   - `confidence` is capped by support (`calibrateConfidence`): the evidence file plus the
     model's `also_seen_in` paths that were actually sent. 1 file ≤ 0.5, 2 files ≤ 0.75.
4. **Store (one transaction)**
   - delete the repo's `pending` and `rejected` rows
   - insert grounded candidates whose rule is not already accepted, strongest first. The dedupe
     ignores case and whitespace. At most 2 candidates per evidence file (`capPerFile`).
   - **Accepted candidates survive a re-scan.**
5. Return the list, the `dropped` count and the run cost (`costUsd` from the provider).

### Accept as skill (`POST …/skill`)
- Requires at least one `accepted` candidate in the repo.
- If no skill has that name, create one through the skills store:
  - `type: 'convention'`, `source: 'extracted'`
  - `enabled` from the input
  - `evidence_files` = distinct evidence paths of the accepted candidates
  - version 1 + `skill_versions` row
- If a skill with that name has `source = 'extracted'`, update it: new body → `version + 1` +
  `skill_versions` row; description, `enabled` and `evidence_files` are refreshed.
- If a skill with that name has any other source → 409 (`ConflictError`). The user picks
  another name.
- `SkillInput` is **not** widened. The skills store gets an internal create/update path that
  accepts `source` and `evidenceFiles`.
- Default name (suggested by the client): `<repo.name>-conventions`.

### Trust model
Candidates are model output grounded in the user's own repo. The skill body is user-reviewed
text, edited in the modal before it is saved. Repo file content is untrusted input to the model
and is wrapped as data. Nothing is executed. The only outbound call is the LLM.

## Acceptance criteria
- `POST /repos/:id/conventions/extract` makes **exactly one** `completeStructured` call
  (`schemaName: 'ConventionExtraction'`).
- The input files come from `getConventionSamples()` plus root config files. No model call
  selects them.
- A candidate with a missing file, or a snippet not found in its file, is not stored and is
  counted in `dropped`.
- Stored candidates have `evidence_path`, `evidence_snippet` and a line range.
- `PATCH /conventions/:id` changes `rule` and/or `status`. Another workspace's id → 404.
- A re-scan keeps accepted candidates, removes pending and rejected ones, and adds no duplicate
  of an accepted rule.
- `POST …/skill` stores the skill with `type = 'convention'` and `source = 'extracted'`, with the
  edited name, description and body and the chosen `enabled`.
  - A second call with the same name → same id, `version + 1`.
  - A name taken by a manual skill → 409.
- A skill linked through `POST /agents/:id/skills` shows up in a review run's
  `prompt_assembly.skill_blocks`.
- Tests: domain unit tests plus `conventions.it.test.ts` with `MockLLMProvider`
  (`structuredBySchema`). `pnpm test`, `pnpm typecheck` and `pnpm lint:arch` are green.
