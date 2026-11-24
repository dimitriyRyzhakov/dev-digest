# frontend-architecture — examples

Bad → good pairs for the rules in [SKILL.md](SKILL.md). Paths follow `client/`; snippets are
trimmed, not copy-paste ready. Lines marked **Real code** point at existing files; every other
snippet is illustrative (names like `agentKeys`, `formatDuration`, `PrDetailView` don't exist yet).

## 1. Business rule inside a component → L1 pure function

❌ Rule lives in the render body: untestable without rendering, duplicated by the next view.

```tsx
// _components/FindingsPanel/FindingsPanel.tsx
export function FindingsPanel({ findings }: { findings: FindingRecord[] }) {
  const [hideLow, setHideLow] = React.useState(false);
  const shown = findings
    .filter((f) => !hideLow || f.confidence >= 0.5)
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  // …
}
```

✅ Rule is a pure L1 function beside the component, unit-tested alone; the component only wires state.

```ts
// _components/FindingsPanel/helpers.ts — no React import
export function visibleFindings(findings: FindingRecord[], hideLow: boolean, severity: Severity | null = null) {
  let shown = applyConfidence(findings, hideLow);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}
```

```tsx
// FindingsPanel.tsx
const shown = React.useMemo(() => visibleFindings(findings, hideLow, activeSeverity), [findings, hideLow, activeSeverity]);
```

**Real code:** `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts` + `helpers.test.ts`.

## 2. Component talks to the network → L3 hook over L2

❌ L4 skips two layers: no cache, no shared error handling, key invented on the spot.

```tsx
export function AgentCard({ id }: { id: string }) {
  const [agent, setAgent] = React.useState<Agent>();
  React.useEffect(() => { fetch(`http://localhost:3001/agents/${id}`).then((r) => r.json()).then(setAgent); }, [id]);
  // …
}
```

✅ L4 → L3 hook → L2 client. Only `src/lib/api.ts` calls `fetch`.

```tsx
// src/lib/hooks/agents.ts
export function useAgent(id: string | null | undefined) {
  return useQuery({ queryKey: agentKeys.detail(id), queryFn: () => api.get<Agent>(`/agents/${id}`), enabled: !!id });
}

// _components/AgentCard/AgentCard.tsx
const { data: agent } = useAgent(id);
```

## 3. Query keys as scattered literals → defined once per domain

❌ Same key typed in four places; one typo = stale cache that no test catches.

```ts
useQuery({ queryKey: ["agents"], … });
qc.invalidateQueries({ queryKey: ["agents"] });
qc.removeQueries({ queryKey: ["agent", id] });
```

✅ Keys (or `queryOptions`) at the top of the domain file; queries and invalidations reuse them.

```ts
// src/lib/hooks/agents.ts
const agentKeys = {
  all: ["agents"] as const,
  detail: (id: string | null | undefined) => ["agent", id] as const,
};

export const agentQuery = (id: string) =>
  queryOptions({ queryKey: agentKeys.detail(id), queryFn: () => api.get<Agent>(`/agents/${id}`) });

export function useAgent(id: string) { return useQuery(agentQuery(id)); }
// invalidation: qc.invalidateQueries({ queryKey: agentKeys.all })
```

## 4. Upward import → pass it down or move the code

❌ L1 helper imports a hook / component: now the "pure" file drags in React and can't run in a unit test.

```ts
// src/lib/format-money.ts
import { useSettings } from "@/lib/hooks";       // L1 → L3 ❌
export function formatMoney(usd: number) { const { currency } = useSettings().data!; … }
```

✅ L1 takes what it needs as a parameter; the hook or component supplies it.

```ts
// src/lib/format-money.ts
export function formatMoney(usd: number, currency: string) { … }

// component
const { data: settings } = useSettings();
formatMoney(run.costUsd, settings.currency);
```

## 5. Sideways import between slices → promote or compose

❌ The agents slice reaches into the PR-detail route's private folder.

```ts
// src/app/agents/[id]/_components/AgentEditor/…
import { FindingCard } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard"; // ❌
```

✅ Second consumer appeared → promote one rung to shared, both slices import it from there.

```text
src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/   (before: route-private)
src/components/finding-card/                                     (after: shared L4)
```

If only a part is shared (e.g. a severity colour helper), promote only that part to `src/lib/<topic>.ts`.

## 6. Fat page → routing shell that composes

❌ `page.tsx` holds data hooks, filters, tab state and 150 lines of JSX.

✅ Page reads params and picks components; everything else sits one layer down.

```tsx
// src/app/repos/[repoId]/pulls/[number]/page.tsx
"use client";
export default function PrDetailPage() {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  return <PrDetailView repoId={repoId} number={Number(number)} />;
}
// _components/PrDetailView/ — owns the data hooks, tabs and layout
```

**Real code** (thin pages): `client/src/app/agents/page.tsx`, `client/src/app/settings/[section]/page.tsx`.

## 7. Scope ladder — promote on the second consumer, not before

| Situation | Home |
|---|---|
| `formatDuration` used only by `RunHistory` | `_components/RunHistory/helpers.ts` |
| Sibling `RunStatus` needs it too | NOT `import "../RunHistory/helpers"` (sibling internals) → promote to `src/lib/format-duration.ts` |
| Agents page needs it later | already shared, import `@/lib/format-duration` (topic file, never `utils.ts`) |

**Real code** (shared L1): `client/src/lib/format-cost.ts` (+ `format-cost.test.ts`).

## 8. Deep relative path → path alias

❌ The `../` chain shows the import crosses a boundary, and it breaks when the folder moves.

```ts
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
```

✅ Alias for anything outside the current folder/slice; relative only inside it.

```ts
import { useFindingAction } from "@/lib/hooks/reviews";
import { visibleFindings } from "./helpers";
```

## 9. App-wide barrel → folder public API

❌ `src/index.ts` re-exporting every component and hook: importing one name loads all of them.

✅ Each folder's `index.ts` exports that folder only.

```ts
// _components/FindingsPanel/index.ts
export { FindingsPanel, FindingsPanel as default } from "./FindingsPanel";
```

Repo gotcha: runtime values from `@devdigest/shared` come from the contract file, not the barrel:

```ts
import { Severity } from "@devdigest/shared/contracts/findings"; // value ✅
import type { FindingRecord } from "@devdigest/shared";          // type via barrel ✅
```

## 10. Server/client boundary (Next.js, when Server Components fetch data)

❌ Secret-reading module importable from a Client Component; whole DB record passed as a prop.

```ts
// lib/github.ts
export async function getRepo(id: string) {
  return db.repo.findUnique({ where: { id } }); // returns token, internal fields …
}
```

✅ Server-only DAL, authorizes, returns a DTO; Client Components get only needed fields.

```ts
// lib/dal/repos.ts
import "server-only";
export async function getRepoSummary(id: string): Promise<RepoSummary> {
  const user = await getCurrentUser();
  const repo = await db.repo.findUnique({ where: { id, ownerId: user.id } });
  return { id: repo.id, fullName: repo.fullName, defaultBranch: repo.defaultBranch };
}
```

```ts
// app/repos/actions.ts
"use server";
export async function renameRepo(input: unknown) {
  const { id, name } = RenameRepoInput.parse(input); // validate
  await assertCanEdit(id);                              // authorize here, not only on the page
  return reposDal.rename(id, name);
}
```

## Placement walkthrough

| New code | Layer | Scope | Path in `client/` |
|---|---|---|---|
| "Count findings per severity" | L1 | one component | `FindingsPanel/helpers.ts` |
| "Accept / dismiss finding" mutation | L3 (data) | shared | `src/lib/hooks/reviews.ts` |
| j/k keyboard navigation state (if extracted) | L3 (UI) | one component | `FindingsPanel/useFindingNav.ts` |
| Severity counter chips | L4 | route-private | `pulls/[number]/_components/SeverityCounters/` |
| GitHub file URL builder | L1 | shared | `src/lib/github-urls.ts` |
| New field in `FindingRecord` | L0 | shared | `server/src/vendor/shared` first, then copy to `client/src/vendor/shared` |
| Button / Toggle primitive | L0 | shared | `src/vendor/ui` (UI-kit task only) |
