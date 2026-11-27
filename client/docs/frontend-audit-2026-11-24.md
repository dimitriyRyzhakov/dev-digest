# client — frontend audit (2026-11-24)

Snapshot review of `client/src` (vendor excluded) against three skills:
[frontend-architecture](../../.claude/skills/frontend-architecture/SKILL.md),
[react-best-practices](../../.claude/skills/react-best-practices/SKILL.md),
[next-best-practices](../../.claude/skills/next-best-practices/SKILL.md).
Method: grep-driven scan + reading flagged files; `pnpm typecheck` ✅ and `pnpm build` ✅ (exit 0).
Code was unchanged at audit time; the fixes landed the same day — see **Status after refactor** below.

## Status after refactor (2026-11-24)

| # | Status | What changed |
|---|---|---|
| 1 | ✅ fixed | `app/error.tsx` (in-layout, i18n, Try again + Go to start page), `app/global-error.tsx`, `app/not-found.tsx` |
| 2 | ✅ fixed | `FileCard key={f.path}` |
| 3 | ✅ fixed | page no longer touches the cache; `usePrRunsRefresh(prId)` in `lib/hooks/reviews.ts` |
| 4 | ✅ fixed | `ConfigTab` = one form object (`helpers.ts#toConfigForm/toAgentPatch` + tests); `AgentEditor` keys it by `agent.id`; reset effect gone |
| 5 | ✅ fixed | `eslint.config.mjs`: next core-web-vitals + typescript, `eslint-plugin-boundaries` (app → components → lib → vendor), no `@/app/*` cross-route imports, no 4+ `../`, no `fetch` outside `lib/api.ts`; `pnpm lint` clean |
| 6 | ✅ fixed | all route `page.tsx` files are thin: `PrDetailView`, `PullsView`, `AgentDetailView`; `usePrIdByNumber`; `FindingsTab` is a container (6 props, was 13) |
| 7 | ✅ fixed | `agentKeys`, `coreKeys`, `reviewKeys`, `repoIntelKeys`, `traceKeys`; 0 inline `queryKey: [...]` literals left |
| 8 | ✅ fixed | `RunHistory/helpers.ts#outcomeKey/outcomeOf/buildTimeline` + tests; styles → `styles.ts`; 237 → 149 lines; delete control is a real `<button>` |
| 9 | ✅ fixed | 66 imports → `@/…`; tests use `@messages/*` alias; 0 imports with 3+ `../` |
| 10 | ✅ fixed | strings moved to next-intl in home, PR detail/header/tabs, FindingsTab, accordion, AgentCard, agent editor page, AddRepoView, CodeLine (English text unchanged, e2e selectors still match). Left: `vendor/ui` (`ErrorState` "Retry"), `lib/toast.tsx` "Dismiss", `global-error.tsx` (no providers there) |
| 11 | ✅ fixed | global Suspense removed; the 3 pages using `useSearchParams` wrap their own view |
| 19 | ✅ fixed | `lib/hooks/hooks.test.tsx`: key shapes, refreshers, `usePrIdByNumber`, `useUpdateAgent` cache write |
| 12–18 | ⏭ skipped | as decided below |

Verification: client 102 tests (was 70) · typecheck · lint · `next build` ✅; server 206 tests + `lint:arch` ✅;
reviewer-core 23 tests ✅; browser check of every route on the dev stack ✅; e2e hermetic 7/7 ✅ ×2 after adding the
missing `wait --text` to flows 04/05 (without it they raced the PR-list fetch: 0/2 green runs on the refactor, 3/3 on the old code).

## How to read

**Severity** (from the skills): CRITICAL = bugs / broken architecture rule · HIGH = will bite as the
app grows or under real use · MEDIUM = maintainability · LOW = cosmetic.

**Decision:**
- **MUST** — fix; real bug risk or a CRITICAL rule broken, and the fix is small.
- **SHOULD** — worth doing, plan it (next milestone or when touching the file).
- **SKIP** — accepted as is; reason given. Re-check only if the reason stops holding.

## Summary

| # | Finding | Skill | Severity | Decision | Effort |
|---|---|---|---|---|---|
| 1 | No error boundary anywhere (`error.tsx`, `global-error.tsx`) | Next / React | HIGH | **MUST** | S |
| 2 | `DiffViewer` keys `FileCard` by index; card has its own state | React | HIGH | **MUST** | XS |
| 3 | PR page builds query keys and invalidates cache itself | Architecture | CRITICAL | **MUST** | S |
| 4 | `ConfigTab`: 9 `useState` + reset `useEffect` on `agent.id` | React | HIGH | **MUST** | S |
| 5 | No ESLint: `react-hooks` + import boundaries never checked | Architecture / React | HIGH | SHOULD | M |
| 6 | Fat PR page (185 lines) → `FindingsTab` gets 13 props | Architecture / React | HIGH | SHOULD | M |
| 7 | 33 inline query-key literals, no key factory | Architecture | HIGH | SHOULD | M |
| 8 | Domain rule `outcomeOf` inside `RunHistory.tsx` (237 lines) | Architecture | HIGH | SHOULD | S |
| 9 | 43 imports with 4+ `../` (e.g. `../../../../../../../lib/api`) | Architecture | MEDIUM | SHOULD | S (mechanical) |
| 10 | Hard-coded English UI strings in 6+ places | Repo convention | MEDIUM | SHOULD | S |
| 11 | Root layout wraps whole app in `<Suspense fallback={null}>` | Next | MEDIUM | SHOULD | S |
| 12 | Effects used as event triggers (`RunStatus`, `ReviewRunAccordion`) | React | MEDIUM | SKIP (for now) | S |
| 13 | 21 `useCallback` / 6 `useMemo`, most not feeding `memo` children | React | LOW | SKIP | — |
| 14 | Inline `style={{…}}` heavy in some components (up to 16) | Repo convention | LOW | SKIP / opportunistic | — |
| 15 | Other index keys (skeletons, trace tool calls, prompt lines) | React | LOW | SKIP | — |
| 16 | Client-side redirect in `app/page.tsx` effect | Next | LOW | SKIP | — |
| 17 | One `<title>` for all pages | Next | LOW | SKIP | — |
| 18 | Build warning: inferred workspace root (several lockfiles) | Next | LOW | SKIP / 1-line | XS |
| 19 | No tests for `src/lib/hooks/*` | Architecture (test by layer) | MEDIUM | SHOULD (with #7) | M |

Effort: XS < 15 min · S < 1 h · M = half a day.

## MUST

### 1. No error boundary — HIGH
- **Where:** `src/app/` has only `layout.tsx`; no `error.tsx`, `global-error.tsx`, `not-found.tsx`. No
  `react-error-boundary` either.
- **Risk:** any render exception (bad API shape, `undefined.map`) unmounts the whole tree; prod shows
  Next's bare "Application error" with no way back.
- **Fix:** `app/error.tsx` (client, "Try again" → `reset()`), `app/global-error.tsx`; optionally a
  segment `error.tsx` for `repos/[repoId]/pulls/[number]` so the PR page fails alone. Use
  `@devdigest/ui` `ErrorState` + next-intl strings.

### 2. `FileCard key={i}` — HIGH
- **Where:** `src/components/diff-viewer/DiffViewer/DiffViewer.tsx` → `files.map((f, i) => <FileCard key={i} …/>)`.
  `FileCard` keeps `open` state (and hosts the inline comment composer).
- **Risk:** when the file list changes (new commit pushed, filter), state stays with the index, so the
  wrong file is expanded / a draft comment shows under another file.
- **Fix:** `key={f.filename}` (or the file's path + status if renames can collide).

### 3. PR page talks to the cache directly — CRITICAL (dependency direction)
- **Where:** `src/app/repos/[repoId]/pulls/[number]/page.tsx#invalidateActiveRuns / invalidateRunHistory` —
  `useQueryClient()` + `qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] })`, `["pr-runs", prId]`.
- **Rule:** L5/L4 never touch L2; query keys live in one place (`src/lib/hooks/<domain>.ts`). The page
  duplicates keys owned by `src/lib/hooks/reviews.ts`; a rename there silently breaks refresh here.
- **Fix:** export `useRefreshRuns(prId)` (or `invalidateRuns`) from `src/lib/hooks/reviews.ts` and call
  it from the page. This is also the first step of #7.

### 4. `ConfigTab` mirrors props into 9 states — HIGH
- **Where:** `src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx` — 9 `useState`
  seeded from `agent`, then a `useEffect` re-setting all 9 on `agent.id`, with
  `// eslint-disable-line react-hooks/exhaustive-deps` (and ESLint isn't even installed, see #5).
- **Rule:** "Derive, don't store" / reset state with `key`, not an effect (react.dev).
- **Risk:** one render with the old agent's values after switching; every new field must be added in
  three places (state, reset, submit).
- **Fix:** in `AgentEditor.tsx` render `<ConfigTab key={agent.id} agent={agent} />`, delete the effect;
  collapse the 9 states into one `useReducer`/form object.

## SHOULD

### 5. No ESLint — HIGH
- `client/package.json` has no eslint; 3 `eslint-disable` comments point at rules that never run.
- Hook dependency bugs and upward/sideways imports are caught only by review.
- **Do:** add `eslint` + `eslint-config-next` (includes `react-hooks`) and an import-boundary rule
  (`eslint-plugin-boundaries` or `import/no-restricted-paths`): `lib` ↛ `components`/`app`,
  `components` ↛ `app`, `app/<a>` ↛ `app/<b>`. Wiring into CI = separate task (`.github/workflows`).

### 6. Fat PR page + prop drilling — HIGH
- `src/app/repos/[repoId]/pulls/[number]/page.tsx` (185 lines): resolves PR number → uuid, runs 7 data
  hooks, owns URL param logic, cache invalidation, and passes 13 props into
  `_components/FindingsTab/FindingsTab.tsx`.
- **Do:** page = read params + `<PrDetailView repoId number />`. Move the number→uuid lookup into a hook
  (`usePrIdByNumber`). Let `FindingsTab` call `usePrActiveRuns` / `usePrRuns` / `useCancelRun` itself
  (container) instead of receiving them. Do together with #3.

### 7. Query keys as literals — HIGH
- 33 `queryKey: [...]` literals across `src/lib/hooks/*`; invalidations repeat them
  (`["agents"]` ×4 in `agents.ts`).
- **Do:** per domain file, a keys object (or `queryOptions`) at the top; reuse in queries,
  invalidations, prefetch. Start with `reviews.ts` (keys leak to the page, #3), then `agents.ts`.

### 8. Domain logic in a component file — HIGH
- `_components/RunHistory/RunHistory.tsx#outcomeOf` decides run outcome (rejected / reviewed /
  approved) from counts — a business rule that must match the CI gate, untested.
- **Do:** move to `RunHistory/helpers.ts` + `helpers.test.ts`; component keeps colours/icons mapping.
  File drops well under 200 lines.

### 9. Deep relative imports — MEDIUM
- 43 imports with 4+ `../`; top targets `lib/hooks/agents` (6), `lib/hooks/reviews` (5),
  `lib/types` (4), `components/app-shell` (3). Also `FindingsTab.tsx` imports
  `../RunHistory/RunHistory` (sibling internal file, bypasses `index.ts`).
- **Do:** one mechanical PR → `@/lib/...`, `@/components/...`; relative only inside the folder.

### 10. Hard-coded UI strings — MEDIUM
- `src/app/page.tsx` ("Welcome to DevDigest", empty state), `FindingsTab.tsx` empty state,
  `AddRepoView.tsx` ("Add a repository"), `title`/`aria-label` in `ReviewRunAccordion.tsx`,
  `AgentCard.tsx`, `diff-viewer/CodeLine/CodeLine.tsx`.
- Only `messages/en` exists, so no user sees a wrong language today — but it breaks the
  client/AGENTS.md convention and blocks a second locale. Fix when touching each file.

### 11. Global `<Suspense fallback={null}>` — MEDIUM
- `src/app/layout.tsx` wraps all `Providers` + pages in one Suspense with no fallback, to satisfy
  `useSearchParams` CSR bailout. Any suspension anywhere blanks the whole screen.
- **Do:** wrap only the 3 pages that use `useSearchParams` (`pulls/page.tsx`, `pulls/[number]/page.tsx`,
  `agents/[id]/page.tsx`) with a skeleton fallback; drop the global one after checking `pnpm build`.

### 19. No tests for data hooks — MEDIUM
- 16 test files, none for `src/lib/hooks/*` (incl. SSE `useRunEvents` in `reviews.ts`).
- **Do:** add hook tests when doing #7 (keys refactor needs a safety net).

## SKIP (accepted)

| # | Why skip |
|---|---|
| 12 | `RunStatus` calls `onDone` from an effect on `running` true→false; `ReviewRunAccordion` opens + scrolls on `targetRunId`. Both sync with something outside React (SSE status, DOM scroll); works today. Revisit when touching `useRunEvents` (an `onSettled` callback there would be cleaner). |
| 13 | Extra `useCallback`/`useMemo` cost little; removing them is churn with no user-visible gain. Don't add new ones without a `memo` child. |
| 14 | Project uses `styles.ts` + inline objects, not Tailwind — the Tailwind rule doesn't apply. Move big inline blocks to `styles.ts` only when editing the file. |
| 15 | `Skeleton key={i}` (static list), `ToolCallRow key={i}` (append-only, no state), prompt line/mark keys (derived from text, stateless) — index is stable there. |
| 16 | Redirect to first repo needs client-fetched repos; a server redirect would need a server data path that doesn't exist (client talks to Fastify). |
| 17 | Local single-user tool; per-page titles are nice-to-have. |
| 18 | Warning only; set `outputFileTracingRoot` in `next.config` if it gets noisy. |
| — | `ApiError` imported by pages/components to branch on `status`: it is the public error type of L2, not a data-access leak. |
| — | Most pages are `'use client'`: expected, all data comes from the separate Fastify API (no server DAL). |
| — | `dangerouslySetInnerHTML` in `layout.tsx`: constant theme script from own code, not user input. |
| — | `components/showcase` (259 lines): dev-only gallery used by `test/smoke.test.tsx`. |

## What's already good

- No `fetch` outside `src/lib/api.ts` (+ SSE `EventSource` in `lib/hooks/reviews.ts`); components use hooks.
- Import direction holds: `src/lib` imports nothing from `components`/`app`; `components` nothing from
  `app`; no cross-route imports.
- 9 `helpers.ts` files, all pure (no React), several with tests (`FindingsPanel/helpers.test.ts`,
  `lib/format-cost.test.ts`).
- No runtime imports through the `@devdigest/shared` barrel (client/INSIGHTS.md bug avoided).
- Thin route entries exist (`agents/page.tsx`, `settings/[section]/page.tsx`).
- CSP with `img-src`/`connect-src` locked to self + API in `next.config`.
- No render factories, no `forwardRef`, no `count && …` zero-render bugs, icon buttons have `aria-label`.

## Suggested order

1. **One small PR (MUST):** #2 → #4 → #3 → #1. ~2–3 h, low risk, no behaviour change except fixes.
2. **Lint PR:** #5 (then fix what it reports).
3. **PR-page refactor:** #6 + #7 (reviews first) + #19.
4. **Mechanical cleanup:** #9, then #8, #10, #11 opportunistically.
