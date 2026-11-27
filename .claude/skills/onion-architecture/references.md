# onion-architecture — research and sources

For humans maintaining the skill. Not loaded by the agent. Researched 2026-11-24.
All links opened on 2026-11-24 unless marked. Key points are paraphrased; dates are the source's
own publication/update date ("undated" if the page shows none). Raw list for a future README.

`Feeds rule` = section of [SKILL.md](SKILL.md) the source supports:

| Tag | SKILL.md section |
|---|---|
| Model | The model (rings table, ports/adapters, composition root) |
| Dir | CRITICAL — dependency direction |
| Tools | CRITICAL — containment of tools |
| Routes | HIGH — thin routes, parse at the edge |
| Ports | HIGH — ports and DI |
| Tx | MEDIUM — transactions, jobs, tests |
| Size | MEDIUM — right-size |
| Place | Placement — decide in order |
| Gate | Legacy violations + baseline, review checklist (`pnpm lint:arch`) |

Once SKILL.md settles, switch the columns to `Taken | Rejected` like
[engineering-insights/references.md](../engineering-insights/references.md).

## Onion and siblings

| Source | Key points | Feeds rule |
|---|---|---|
| [Jeffrey Palermo — The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) (2008-07-29) | All coupling points to the center. Domain model in the middle depends on nothing; repository interfaces in the ring around it; implementations at the edge with UI and tests. DB is external. Relies on dependency inversion, implementations injected at runtime. Says it is not for small websites | Model, Dir, Ports |
| [Jeffrey Palermo — part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) (2008-08-04) | Unlike classic layering (call only the layer below), any outer layer may call any inner one. Four tenets: independent object model; inner layers define interfaces, outer implement; coupling toward center; core compiles and runs without infrastructure. Tests sit at the edge | Model, Dir, Ports, Tx (tests) |
| [Alistair Cockburn — Hexagonal Architecture](https://alistaircockburn.com/Articles/Hexagonal-Architecture) (article 2005, page note 2022) | **Opened, but the URL is an article index, not the text.** Lists the original article as "still valid" and links to it at alistair.cockburn.us (not opened). Cite the original for ports/adapters wording | Model, Ports |
| [Robert C. Martin — The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) (2012-08-13) | Dependency Rule: source dependencies point only inward; inner circles never name outer ones. Rings: entities, use cases, interface adapters (controllers, presenters, SQL), frameworks/drivers. Cross boundaries via dependency inversion (output port). Only simple data structures cross, never DB rows. Business rules testable without UI/DB/web server. Four circles are schematic, may be more | Model, Dir, Tools, Tx (tests) |
| [Herberto Graça — Explicit Architecture #01](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) (2017-11-16, updated 2020-03-20) | Ports live in the application core and fit the core's needs, not a tool's API. Driving adapters (controllers) call the core; driven adapters (DB) implement ports and are injected. Repositories are ports used by the application layer. Components (by feature) are a separate axis from layers. Calls these guidelines; depth depends on project and team. Page truncated, tail read via summary | Model, Ports, Place |
| [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) (2017-09-21, updated 2017-11-18) | Onion = elaboration of ports & adapters. Inner layers define interfaces, outer implement; domain runs without infrastructure. Puts repository interfaces in the application layer, not domain (domain knows nothing of persistence). Outer layers may call any inner layer — avoids pass-through classes | Model, Dir, Ports |
| [Tomasz Tarczyński (Allegro Tech) — Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html) (2023-02-13) | Three layers: domain, application, infrastructure; every outer layer sees all inner ones. Use cases in application depend on interfaces, incl. a transaction abstraction. Enforce by convention + ArchUnit or by build modules (preferred). Fakes for infra interfaces in tests. Five layers (separate repo + service layers) called a step toward over-engineering | Model, Ports, Tx, Size, Gate |
| [Oliver Drotbohm — Sliced Onion Architecture](https://odrotbohm.github.io/2023/07/sliced-onion-architecture) (2023-07-25) | Cut the rings vertically: each business module is its own onion, application + infrastructure split into driving (API) and driven (DB, broker) sides. Modules talk via APIs or (preferably async) events. Tests attach to the application ring from the side. Result is a modulith | Dir (module isolation), Ports, Size |
| [Gary Bernhardt (Destroy All Software) — Functional Core, Imperative Shell](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell) (2012-07-12 per summary, unconfirmed) | Pure functional core makes decisions; thin imperative shell does I/O and acts on the core's output. Core testable without doubles; shell has few conditionals. **Read via fetch-tool summary only** (page mostly chrome) | Dir (reviewer-core), Place, Tx (tests) |
| [Mark Seemann — Functional architecture is Ports and Adapters](https://blog.ploeh.dk/2016/03/18/functional-architecture-is-ports-and-adapters/) (2016-03-18) | Pure functional core with impure I/O at the edges is ports & adapters by construction; impure parts composed in the composition root. Example: pass the reserved-seat count as a plain value instead of a function that fetches it. Haskell enforces via `IO`; elsewhere it is discipline | Model, Dir, Place, Ports |

## TypeScript / Node

| Source | Key points | Feeds rule |
|---|---|---|
| [Sairyss — domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) (undated) | Core (domain + application) vs interface adapters (controllers, DTOs) vs infrastructure (repositories, persistence models); dependencies inward. One application service per use case, orchestrates only, reaches infra through core-owned ports, services don't call each other. Separate domain and persistence models with mappers both ways. Validate at the edge, domain objects guard invariants. Tail read via summary | Model, Tools (mappers), Ports, Routes |
| [Khalil Stemmler — Application layer: use cases](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/application-layer-use-cases/) (updated 2019-06-25) | Use cases = application services: load entities via repositories, call domain logic. Split commands/queries (CQS). One `execute(request)` per use case with its own request DTO. Repositories injected as interfaces through the constructor; use case doesn't care who calls it. Folders by subdomain | Model, Ports, Place |
| [Khalil Stemmler — tag: mapper-pattern](https://khalilstemmler.com/articles/tags/mapper-pattern) (undated) | **Opened, but tag index only.** Points to "DTOs, Mappers & the Repository Pattern" (`/articles/typescript-domain-driven-design/repository-dto-mapper/`, not opened) — cite that article for mapper details | Tools (row → domain mappers) |
| [Khalil Stemmler — Intro to Domain-Driven Design](https://khalilstemmler.com/articles/domain-driven-design-intro/) (updated 2019-09-28) | Keep frameworks, DB and web out of the domain; connect adapters through dependency inversion. Repositories let you swap in-memory (tests) vs SQL (prod). Factories/mappers turn rows or JSON into domain objects. Domain services never use repositories; application services fetch and pass in | Dir, Tools, Ports, Tx (tests) |
| [Alexis King — Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) (2019-11-05) | A parser turns loose input into a stronger type and keeps the knowledge; a validator throws it away. Check once at the boundary instead of scattered "shotgun" checks. Prefer types that rule out illegal states; smart constructors when the type can't. Ideals, not a reason to rewrite a whole app | Routes (parse at the edge) |
| [jagreehal — TypeScript patterns: Validation](https://jagreehal.github.io/jagreehal-typescript-patterns/patterns/validation) (undated) | Three kinds: boundary parsing for shape (Zod in HTTP handlers, queue consumers, CLI), invariant construction (branded types), domain rules. Inner functions trust the parsed type. Don't repeat the same check in handler, service and repository. 400 shape / 422 rule / 500 unexpected. Business fns take args + deps | Routes, Ports (deps object) |

## Fastify

| Source | Key points | Feeds rule |
|---|---|---|
| [Fastify — Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) (docs, latest v5) | Everything is a plugin; `register` makes an encapsulated context. Decorators visible to children, not parents/siblings. `fastify-plugin` breaks encapsulation on purpose. Hooks scoped by registering inside a plugin. Pitched as start-monolith, split-later | Model (composition root), Ports (decorators = wiring) |
| [Fastify — Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) (docs, latest v5) | Contexts form a tree; ancestors never see descendants' decorators/hooks. Root-level plugins = cross-cutting. One context per concern maps onto a module boundary | Model, Dir (module isolation) |
| [Fastify — Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/) (docs, latest v5) | Types inferred from inline schemas. Zod via `@fastify/type-provider-zod` + validator/serializer compilers + `withTypeProvider`. Provider must be re-applied per encapsulated scope; typed `FastifyInstance` alias for route modules | Routes |
| [Fastify — Testing](https://fastify.dev/docs/latest/Guides/Testing/) (docs, latest v5) | Split app (`build(opts)`) from server (`listen`). `inject()` runs the full plugin graph without a socket. Plugins testable alone on a fresh instance | Tx (route tests via `buildApp(...).inject`) |
| [Matteo Collina (GitNation, Node Congress 2023) — Building a modular monolith with Fastify](https://gitnation.com/contents/building-a-modular-monolith-with-fastify) (2023-04-14) | MVC grows into a giant models set + routes file; structure by domain instead. Each domain plugin owns its code and data. Decorators/plugins as simple DI; autoload by folder. Modules never read each other's tables — talk via APIs. Separating business logic from transport takes real effort. Page truncated at ~40k chars | Dir (no cross-module internals), Ports, Size |
| [Liran Tal (Snyk) — Fastify plugins for backend Node.js APIs](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/) (2024-05-28) | Plugins as encapsulation + lightweight DI (decorate a DB handle once). Route-level JSON schemas for validation and serialization. `@fastify/env` for validated config. Tooling overview, no layering guidance | Routes, Ports |
| [marcoturi — fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate) (undated, active 2026) | Fastify 5 + clean architecture, DDD, CQRS, vertical slices, Awilix DI. Route → handler → (service) → domain + repository; routes validate, dispatch one command/query, shape the reply. No direct cross-module imports. dependency-cruiser in pre-commit + CI. Use as many layers as needed; simple CRUD may skip service/domain | Routes, Dir, Size, Gate |

## Drizzle / persistence

| Source | Key points | Feeds rule |
|---|---|---|
| [Drizzle — Transactions](https://orm.drizzle.team/docs/transactions) (docs, latest) | `db.transaction(async tx => …)` commits when the callback resolves; `tx.transaction` = savepoint; `tx.rollback()` throws to undo. Callback return value is the result. Postgres isolation/access mode as 2nd arg. Passing `tx` into helpers is implied, not documented | Tx |
| [Lazar Nikolov (Sentry) — Atomic repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript) (2024-10-03) | Each repo owning its own transaction lets multi-repo flows half-commit. Fix: repo methods take optional `tx`; a transaction-manager service opens it and passes it down; use case decides rollback. Map Drizzle's rollback error to a domain error. App layer sees a minimal `ITransaction`, infra exports Drizzle's type. Admits added complexity | Tx, Tools |
| [folionaut — ADR-004 Repository pattern](https://spencerjireh.github.io/folionaut/decisions/004-repository-pattern) (undated) | Generic `Repository<T, Create, Update>` over Drizzle for testability with mocks, swappable DB, typed boundary, soft-delete inside repo. Rejects direct Drizzle calls (scattered, hard to test). Lists cons: more code, indirection, over-abstraction risk. Row vs domain return type not addressed | Tools, Ports, Size |
| [Chimezie Enyinnaya (LogRocket) — Exploring the repository pattern with TypeScript and Node](https://blog.logrocket.com/exploring-repository-pattern-typescript-node) (2022-10-20) | Repository = storage abstraction separating data access from business logic (dependency inversion). Interface + Knex implementation injected by token; swap ORM by new class + binding. Returns ORM model types (no row→domain mapping), no transactions — weaker than SKILL.md asks | Ports, Tools (counter-example) |

## Enforcement

| Source | Key points | Feeds rule |
|---|---|---|
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) (repo; docs mention 18.3, repo uses ^17.4) | Rules = `name`, `severity`, `from`/`to` with `path`/`pathNot` regexes; built-ins `no-circular`, `no-orphans`. `tsConfig` honors `paths` aliases. Known-violations baseline + `--ignore-known`; newer versions use `--baseline` (`depcruise-baseline` deprecated). `err` reporter exits non-zero for CI. Also read: `doc/cli.md`, `doc/options-reference.md` (part summary) | Gate, Dir, Tools |
| [Jonathan Chaffer (Atomic Object) — Enforce import rules with dependency-cruiser](https://spin.atomicobject.com/dependency-cruiser-imports/) (2024-10-24) | TS exports are visible project-wide, so layering is unenforced by default. Forbid-style vs allow-only rules. ESLint `no-restricted-imports` is lighter but forbid-only | Gate |
| [Remo H. Jansen — Enforce clean architecture with fresh-onion](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi) (2025-03-23) | `onion.config.json` maps layers to dirs with `allowedImports`; uses the TS compiler API; inner layers import nothing outer. **Alternative, not chosen**: no baselines or cycle rules; a commenter could not find the package version on npm (unverified) | Gate |
| [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) (repo, undated) | Files → element types; `boundaries/dependencies` allow/disallow policies; errors in IDE + CI. **Alternative, not chosen**: needs ESLint, which `server/` does not have | Gate |
| [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) (repo, 2.5.0 noted as 2026-09-12) | Architecture rules as tests with a fluent API; cycles, layers, naming, metrics. Vitest needs `globals: true`; rules matching zero files fail. **Alternative, not chosen**: rules live in the test suite, no known-violations baseline mentioned; page tail via summary | Gate, Tx (tests) |

## Skill authoring

| Source | Key points | Feeds rule |
|---|---|---|
| [Anthropic — Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) (undated) | `name` ≤64 lowercase/digits/hyphens; `description` ≤1024 chars, third person, what + when. Body under ~500 lines; reference files one level deep, TOC if >100 lines. Only what Claude doesn't already know. Checklists + validate-fix loops for critical steps. ≥3 evals, test across Haiku/Sonnet/Opus | Skill shape (frontmatter, examples.md split, review checklist) |

## Counterpoints

Sources (or parts of them) that argue against strict layering or warn of over-engineering.

| Source | Key points | Feeds rule |
|---|---|---|
| [Jeffrey Palermo — part 4: after four years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/) (2013-08-19) | Restates the four tenets; works with or without DDD/CQRS. Original sample carried too much unrelated material; new sample drops the IoC container on purpose — the pattern does not need one. Aim for the simplest form of the concepts | Size, Ports (plain deps object, no DI container) |
| [Oliver Drotbohm — Sliced Onion](https://odrotbohm.github.io/2023/07/sliced-onion-architecture) (2023-07-25) | Strict ring-by-ring rules are usually relaxed in practice (boilerplate). One infrastructure ring lumps API and persistence adapters with different needs. Model-to-model mapping is often over-engineering when the app owns its store. One onion per microservice is costly; modules in one deployable often enough | Size; tension with Tools (row mappers) |
| [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) (2017-09-21) | Don't force every concern into one fixed layer model; team decides. A full port over the ORM is "more correct" but adds complexity — the simpler option is acceptable | Size, Tools |
| [Allegro Tech — Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html) (2023-02-13) | Costs: complexity and learning curve, more so with build-module enforcement. Not one-size-fits-all; poor fit for technical services like a high-throughput proxy | Size |
| [Mark Seemann — Functional architecture is Ports and Adapters](https://blog.ploeh.dk/2016/03/18/functional-architecture-is-ports-and-adapters/) (2016-03-18, comments) | Fine to reject ports & adapters — not one-size-fits-all; ran a deliberately more coupled design successfully in production. Doing it in OO needs constant diligence; functional style gets it more naturally | Size, Place (pure functions over ports) |
| [Sairyss — domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) (undated) | Full architecture is ill-suited to simple CRUD; skip patterns that over-complicate; abusing ports breeds useless abstractions | Size ("no port with one implementation and no fake") |
| [Khalil Stemmler — Intro to DDD](https://khalilstemmler.com/articles/domain-driven-design-intro/) (2019-09-28) | Up-front modeling is slow; an anemic model or plain MVC is enough for many REST backends | Size (no `domain.ts` without rules) |
| [marcoturi — fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate) (undated) | Use only the layers you need; chatty modules probably belong together; CRUD can go handler → repository | Size |

## Tensions with SKILL.md (for the next revision)

- **Row → domain mappers.** SKILL.md (Tools) requires `rowToX` mappers; Drotbohm calls model mapping
  often over-engineering. Kept because Zod contracts are the domain types and row types leaking into
  services is a listed legacy violation — the mapper is usually a thin field pick.
- **Who opens the transaction.** Sentry opens it in the controller via a transaction manager;
  SKILL.md (Tx) puts the boundary in the use case behind a `UnitOfWork` port. Allegro agrees with SKILL.md.
- **Repository interfaces: domain or application ring?** Palermo puts them right around the domain;
  Graça (and SKILL.md: `modules/<m>/ports.ts` = Application) puts them in the application layer.
- **Strict vs relaxed rings.** Palermo, Graça, Allegro: any outer ring may call any inner ring. SKILL.md
  follows that (Presentation may import Domain), not classic strict layering.
- **DI container.** Palermo part 4 and SKILL.md both skip one (deps object wired in `container.ts`);
  marcoturi uses Awilix.
- **Enforcement tool.** dependency-cruiser chosen (no ESLint, supports baseline, already used by
  marcoturi). eslint-plugin-boundaries, ArchUnitTS, fresh-onion kept as alternatives above.

## Not opened / follow-ups

- Cockburn's original article (alistair.cockburn.us/hexagonal-architecture/) — the cited URL is an index.
- Stemmler "Implementing DTOs, Mappers & the Repository Pattern" — the cited URL is a tag index.
