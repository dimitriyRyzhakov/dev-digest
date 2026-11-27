# frontend-architecture — research and sources

For humans maintaining the skill. Not loaded by the agent. Researched 2026-11-24.
Status: SKILL.md + examples.md written 2026-11-24 from this research. `Feeds` = principle
(P1–P10) below; each P maps to a rules section of SKILL.md (see "Decisions taken into SKILL.md").

**Focus: architecture concept, not React coding rules.** The skill answers "which layer and which
module does this code belong to, and what may it depend on" for a React + Next.js (App Router)
frontend. Component-level rules (derived state, `useEffect`, memo, component size) stay in
[react-best-practices](../react-best-practices/SKILL.md) and [next-best-practices](../next-best-practices/SKILL.md);
this skill links to them instead of repeating them.

Skill shape: generic concept + "In this repo" map onto `client/` (decided with user 2026-11-24).

## Architecture concept (draft)

### Two axes: layer × slice

Every file has two coordinates:

- **Layer** — what kind of code it is (view, interaction, domain, data). Answers "what may it import".
- **Slice** — which feature/domain it serves (`reviews`, `agents`, `repos`…) and how wide its scope is.
  Answers "where does the folder go".

Top level is split by **slice** (domain names), each slice is **layered inside**. Layer-named top
folders (`components/ hooks/ utils/`) only work for small apps (Fowler layering, Uncle Bob screaming
architecture, Stemmler vertical slices, profy.dev, Wieruch).

### Layers (outer → inner)

| # | Layer | Holds | Must not hold | Typical home |
|---|---|---|---|---|
| L5 | **Routing shell** (composition root) | `page`/`layout`, reading params, picking slices, providers, error/loading boundaries | business rules, data mapping | `app/**/page.tsx`, `layout.tsx` |
| L4 | **Presentation** | components that render props and emit events; UI-only state (open/closed) | fetch, business decisions, DTO shapes | `_components/Name/Name.tsx`, `components/` |
| L3 | **Interaction / application** | hooks and use cases: orchestrate domain + data, form/selection state, command handlers | JSX, raw `fetch`, framework-free rules | `useThing.ts`, `lib/hooks/*` |
| L2 | **Data access** | API client, query keys/options, DTO ↔ model mapping, server-only DAL in Next | UI state, rendering | `lib/api.ts`, `queries.ts`, `server-only` modules |
| L1 | **Domain** | types + pure functions: rules, filters, scoring, formatting of domain values | React, `fetch`, `window`, i18n runtime | `helpers.ts`, `lib/<topic>.ts`, `model/` |
| L0 | **Shared kernel** | contracts/types shared with backend, UI kit primitives, tiny generic libs | anything feature-specific | `vendor/shared`, `vendor/ui`, `lib/` generic |

**Dependency rule:** a layer imports only layers with a lower number. Domain (L1) depends on nothing
but L0. Presentation (L4) never talks to data access (L2) directly — it goes through L3 hooks.
(Fowler presentation-domain-data + separated presentation, Bespoyasov clean architecture,
Stemmler layers, Developer Way, FSD layer rule.)

**Slice rule:** a slice does not import another slice's internals. Either use its public API
(`index.ts`), push the shared part down to L0/shared, or let the routing shell (L5) compose both.
(Bulletproof, FSD, Wieruch, profy.dev, Developer Way.)

### Next.js-specific boundary

The server/client split is a second, physical boundary that cuts across layers:

- Server-side L2 (DAL) is `import 'server-only'`, the only place that reads secrets / DB, returns DTOs.
- `'use client'` marks the leaf of L4 where interactivity starts, not a whole subtree.
- Whatever crosses the boundary is a DTO: serializable, minimal fields.
- Server Actions / Route Handlers are entry points (L5-like): validate + authorize, then delegate to L2.

(Next.js server/client components, data security guide, security blog, OWASP cheat sheet, FSD `index.server.ts`.)

### Placement algorithm (what SKILL.md should teach)

1. **Which layer?** Does it render → L4. Holds state / orchestrates → L3. Talks to the network or
   storage → L2. Pure rule over domain data → L1. Used by every slice, no domain meaning → L0.
2. **Which scope?** component → route/page → feature slice → shared. Start at the narrowest scope;
   promote one step when a second consumer appears (Dodds colocation, Wieruch, Bulletproof).
3. **Does the import direction hold?** If the new file needs to import "upward" (L1 needing a hook,
   shared needing a feature), the split is wrong — move the dependency or invert it.
4. **Is it on the right side of server/client?** Secrets and privileged data never in client modules.

### Right-size it

Minimum that pays off for any size: pull domain logic out of components (L1) and obey the dependency
direction. Ports/adapters, use-case classes, FSD layers are optional and only for bigger apps
(Bespoyasov, Stemmler conclusion, React FAQ "start simple", Fowler "small granularity").

## Principles (draft for SKILL.md)

**P1 — Separate presentation from domain from data.** Components render; domain rules are plain
TS with no React; data access is its own module. Test: if a second UI (CLI, another page) would
duplicate it, it is domain, not view.
Sources: Fowler layering + separated presentation, Bespoyasov, Stemmler, Fowler/Qiu modularizing + headless component, React purity.

**P2 — Dependencies point inward only.** Routing → presentation → interaction → data/domain → shared.
Never the reverse, never sideways across slices.
Sources: Fowler, Bespoyasov, FSD, Bulletproof, Developer Way, Wieruch.

**P3 — Top level screams the domain.** Organize by feature/domain slices, layer inside each slice.
Layer-named global folders stay small and generic.
Sources: Uncle Bob screaming architecture, profy.dev, Stemmler vertical slices, Fowler (domain modules for larger systems), Bulletproof, FSD.

**P4 — A module is its public API.** Each slice/component folder exposes `index.ts`; outsiders import
only that. Barrel = one folder's API, never an app-wide re-export hub; runtime imports from
concrete files when bundling/tree-shaking needs it.
Sources: profy.dev, Wieruch, Developer Way, FSD public API, Bulletproof + Vercel (barrel cost), Next package bundling.

**P5 — Scope ladder: colocate, promote on the second consumer.** component → route → feature → shared.
Name by topic (`format-cost.ts`), never a catch-all `utils.ts`.
Sources: Dodds colocation + state colocation, Wieruch, Bulletproof, React FAQ.

**P6 — Data access is one layer with one entry point.** Components never `fetch`. Query key and query
fn live together per domain (`queryOptions` / key factory). In Next server code: server-only DAL with DTOs.
Sources: Next data security, TkDodo ×3, TanStack `queryOptions`, Stemmler (storage facade), Fowler/Qiu (network module).

**P7 — The routing shell only composes.** `page.tsx` / `layout.tsx` read params, choose slices,
wire providers. Logic lives in the layers below.
Sources: Next project structure (private folders split UI from routing), FSD with Next.js (thin route files), Stemmler (one container per page, wiring only), profy.dev (thin pages folder).

**P8 — Server/client is an architectural boundary.** `server-only` for privileged modules, `'use client'`
at the leaf, DTOs across, every action/handler authorizes itself.
Sources: Next server/client components, data security, security blog, OWASP.

**P9 — Architecture is enforced, not remembered.** Import rules in lint (eslint-plugin-boundaries /
`import/no-restricted-paths`); tests follow layers: domain = unit, interaction = hook test,
presentation = integration.
Sources: eslint-plugin-boundaries, Bulletproof, Fowler separated presentation (dependency checks in build), headless component (hook testable alone), Uncle Bob (use cases testable without framework).

**P10 — Right-size.** Start with P1 + P2; add slices, ports, FSD only when the app grows.
Sources: Bespoyasov, Stemmler conclusion, React FAQ, Fowler layering.

## In this repo (`client/`) — layer map, checked 2026-11-24

| Layer | Where it lives today | State |
|---|---|---|
| L5 routing | `src/app/**/page.tsx` | Mixed: `agents/page.tsx`, `settings/[section]/page.tsx` are 7 lines; `repos/[repoId]/pulls/[number]/page.tsx` 185, `pulls/page.tsx` 135 |
| L4 presentation | `src/app/**/_components/Name/`, `src/components/<kebab>/` | Component = folder (`Name.tsx`, `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts`, tests). 60 `'use client'` files — expected, data comes from separate Fastify API |
| L3 interaction | `src/lib/hooks/*` (data hooks), `components/app-shell/hooks/` | Data hooks grouped **by type** in one global folder, split by domain file (`agents.ts`, `reviews.ts`, `trace.ts`, `repo-intel.ts`, `core.ts`) |
| L2 data | `src/lib/api.ts#apiFetch` | Single entry point holds; no raw `fetch` in components. 33 inline `queryKey: [...]` literals, no key factory / `queryOptions` |
| L1 domain | component `helpers.ts` (9 files), `src/lib/format-cost.ts`, `github-urls.ts`, `model-label.ts` | Pure, none import React; e.g. `FindingsPanel/helpers.ts#countBySeverity` + `helpers.test.ts` |
| L0 shared | `src/vendor/shared` (contracts, copy of server), `src/vendor/ui` (UI kit) | Barrel `@devdigest/shared` breaks runtime imports in Next webpack → import values from contract file (client/INSIGHTS.md 2026-11-20) |

Slices today are implicit in routes (`repos/…/pulls`, `agents`, `settings`, `onboarding`), not in a
`features/` folder. Import direction holds (`src/lib` imports no `@/components` / `@/app`;
`src/components` imports no `@/app`) but nothing enforces it — client has no ESLint config.

## Sources

All links opened on 2026-11-24 unless marked. Key points are paraphrased.

### Architecture concepts

| Source | Key points | Feeds |
|---|---|---|
| [Martin Fowler — Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) | Three logical layers: presentation, domain, data. Dependencies top-down; a mapper can invert domain→data. Layers are logical, not tiers. Layer-named top folders only for small systems; larger ones split top level into domain modules, layered inside | P1, P2, P3, P10 |
| [Martin Fowler — Separated Presentation](https://martinfowler.com/eaaDev/SeparatedPresentation.html) | Presentation only manipulates presentation. One-way visibility: presentation → domain, never back; check with dependency tools in the build. Test: imagine a second UI — what you'd duplicate is domain | P1, P2, P9 |
| [Robert C. Martin — Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html) | Top-level structure shows the domain and use cases, not the framework. Framework and delivery mechanism are details kept at arm's length. Use cases testable without framework/server/DB | P3, P9 |
| [Alex Bespoyasov — Clean Architecture on Frontend](https://bespoyasov.me/blog/clean-architecture-on-frontend/) | Domain (entities + pure transforms) → application (use cases + ports) → adapters (UI, API, storage). Only outer depends on inner. Use case = side effect → pure fn → side effect. Ports per feature; swapping a service touches only its adapter. Warns against over-engineering: minimum = extract domain + obey direction. Page partly read via summary | P1, P2, P10 |
| [Khalil Stemmler — Client-side architecture: Layers](https://khalilstemmler.com/articles/client-side-architecture/layers/) (2020) | Presentation components (render + emit events), container per page (wiring only), interaction layer (decisions, commands/queries), networking + state as infrastructure behind a facade (`useQuery`/`useMutation`) | P1, P6, P7 |
| [Khalil Stemmler — Client-side architecture: Principles](https://khalilstemmler.com/articles/client-side-architecture/principles) | Command-Query Separation + Separation of Concerns. Feature = vertical slice through layers; low coupling between slices, high inside. Co-locate by feature, then by page | P3, P5 |
| [profy.dev — Screaming Architecture: evolution of a React folder structure](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25) (profy.dev original DNS-failed; dev.to copy read) | Group-by-type says "React app", not what it does. Evolution: by type → by page → page + colocation → by feature. `features/<x>` + thin `pages/`. Feature exposes `index` public API; no deep imports | P3, P4, P7 |
| [Juntao Qiu (martinfowler.com) — Modularizing React applications](https://martinfowler.com/articles/modularizing-react-apps.html) | React is a view library: split view from non-view. Components (view), hooks (state), plain domain models (no React), network + conversion module. Strategy objects instead of scattered branches. Page partly via summary | P1, P6 |
| [Juntao Qiu (martinfowler.com) — Headless Component](https://martinfowler.com/articles/headless-component.html) | Split behavior (hook, renders nothing) from view (JSX). Hook testable alone; several views share one hook. Page partly via summary | P1, P9 |

### Structure guides

| Source | Key points | Feeds |
|---|---|---|
| [Bulletproof React — Project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | `src/app` + shared top-level folders + `features/<name>/` with only needed subfolders. Feature-only utils stay in feature. One-way imports shared → features → app; no cross-feature imports; enforce with `import/no-restricted-paths`. Discourages barrels | P2, P3, P4, P5, P9 |
| [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) | Layers app, pages, widgets, features, entities, shared. Slices = domains, segments = `ui/api/model/lib/config`. Import only strictly lower layers; no cross-slice imports in one layer. Business logic in `model`. `steiger` linter | P2, P3, P4 |
| [Feature-Sliced Design — Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) | Rename FSD `app`/`pages` to `_app`/`_pages`. Next `app/` at root, FSD in `src/`. Route files thin, re-export page components. `index.server.ts` keeps server code out of client bundles | P7, P8 |
| [Developer Way — React project structure for scale](https://developerway.com/posts/react-project-structure) (2022) | Features as packages with public API. Inside: `data` + `shared` depend on nothing, `ui` depends on both. Strict tree in `ui`, no sibling imports. Nesting ≤3–4 | P2, P4 |
| [Robin Wieruch — React folder structure](https://www.robinwieruch.de/react-folder-structure/) (updated 2026-05) | Growth path file → folder per component → technical folders → features → domains → packages. Promote util/hook/component to shared at 2+ features. Shared → features → pages. Test: deleting a feature breaks only its pages. Barrels discouraged | P2, P3, P5 |
| [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | Code as close to where it's relevant as possible; utils next to their only consumer until truly shared | P5 |
| [Kent C. Dodds — State colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | State in the closest common parent; providers not all at root | P5 |
| [React (legacy) — File structure FAQ](https://legacy.reactjs.org/docs/faq-structure.html) | No prescribed structure; by feature or by type; ≤3–4 nesting; start simple | P5, P10 |

### Next.js boundaries

| Source | Key points | Feeds |
|---|---|---|
| [Next.js — Project structure](https://nextjs.org/docs/app/getting-started/project-structure) | Unopinionated. Only `page`/`route` public; colocation in `app/` safe. `_folder` private: split UI from routing. Route groups. Three strategies; pick one, stay consistent | P3, P7 |
| [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Server by default; `'use client'` at interactive leaf. Server components as `children` stay out of client graph. Serializable minimal props. `server-only`/`client-only` build guards | P8 |
| [Next.js — Data security](https://nextjs.org/docs/app/guides/data-security) | One data approach per project; DAL (server-only, authz, DTOs) for new projects; only DAL reads env/DB. Server Actions are public endpoints: authorize + validate, thin, delegate to DAL | P6, P8 |
| [Next.js blog — How to think about security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions) (2023) | Stick to one data model so audits find exceptions. DTOs. `"use server"` args and route params are user input | P6, P8 |
| [Next.js — Package bundling](https://nextjs.org/docs/app/guides/package-bundling) | Heavy non-interactive work → server. `optimizePackageImports`. Bundle analyzer | P4, P8 |
| [Vercel — How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) (2023) | Big barrels load every re-export; slower dev/build/cold start. Lint against barrel imports in own code | P4 |
| [OWASP — Next.js Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nextjs_Security_Cheat_Sheet.html) | Server-only DAL + DTOs; each action/handler authorized separately; `server-only` is a guard, not data shaping | P8 |

### Data layer

| Source | Key points | Feeds |
|---|---|---|
| [TkDodo — Effective React Query keys](https://tkdodo.eu/blog/effective-react-query-keys) | Keys generic → specific for prefix invalidation; keys + fns colocated per feature; key factory per feature | P6 |
| [TkDodo — The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | One options object for `useQuery`, prefetch, cache reads; key and fn together | P6 |
| [TkDodo — Creating query abstractions](https://tkdodo.eu/blog/creating-query-abstractions) | Build on `queryOptions()`, not hook-only wrappers; hooks optional on top | P6 |
| [TanStack Query — `queryOptions`](https://tanstack.com/query/latest/docs/framework/react/reference/functions/queryOptions) — not opened, from search | Typed shared options object | P6 |

### Enforcement

| Source | Key points | Feeds |
|---|---|---|
| [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | Folder patterns → element types; allow/disallow imports between types; ESLint errors in editor + CI | P2, P9 |

### Component-level (link out, not this skill's subject)

| Source | Use |
|---|---|
| [React — Keeping components pure](https://react.dev/learn/keeping-components-pure) | Why L4 must not own side effects (supports P1); details → react-best-practices |
| [React — You might not need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | Derived state → react-best-practices |
| [React — Reusing logic with custom hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | Function with no hooks is a plain fn (L1), not `useX` (L3) — supports layer split |

### Counterpoints

| Source | Key points | Feeds |
|---|---|---|
| [Antony Leme — Business vs application logic](https://antonyleme.medium.com/business-vs-application-logic-how-to-separate-and-test-your-reactjs-code-4291d0c983b1) — **NOT read: HTTP 403**; search snippet only | Hooks/state/handlers are application logic, not business logic; test rules as plain code. Agrees with L1/L3 split — verify before citing | P1 |

## Disagreements and open questions

- **Layer folders vs slice folders.** Bespoyasov uses top-level layer folders (`domain/ application/ ui/`);
  Fowler, Uncle Bob, Stemmler, profy.dev, Bulletproof, FSD put slices on top. Draft: slices on top, layers inside.
- **Where interaction logic lives.** Stemmler/Qiu: hooks. Bespoyasov: framework-free use cases with ports.
  Draft: hooks (L3) call pure L1 functions; ports only if a second data source appears.
- **Global `lib/hooks` vs per-slice data.** Repo AGENTS.md mandates `src/lib/hooks`; TkDodo/Bulletproof put
  queries in the feature. Decide: keep global folder split by domain file, or move to slices later.
- **Custom hooks vs `queryOptions()`.** TkDodo prefers `queryOptions` as main abstraction. Middle ground:
  `queryOptions` per domain file, hooks wrap them.
- **FSD for this app?** Strict layers + `steiger`, but needs `_app`/`_pages` renames. Probably overkill at
  current size (P10) — confirm.
- **Barrels.** Per-folder `index.ts` = public API (P4) vs Bulletproof/Wieruch "avoid barrels". Decide on
  `src/lib/hooks/index.ts` (5-file `export *`).
- **No lint.** P9 has nothing to hook into until client gets an ESLint config — separate task.
- **Fat pages** (`pulls/[number]/page.tsx` 185 lines) violate P7 — refactor is a separate task.

## Decisions taken into SKILL.md (2026-11-24)

| Principle | SKILL.md section | Decision on open question |
|---|---|---|
| P1, P2 | Layers; CRITICAL dependency direction | Slices on top, layers inside (not Bespoyasov's top-level layer folders) |
| P8 | CRITICAL server/client boundary | Kept generic; repo note says N/A until Server Components fetch |
| P1, P6, P7, P9 | HIGH placement | Interaction logic in hooks (L3) calling pure L1; no ports/use-case classes |
| P5 | HIGH scope ladder | Promote one rung on 2nd consumer; no `utils.ts` |
| P4 | MEDIUM module boundaries | Per-folder `index.ts` kept as public API; app-wide barrels banned; alias for cross-folder imports (repo has 18× `../../../../../../../lib` imports) |
| P10 | MEDIUM right-size | No FSD for this app; no `features/` folder for a single feature |
| P6 | In this repo | Keep global `src/lib/hooks/<domain>.ts` (client/AGENTS.md mandates it); define keys / `queryOptions` once per domain file instead of literals |
| P9 | In this repo + checklist | No ESLint in client → review checklist; boundaries lint = separate task |

Rejected for the skill: FSD layer set (overkill, needs `_app`/`_pages` renames), ports/adapters (one data
source), moving data hooks into route slices (contradicts client/AGENTS.md), fat-page refactor (separate task).

## Considered, not used

| Source | Why |
|---|---|
| Community "skills" pages (skills.sh, playbooks.com, skillsmp.com, mcpmarket.com) on FSD / Next / screaming architecture | Secondary AI-written restatements; primary sources used instead |
| dev.to / Medium / Hashnode "separate logic with custom hooks" posts | Same point as Fowler/Qiu + React docs with less rigor |
| [freeCodeCamp — Reusable architecture for large Next.js apps](https://www.freecodecamp.org/news/reusable-architecture-for-large-nextjs-applications/) | Not read in full; covered by Bulletproof/FSD |
| [Habr — FSD in Next.js (VK team, RU)](https://habr.com/ru/articles/831148) | Not read in full; official FSD Next.js guide covers it |
| Bespoyasov "Explicit Design" series (dev.to) | Deeper ports/adapters detail than this app needs (P10) |
| `@lukemorales/query-key-factory` | Library alternative to `queryOptions`; extra dependency for what v5 does natively |
