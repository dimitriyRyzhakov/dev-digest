# onion-architecture — examples

Bad → good pairs for the rules in [SKILL.md](SKILL.md). Paths are relative to `server/src/` unless
they start with a package name. Snippets are trimmed, not copy-paste ready. Lines marked
**Real code** point at existing files; every other name (`SettingsStore`, `UnitOfWork`,
`PullStore`, …) is illustrative and does not exist yet.

## 1. Route queries Drizzle → route → service → repository behind a port

❌ Presentation talks SQL. Untestable without Postgres; the next endpoint copies the query.

```ts
// modules/settings/routes.ts — Real code (trimmed)
import { and, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';

app.get('/settings', async (req) => {
  const { workspaceId } = await getContext(container, req);
  const rows = await container.db.select().from(t.settings).where(eq(t.settings.workspaceId, workspaceId));
  return rowsToSettings(rows);
});
```

✅ Route parses + delegates. The use case owns the decision; the repository owns the SQL.

```ts
// modules/settings/ports.ts — Application ring declares what it needs
import type { Settings } from '@devdigest/shared';
export interface SettingsStore {
  get(workspaceId: string): Promise<Settings>;
  upsert(workspaceId: string, userId: string, patch: Partial<Settings>): Promise<void>;
}

// modules/settings/service.ts — no drizzle, no fastify
export class SettingsService {
  constructor(private deps: { store: SettingsStore }) {}
  get(workspaceId: string) { return this.deps.store.get(workspaceId); }
}

// modules/settings/repository.ts — Infrastructure implements the port
export class DrizzleSettingsStore implements SettingsStore {
  constructor(private db: Db) {}
  async get(workspaceId: string) {
    const rows = await this.db.select().from(t.settings).where(eq(t.settings.workspaceId, workspaceId));
    return rowsToSettings(rows); // row → contract mapping stays here
  }
  // …
}

// modules/settings/routes.ts — Presentation
app.get('/settings', async (req) => {
  const { workspaceId } = await getContext(container, req);
  return container.settingsService.get(workspaceId);
});
```

**Real code (good shape):** `modules/agents/routes.ts` → `service.ts` → `repository.ts`.

## 2. Row type leaks into a service → contract type + mapper in the repository

❌ The use case signature depends on the table layout.

```ts
// modules/reviews/diff-loader.ts — Real code (trimmed)
import * as schema from '../../db/schema.js';
export async function loadDiff(container: Container, repo: ReviewRepository, workspaceId: string,
  pull: PullRow, repoRow: typeof schema.repos.$inferSelect) {
  return container.git.diff({ owner: repoRow.owner, name: repoRow.name }, pull.base, pull.headSha);
}
```

✅ Inner code takes the smallest domain value it needs (`RepoRef` already exists in `@devdigest/shared`).
Repositories map rows on the way out.

```ts
// modules/reviews/diff-loader.ts
import type { RepoRef, UnifiedDiff } from '@devdigest/shared';
export async function loadDiff(deps: { git: GitClient; files: PrFileSource }, repo: RepoRef,
  pull: { id: string; base: string; headSha: string }): Promise<UnifiedDiff> { /* … */ }

// modules/reviews/repository/pull.repo.ts
const toPull = (r: typeof t.pullRequests.$inferSelect): Pull => ({ id: r.id, base: r.base, headSha: r.headSha, /* … */ });
```

## 3. "Adapter" that does no I/O → move it inward; real I/O → port

❌ `parseUnifiedDiff` only turns a string into `UnifiedDiff`, but lives in `adapters/`, so every
caller looks like it depends on infrastructure.

```ts
// modules/reviews/diff-loader.ts — Real code
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
```

✅ Pure → Domain. Something that needs it imports inward, which is always allowed.

```ts
// modules/reviews/domain.ts (or vendor/shared if client needs it too)
export function parseUnifiedDiff(raw: string): UnifiedDiff { /* unchanged */ }
```

❌ ast-grep (native lib, reads files) called directly from the use case:

```ts
// modules/repo-intel/service.ts — Real code
import { extractEndpoints } from '../../adapters/codeindex/extract.js';
```

✅ The use case names the capability; the adapter provides it; the container wires it.

```ts
// modules/repo-intel/ports.ts
export interface EndpointExtractor { extract(file: { path: string; content: string }): EndpointHit[] }
// adapters/codeindex/extract.ts
export const astGrepEndpointExtractor: EndpointExtractor = { extract: (f) => extractEndpoints(f) };
// platform/container.ts
new RepoIntelService({ endpoints: astGrepEndpointExtractor, /* … */ });
```

## 4. Adapter imports a module → configuration flows in from the root

❌ Infrastructure depends on Application/Domain *of one module*; the adapter can't be reused or
tested without repo-intel.

```ts
// adapters/astgrep/index.ts — Real code
import { MAX_SIGNATURE_CHARS, SUPPORTED_EXT } from '../../modules/repo-intel/constants.js';
```

✅ The adapter takes its limits as options; the composition root passes the module's constants.

```ts
// adapters/astgrep/index.ts
export interface AstGrepOptions { supportedExt: readonly string[]; maxSignatureChars: number }
export function createSymbolExtractor(opts: AstGrepOptions): SymbolExtractor { /* … */ }

// platform/container.ts
createSymbolExtractor({ supportedExt: SUPPORTED_EXT, maxSignatureChars: MAX_SIGNATURE_CHARS });
```

## 5. Service locator → explicit deps of ports

❌ The service can reach anything in the app, and creates its own repository.

```ts
// modules/repos/service.ts — Real code (trimmed)
export class RepoService {
  private repo: RepoRepository;
  constructor(private container: Container) { this.repo = new RepoRepository(container.db); }
}
```

✅ Dependencies are visible in the type; tests pass fakes without building a `Container`.

```ts
export interface RepoServiceDeps { repos: RepoStore; git: GitClient; jobs: JobQueue; secrets: SecretsProvider }
export class RepoService { constructor(private deps: RepoServiceDeps) {} }

// platform/container.ts — the only place that news adapters
get repoService() {
  return (this._repoService ??= new RepoService({
    repos: new DrizzleRepoStore(this.db), git: this.git, jobs: this.jobs, secrets: this.secrets,
  }));
}
```

## 6. Multi-write use case → transaction boundary owned by the use case

❌ Two writes, no transaction; or a transaction opened in the route; or an LLM call inside it.

```ts
await reviewRepo.insertReview(review);
await reviewRepo.insertFindings(review.id, findings); // crash here = orphan review
```

✅ Port in Application, Drizzle `db.transaction` in Infrastructure, network calls outside.

```ts
// modules/reviews/ports.ts
export interface UnitOfWork { run<T>(fn: (s: { reviews: ReviewStore }) => Promise<T>): Promise<T> }

// modules/reviews/repository.ts
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private db: Db) {}
  run<T>(fn: (s: { reviews: ReviewStore }) => Promise<T>) {
    return this.db.transaction((tx) => fn({ reviews: new DrizzleReviewStore(tx) }));
  }
}

// modules/reviews/service.ts
const outcome = await this.deps.llm.completeStructured(/* … */); // outside the tx
await this.deps.uow.run(async ({ reviews }) => {
  await reviews.insertReview(review);
  await reviews.insertFindings(review.id, findings);
});
```

## 7. Validation in the wrong ring → parse at the edge, trust inside

❌ Service re-parses what the route already parsed; adapter returns raw `any` from GitHub.

```ts
async create(input: unknown) { const body = CreateAgent.parse(input); /* … */ }
async getPull(): Promise<any> { return (await octokit.rest.pulls.get(…)).data; }
```

✅ Route schema parses HTTP; adapter parses the external payload into a contract; service is typed.

```ts
app.post('/agents', { schema: { body: CreateAgentBody } }, async (req) => service.create(req.body));
async getPull(ref: PullRef): Promise<PullSummary> { return PullSummary.parse((await this.gh.rest.pulls.get(…)).data); }
async create(input: CreateAgentInput) { /* no parse */ }
```

## 8. Service test needs Postgres → in-memory fake of the port

✅ Application tests are hermetic; only repositories need `*.it.test.ts`.

```ts
// test/settings-service.test.ts
class MemSettingsStore implements SettingsStore {
  data = new Map<string, Settings>();
  async get(ws: string) { return this.data.get(ws) ?? {}; }
  async upsert(ws: string, _u: string, patch: Partial<Settings>) { this.data.set(ws, { ...(await this.get(ws)), ...patch }); }
}
const svc = new SettingsService({ store: new MemSettingsStore() });
```

**Real code:** `src/adapters/mocks.ts` (`MockLLMProvider`, `MockGitClient`) used via
`buildApp({ overrides })` in `test/reviews.it.test.ts`.

## 9. reviewer-core gains I/O → server does I/O, core gets values

❌

```ts
// reviewer-core/src/prompt.ts
import { readFileSync } from 'node:fs';
const guide = readFileSync(`${repoPath}/CONTRIBUTING.md`, 'utf8');
```

✅ The server's adapter reads the file; the engine receives a string (and still `wrapUntrusted`s it).

```ts
// server/src/modules/reviews/run-executor.ts
const guide = await this.deps.files.readContained(repo, 'CONTRIBUTING.md');
await reviewPullRequest({ diff, guide, llm: this.deps.llm, /* … */ });
```

## New module skeleton

```
modules/<name>/
  routes.ts      Presentation: Zod schemas, getContext, one service call per route
  service.ts     Application: use cases, constructor(deps: { …ports })
  ports.ts       Application: interfaces this module needs (stores, extractors, UnitOfWork)
  repository.ts  Infrastructure: Drizzle implementation of the store ports, row → contract mappers
  domain.ts      Domain (only if there are pure rules): invariants, calculations
  helpers.ts     Presentation mappers (toXDto) — no db/schema imports
  constants.ts   Domain literals
```

Then: wire the service in `platform/container.ts`, register `routes.ts` in `modules/index.ts`,
contract changes in both `vendor/shared` copies, run `pnpm lint:arch && pnpm typecheck`.
