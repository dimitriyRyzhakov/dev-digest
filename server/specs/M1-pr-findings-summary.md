# M1 — PR findings summary on the PR list (server)

UI half: [client/specs/M1-pr-findings-summary.md](../../client/specs/M1-pr-findings-summary.md).
Related: [M1-run-cost-badge.md](./M1-run-cost-badge.md) (the same list endpoint, COST column).

## Goal
The PR list gets a **FINDINGS** column with per-severity counts and a hover popover that previews
the findings. The numbers must reflect the PR's real state when **several agents** reviewed it.
So they are the **sum over the latest review of each agent**, not just the single newest
review. This milestone exposes that summary on `GET /repos/:repoId/pulls`.

Example: the Security agent's latest review has 2 CRITICAL + 1 WARNING, and the Performance
agent's latest review has 1 WARNING + 1 SUGGESTION → the row shows `2 · 2 · 1` (5 findings).
The Security agent's older re-runs are ignored.

## Scope
**In**
- `GET /repos/:repoId/pulls` (`PrMeta[]`) gains `finding_counts` and `findings_preview`.
- Selecting "the latest review per agent" for every listed PR.

**Out**
- The PR detail timeline. The client builds its per-run popover from `GET /pulls/:id/reviews`,
  which it already loads. No server change.
- Pagination or a "load all" endpoint for previews. The popover links to the PR page instead.
- Filtering by agent, and per-agent breakdown in the payload.
- Changing the SCORE ring. It stays "latest review" (`latestReviewByPr`).

## Selection rule
For each listed PR:
1. Take its reviews with `kind = 'review'`, newest `created_at` first.
2. Keep the **first review per `agent_id`**. A review whose `agent_id` is `null` (legacy or
   deleted agent) is its own group, keyed by `review.id`, so it is never merged with another one.
3. The findings of the kept reviews are the PR's **current findings**.

Rules for the current findings:
- **Dismissed findings are counted and previewed** (`dismissed_at` is ignored). This matches
  "N findings" in the run header. The decision is the user's, 2026-11-21.
- All `kind`s count, including `lethal_trifecta`, by their `severity`.
- A severity outside the contract's `Severity` enum (CRITICAL / WARNING / SUGGESTION) is not
  counted. It cannot normally happen, because findings are validated on write.

## API / data changes
No migration. Read-only aggregation over `reviews` + `findings`.

Contracts (`src/vendor/shared/contracts/platform.ts`, mirrored to `client/src/vendor/shared`):

```ts
export const FindingCounts = z.object({
  CRITICAL: z.number().int(),
  WARNING: z.number().int(),
  SUGGESTION: z.number().int(),
});

export const FindingPreview = z.object({
  id: z.string(),
  severity: Severity,
  category: FindingCategory,
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  confidence: z.number(),
  rationale: z.string(), // truncated server-side to 200 chars, "…" appended when cut
});

// PrMeta additions — list endpoint only, nullish like `score` / `cost_usd`:
finding_counts: FindingCounts.nullish(),       // null = never reviewed; all zeros = reviewed, clean
findings_preview: z.array(FindingPreview).nullish(),
```

- `findings_preview` holds **at most 5** items, sorted by severity
  (CRITICAL → WARNING → SUGGESTION), then `confidence` desc, then `id` for a stable order.
  The total is `CRITICAL + WARNING + SUGGESTION` from `finding_counts`, so no separate field.
- Never-reviewed PR: `finding_counts = null`, `findings_preview = null`.
- Reviewed with zero findings: `finding_counts = { 0, 0, 0 }`, `findings_preview = []`.

### Queries (in `server/src/modules/pulls/routes.ts`, list handler)
- Widen the existing reviews IN-query to also select `id` and `agent_id`. It already runs
  newest-first over `kind='review'`. Do the per-agent grouping in JS, using the same newest-first,
  first-wins pattern as `latestReviewByPr`.
- One extra query: `findings WHERE review_id IN (<kept review ids>)`, selecting only the preview
  columns. Count and sort in JS.
- Total: two queries for the whole list (reviews + findings), no N+1. With an empty `prIds` or
  no kept reviews, skip the query.
- Keep the code readable: extract `latestReviewPerAgent(rows)` and
  `summarizeFindings(rows): { counts, preview }` as pure helpers next to the route (or in
  `modules/pulls/helpers.ts`), so they can be unit tested without a DB.

## Acceptance criteria
- Two agents whose latest reviews are {1 CRITICAL, 1 WARNING} and {1 WARNING, 2 SUGGESTION} →
  `finding_counts = { CRITICAL: 1, WARNING: 2, SUGGESTION: 2 }`.
- An older review by the same agent is ignored. A newer review replaces it.
- Two reviews with `agent_id = null` both count. They are separate groups.
- Dismissed findings are included in both counts and preview.
- `findings_preview.length ≤ 5`, sorted as specified, `rationale.length ≤ 201`.
- Never-reviewed PR → both fields `null`. Reviewed but clean → zeros and `[]`.
- Unit tests for the two helpers. One `*.it.test.ts` case for the list endpoint with
  2 agents × 2 reviews each.
- No new endpoints, no outbound calls, no migration.
