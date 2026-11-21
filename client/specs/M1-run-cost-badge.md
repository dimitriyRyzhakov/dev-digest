# M1 — Run cost badge (client)

Data/API half: [server/specs/M1-run-cost-badge.md](../../server/specs/M1-run-cost-badge.md).

## Goal
Show what each review run cost (USD) and how many tokens it used, wherever runs appear.

## Scope
**In**: four places, all fed by `cost_usd` and `tokens_in`/`tokens_out` from existing queries.
No new endpoints and no new hooks.

| # | Screen | Where | Shows |
|---|---|---|---|
| 1 | PR list `/repos/:repoId/pulls` | new **COST** column between STATUS and UPDATED | `$0.014` (**total of all finished runs** of the PR) |
| 2 | PR detail → Agent runs timeline | run row, right column under the time | `9 119 tok · $0.0013` |
| 3 | Run trace drawer → Stats | 4th tile after DURATION / TOKENS / FINDINGS | **COST** `$0.06` |
| 4 | PR detail → VerdictBanner | title row, next to the findings/agent badges | `$0.014 · 8.2K→1.3K` |

**Out**: cost on the Agents and Eval pages, budgets, and a toggle between estimated and actual
cost.

> Updated 2026-11-21: the PR list now shows the PR's **total** spend (sum of every finished run:
> all agents, all re-runs), not the latest run's cost. One agent's latest run hid what reviewing
> the PR really cost. The server computes the sum (see the server spec); the client only displays it.

## Component: `RunCostBadge`
`src/components/run-cost-badge/` with props
`{ costUsd: number | null | undefined; tokensIn?; tokensOut?; variant: 'compact' | 'full' }`.
- `compact`: cost only (`$0.012`). Used for the PR list and the timeline.
- `full`: cost and tokens (`$0.014 · 8.2K→1.3K`). Used for the VerdictBanner.
- Mono font, muted colour. The `title` holds the exact USD value.

Formatters live in `src/lib/format-cost.ts`:
- `formatUsd(n)`: `null`/`undefined` → `—`; `0` → `$0.00`; `< 0.01` → 4 decimals; `< 1` → 3 decimals; otherwise 2 decimals.
- `formatTokensK(in, out)`: `8.2K→1.3K`.
- `formatTokenTotal(n)`: `9 119` (thousands grouped with a space).

## Rules
- No data → `—`, never `$0.00`. This covers running, failed and cancelled runs, runs from before
  M1, and models with an unknown price.
- The PR list cell shows `pr.cost_usd` as is. It is already the total, so the client does not
  sum it again. Its `title` reads "Total of finished runs: $0.01400" via
  `prReview.list.costTotalTitle` with `{usd}`, so it isn't mistaken for a single run's cost.
  Runs without a cost are skipped in the total; a PR with no priced finished run shows `—`.
- The timeline shows the `tok · $` line only for finished (`done`) runs.
- The VerdictBanner finds its run by `review.run_id` in the already-loaded `pr-runs` list.
- All labels come from next-intl (`prReview.list.columns.cost`, `runs.trace.stat.cost`).

## Acceptance criteria
- Every finished run shows cost in all four places. Runs without data show `—`.
- The PR list COST column lines up with the header (shared `GRID`).
- The PR list COST equals the sum of the `$` values on that PR's finished runs in the timeline.
  Its tooltip says it is a total.
- Unit tests cover the formatter edge cases (null, 0, <0.01, <1, ≥1) and each wired component.
