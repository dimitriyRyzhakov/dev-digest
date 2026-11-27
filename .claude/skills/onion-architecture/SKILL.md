---
name: onion-architecture
description: Onion architecture for the DevDigest backend (server/ and reviewer-core/) — rings, the inward-only dependency rule, ports and adapters, and where Fastify routes, Zod parsing, Drizzle queries, transactions, external SDK calls and DI wiring belong. Use when adding or changing a server module, endpoint, service, repository, adapter, port or job; moving backend files; reviewing server imports; deciding where backend code goes; or when asked "where should this live" for server code, "onion", "layers", "clean architecture", "ports and adapters", "архітектура бекенду", "де це покласти на сервері". Not for Fastify/Drizzle/Zod API details — those are in fastify-best-practices, drizzle-orm-patterns and zod.
---

# Onion architecture (server + reviewer-core)

Goal: business rules never depend on Fastify, Drizzle, Postgres or an SDK, so each can change or
be faked in a test without touching the core. Code samples: [examples.md](examples.md). Sources
and rationale: [references.md](references.md) (humans only).

Not here: route/plugin API details → [fastify-best-practices](../fastify-best-practices/SKILL.md).
Query, schema and migration syntax → [drizzle-orm-patterns](../drizzle-orm-patterns/SKILL.md).
Schema-writing details → [zod](../zod/SKILL.md).

## The model

Rings, inner → outer. **Source imports point inward only.** An inner ring declares the interface
(a **port**) it needs; an outer ring implements it (an **adapter**); the composition root wires them.

| Ring | Holds | May import |
|---|---|---|
| **Domain** | contracts/types, invariants, pure rules and calculations | zod, other Domain files |
| **Application** | use cases: orchestrate Domain + ports, decide transaction boundaries, throw `AppError`s | Domain, ports |
| **Infrastructure** | ports implemented with Drizzle, postgres.js, SDKs, git, fs, jobs, SSE | Domain, ports, any library |
| **Presentation** | HTTP: parse request, call one use case, map to DTO | Application, Domain |
| **Composition root** | creates concrete classes and wires ports to adapters | everything |

## In this repo

Read `server/AGENTS.md` + `server/INSIGHTS.md` (or `reviewer-core/…`) first; they win on conflict.

| Ring | Home |
|---|---|
| Domain | `server/src/vendor/shared/contracts/*` (Zod contracts are the domain types), `modules/<m>/domain.ts` (pure rules; create when a module has some), `modules/<m>/constants.ts`, `platform/errors.ts`, **`reviewer-core/src/` except `llm/`** |
| reviewer-core adapter | `reviewer-core/src/llm/` (`OpenRouterProvider`, structured output over the `openai` SDK) — Infrastructure that ships with the core; implements `LLMProvider` |
| Application | `modules/<m>/service.ts` and orchestrators (`run-executor.ts`, `*-loader.ts`), `modules/<m>/ports.ts` (repository + narrow dependency interfaces), `vendor/shared/adapters.ts` (external ports: `LLMProvider`, `GitClient`, `GitHubClient`, `CodeIndex`, `Embedder`, `SecretsProvider`, `AuthProvider`) |
| Infrastructure | `modules/<m>/repository.ts`, `modules/<m>/repository/*.repo.ts`, `src/adapters/**`, `src/db/**`, `platform/{jobs,sse,run-logger,resilience,contained-read}.ts` |
| Presentation | `modules/<m>/routes.ts`, DTO mappers in `modules/<m>/helpers.ts` (`toRepoDto`, `reviewToDto`) |
| Composition root | `platform/container.ts`, `app.ts`, `server.ts`, `modules/index.ts` |

Reference module: `modules/agents/` (routes → `AgentsService` → `AgentsRepository`, no Drizzle in routes).

## Rules

### CRITICAL — dependency direction
- NEVER import outward. Domain imports nothing from server; Application never imports
  Infrastructure or Presentation; Infrastructure never imports `routes.ts` or `service.ts`.
- `src/adapters/**` NEVER imports `src/modules/**`. A constant both need moves inward
  (`vendor/shared` or the module's `constants.ts` re-exported through a port), not outward.
- `reviewer-core/src` imports only `zod` and `@devdigest/shared`; the `openai` SDK only in
  `reviewer-core/src/llm/`. No DB, fs, GitHub, server imports; the review pipeline's only side effect
  is the injected `LLMProvider`. Server adapts to it, never the reverse.
- A module NEVER imports another module's repository or internals. Reuse via its service, a shared
  repository exposed by the container (`container.agentsRepo`), or `modules/_shared/`.
- Needing an outward import means a port is missing: declare the interface inward, implement outward.

### CRITICAL — containment of tools
- **Drizzle / postgres.js**: `drizzle-orm`, `db/schema`, `db/rows`, `$inferSelect` appear ONLY in
  repositories and `src/db/`. `postgres` only in `db/client.ts`. A repository returns contract/domain
  types through a mapper (`rowToX`); row types never cross into services or routes.
- **SDKs** (octokit, openai, @anthropic-ai/sdk, simple-git, @ast-grep/napi, ripgrep, js-tiktoken,
  dependency-cruiser) ONLY inside `src/adapters/<x>/`, behind a port. Wrap their errors in
  `ExternalServiceError` before they leave the adapter.
- **Fastify** types (`FastifyInstance`, `FastifyRequest`, `reply`) ONLY in routes, `app.ts`, plugins.
  Services never see a request or reply — pass parsed values.

### HIGH — thin routes, parse at the edge
- A route: `schema: { params, querystring, body }` with Zod (type provider), `getContext`, ONE service
  call, DTO mapping. No `container.db`, no loops of writes, no business `if`s.
- Parse, don't validate: Zod parses every inbound edge — HTTP in routes; GitHub/LLM responses and
  jsonb reads in adapters/repositories. Inner rings trust the typed value; no re-parsing in services.
- Contracts change in `server/src/vendor/shared` AND `client/src/vendor/shared`. New jsonb-backed
  fields are `.nullish()`.
- Errors: throw `AppError` subclasses (`NotFoundError`, `ValidationError`, …) from any ring;
  `app.setErrorHandler` builds the envelope. Never build error replies in routes.

### HIGH — ports and DI
- Ports live in the ring that uses them: module-local → `modules/<m>/ports.ts`; external systems
  shared across modules → `vendor/shared/adapters.ts`. Name by capability (`DiffSource`, `PullStore`),
  not technology (`DrizzlePullRepo` is the adapter's name).
- New services take an explicit deps object of ports (`{ repo: PullStore; git: GitClient }`), built
  in `container.ts`. NEVER pass the whole `Container` into new code (service locator). Existing
  services: narrow the deps when you touch them.
- Only the composition root calls `new` on adapters/repositories. A service creating
  `new XRepository(container.db)` is a legacy pattern — don't copy it.
- A function under `src/adapters/` that does no I/O (e.g. `parseUnifiedDiff`: string → `UnifiedDiff`)
  is Domain code in the wrong folder: move it inward, don't wrap it in a port. Functions that do I/O
  or load native libs (ast-grep, ripgrep, `extract`) get a port once a service needs them.

### MEDIUM — transactions, jobs, tests
- The use case decides the transaction boundary; Drizzle implements it. Expose a
  `UnitOfWork.run(fn)` port (or repo methods accepting a `tx`), implement it with
  `db.transaction(tx => …)` in Infrastructure. Keep only DB work inside a transaction — no LLM,
  GitHub or git calls (pool starvation).
- Job handlers are presentation-like entry points: parse payload, call a use case. Never rethrow
  from a fire-and-forget path (see `server/INSIGHTS.md`).
- Test by ring: Domain + Application → hermetic unit tests with in-memory port fakes
  (`src/adapters/mocks.ts` style); repositories → `*.it.test.ts` (testcontainers); routes →
  `buildApp(...).inject`. If a service test needs Postgres, a port is missing.

### MEDIUM — right-size
- A module with no business rules needs no `domain.ts`; no port with one implementation and no test
  fake. Add the ring when the second consumer or the first fake appears.
- Don't create `domain/ application/ infrastructure/` folders inside modules — rings are mapped by
  file role (decided 2026-11-24).

## Placement — decide in order

1. **Pure rule / calculation / invariant?** → `domain.ts` or `vendor/shared/contracts`, or reviewer-core if it is review logic.
2. **Orchestrates steps, decides what happens?** → `service.ts` (use case).
3. **Talks SQL?** → `repository.ts` behind a port in `ports.ts`.
4. **Talks to GitHub, LLM, git, fs, a CLI?** → `src/adapters/<x>/` behind a port.
5. **HTTP shape, status, DTO?** → `routes.ts` / `helpers.ts` mapper.
6. **Wiring, `new`, choosing an implementation?** → `platform/container.ts`.

## Legacy violations (do not copy; fix the one you touch)

- Routes querying Drizzle: `modules/pulls/routes.ts`, `polling/routes.ts`, `settings/routes.ts`, `workspace/routes.ts`.
- Row types in services: `reviews/service.ts`, `reviews/run-executor.ts`, `reviews/diff-loader.ts` (`AgentRow`, `schema.repos.$inferSelect`); `repos/helpers.ts` imports `db/schema`.
- Concrete adapters in services: `repo-intel/service.ts`, `repo-intel/pipeline/*` → `adapters/astgrep`, `adapters/codeindex/extract`.
- Pure code filed as an adapter: `adapters/git/diff-parser.ts` (imported by `reviews/diff-loader.ts`).
- Adapters importing a module: `adapters/astgrep/index.ts`, `adapters/depgraph/index.ts` → `modules/repo-intel/constants`.
- Whole-`Container` services that `new` their own repository (`repos/service.ts`).

Fixing one → regenerate the dependency-cruiser baseline (`pnpm lint:arch:baseline` in `server/`).

## Review checklist

- [ ] Each new file's ring is obvious from its name/path (table above).
- [ ] No `drizzle-orm`, `db/*`, `$inferSelect` outside repositories / `src/db`.
- [ ] No SDK import outside `src/adapters/`; no `src/modules` import inside `src/adapters/`.
- [ ] Routes: Zod schema, one service call, DTO out; no `container.db`.
- [ ] New service takes a deps object of ports, wired in `container.ts`.
- [ ] Multi-write use case has an explicit transaction boundary with no network calls inside.
- [ ] reviewer-core diff adds no I/O and no server import.
- [ ] `pnpm lint:arch` and `pnpm typecheck` pass in `server/` (reviewer-core changes: also `npm run typecheck` there).
