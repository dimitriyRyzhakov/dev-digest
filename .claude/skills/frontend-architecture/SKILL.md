---
name: frontend-architecture
description: Architecture concept for React + Next.js (App Router) frontends — layers, dependency direction, feature slices, module public APIs and the server/client boundary. Use when deciding where new code goes (component, hook, helper, util, business logic, data access, query keys), creating or moving files or folders, splitting a component or page, adding a feature, reviewing imports or folder structure, or when asked "where should this live", "folder structure", "architecture", "де це покласти", "структура папок". Not for component-level React rules (state, effects, memo) — those are in react-best-practices.
---

# Frontend architecture

Goal: every file has an obvious home, and imports only point one way, so features can change
without breaking each other. For code samples see [examples.md](examples.md); sources and
rationale in [references.md](references.md) (humans only).

Not here: derived state, `useEffect`, memo, component size → [react-best-practices](../react-best-practices/SKILL.md).
Next.js file conventions, RSC details → [next-best-practices](../next-best-practices/SKILL.md).

## The model: layer × slice

Every file has two coordinates:

- **Layer** — what kind of code it is. Decides what it may import.
- **Slice** — which feature/domain it serves, and how wide. Decides which folder it sits in.

Top level is split by **slice** (domain names: `reviews`, `agents`, `repos`), layers live **inside**
the slice. Global layer-named folders (`components/`, `hooks/`, `lib/`) hold only code with 2+ consumers.

## Layers (outer → inner)

| # | Layer | Holds | Never holds |
|---|---|---|---|
| L5 | **Routing shell** | `page` / `layout` / `loading` / `error`, reading params, choosing slices, providers | business rules, data mapping, fetch |
| L4 | **Presentation** | components: render props, emit events, UI-only state (open, hover, focus) | fetch, business decisions, DTO reshaping |
| L3 | **Interaction** | hooks: orchestrate domain + data, selection/form state, mutations, handlers | JSX, raw `fetch`, rules that need no React |
| L2 | **Data access** | API client, query keys / `queryOptions`, DTO → view-model mapping, server-only DAL | UI state, rendering |
| L1 | **Domain** | types + pure functions: filter, sort, count, score, validate, format domain values | React, `fetch`, `window`, storage, i18n runtime |
| L0 | **Shared kernel** | API contracts, UI-kit primitives, tiny generic libs | anything feature-specific |

## Rules

### CRITICAL — dependency direction
- A layer imports only lower-numbered layers. L1 imports only L0. NEVER import "upward".
- L4 components NEVER call L2 directly (`fetch`, API client, query fns) — go through an L3 hook.
- A slice NEVER imports another slice's internals. Use its `index.ts`, push the shared part down
  to shared/L0, or let L5 compose both slices.
- Shared folders NEVER import from a slice or from `app/`.
- Needing an upward import means the split is wrong: move the code down or pass it in as a prop/callback.

### CRITICAL — server/client boundary (Next.js)
- Modules that read secrets, DB or privileged APIs start with `import 'server-only'`.
- Only `NEXT_PUBLIC_*` env reaches the browser; anything else is empty there.
- Data crossing server → client is a DTO: serializable, only the fields the UI needs.
- Server Actions and Route Handlers are public entry points: validate input, authorize, then
  delegate to L2. A page-level check does not protect them.
- `'use client'` goes on the interactive leaf, not on a whole page or layout.

### HIGH — placement
- Business rules are L1 pure functions, unit-tested without rendering. A function that calls no
  hook is NOT a hook (`getVisible`, not `useVisible`).
- Hooks are glue: they hold state and call L1/L2. Keep decisions in L1 so they're testable alone.
- One data entry point. Query key and query fn are defined together, per domain, not as string
  literals scattered across components.
- `page.tsx` / `layout.tsx` only compose. Logic below L5 → `_components/` or the slice.
- Test by layer: L1 unit, L3 hook test, L4 integration with mocked data layer.

### HIGH — scope ladder
Start at the narrowest scope; promote ONE step when a second consumer appears, not before:

1. inside the component folder (`Name/helpers.ts`, `Name/useThing.ts`)
2. route-private (`app/<route>/_components/`)
3. feature slice (`features/<slice>/…` or the slice's domain file)
4. shared (`components/`, `lib/<topic>.ts`, `lib/hooks/<domain>.ts`)

Name by topic (`format-cost.ts`, `github-urls.ts`). NEVER create a catch-all `utils.ts` / `helpers/`
dumping ground at the shared level.

### MEDIUM — module boundaries
- Every component/slice folder exposes `index.ts` = its public API. Outsiders import the folder, not
  its internal files.
- `index.ts` re-exports ONE folder. NEVER build app-wide barrels that `export *` many modules —
  they defeat tree-shaking and slow Next builds.
- Cross-folder imports use the path alias (`@/lib/...`, `@/components/...`); relative paths only
  inside the same folder/slice. A `../../../../` chain means you crossed a boundary.
- Folder nesting ≤3–4 levels. Deeper → the child is its own component or belongs to the slice.

### MEDIUM — right-size
- Minimum for any app: L1 extracted + dependency direction obeyed.
- Ports/adapters, use-case classes, Feature-Sliced Design layers only when the app has several data
  sources or teams. Don't add a layer that has one file and no second consumer.

## Placement — decide in order

1. **Layer?** Renders → L4. State / orchestration → L3. Network / storage → L2. Pure rule → L1.
   Generic, no domain meaning → L0.
2. **Scope?** How many consumers today? Place at the narrowest rung of the scope ladder.
3. **Direction?** List its imports. Any upward or sideways import → split differently.
4. **Server or client?** Secrets / privileged data → server-only module, DTO out.

## In this repo (`client/`)

Read `client/AGENTS.md` and `client/INSIGHTS.md` first; they win on conflict.

| Layer / scope | Home |
|---|---|
| L5 | `src/app/**/page.tsx`, `layout.tsx` |
| L4 route-private | `src/app/**/_components/Name/` (`Name.tsx`, `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts`, tests beside) |
| L4 shared | `src/components/<kebab-name>/` |
| L3 data hooks | `src/lib/hooks/<domain>.ts` (`agents`, `reviews`, `trace`, `repo-intel`, `core`) — every data hook lives here |
| L3 UI hooks | beside the component (`useThing.ts`) or `src/components/<name>/hooks/` |
| L2 | `src/lib/api.ts#apiFetch` / `api` — the only `fetch` |
| L1 component-scope | `Name/helpers.ts` + `helpers.test.ts` |
| L1 shared | `src/lib/<topic>.ts` (`format-cost.ts`, `github-urls.ts`, `model-label.ts`) |
| L0 | `src/vendor/shared` (contracts; COPY — server is canonical), `src/vendor/ui` (UI kit; don't touch without a UI-kit task) |
| UI text | `messages/<locale>/*.json` via next-intl |

Repo specifics:
- Slices are implicit in routes (`repos/[repoId]/pulls`, `agents`, `settings`, `onboarding`); there is
  no `features/` folder. Don't introduce one for a single feature.
- Client talks to a separate Fastify API, so most components are `'use client'` and there is no
  server-only DAL yet. The server/client rules apply once Server Components or Actions fetch data.
- Runtime values from `@devdigest/shared` → import the contract file
  (`@devdigest/shared/contracts/findings`); the barrel only for `import type` (Next webpack bug).
- Query keys live in one factory per domain file (`agentKeys`, `coreKeys`, `reviewKeys`,
  `repoIntelKeys`, `traceKeys`). Never spell a key array elsewhere; components that must refresh
  the cache call a hook (e.g. `usePrRunsRefresh`), not `useQueryClient`.
- Routes are thin: `page.tsx` reads params and renders `_components/<Name>View` inside its own
  `<Suspense>` when the view reads search params (no app-wide Suspense).
- `pnpm lint` enforces the direction rules (`eslint-plugin-boundaries` in `client/eslint.config.mjs`),
  bans `@/app/*` imports, 4+ `../`, and `fetch` outside `src/lib/api.ts`. Run it on every change.

## Review checklist

- [ ] Each new file's layer and scope are obvious from its path.
- [ ] No upward import (helpers/lib importing React components or hooks; shared importing `app/`).
- [ ] No component calling `apiFetch`/`fetch` or building query keys itself.
- [ ] No business rule inside JSX or a hook body that could be a pure L1 function.
- [ ] No import into another slice's internal file; no `../../../../` across folders.
- [ ] Nothing promoted to shared with only one consumer; no new `utils.ts`.
- [ ] `page.tsx` composes only. `'use client'` at the leaf.
- [ ] Server-only code guarded; only DTO fields cross to the client.
