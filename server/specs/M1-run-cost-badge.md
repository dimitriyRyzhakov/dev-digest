# M1 — Run cost badge (server)

UI half: [client/specs/M1-run-cost-badge.md](../../client/specs/M1-run-cost-badge.md).

## Goal
Show the cost and tokens of every review run. The engine already computes a per-run
`costUsd` (`reviewer-core` → `ReviewOutcome.costUsd`: OpenRouter `usage.cost` when present,
otherwise the `PriceBook` estimate = tokens × price). The server currently drops it. This
milestone persists it per run and exposes it on the GET routes the UI reads.

Zero additional model calls: cost comes only from the usage data of the review call itself.

## Scope
**In**
- Persist `cost_usd` on `agent_runs` when a run completes successfully.
- Write `cost_usd` into the run trace stats (`run_traces.trace.stats.cost_usd`).
- Expose `cost_usd` on:
  - `GET /pulls/:id/runs` (`RunSummary[]`): per-run cost.
  - `GET /repos/:repoId/pulls` (`PrMeta[]`): **total spend on the PR**, the sum of `cost_usd`
    over all of its finished runs (`status = 'done'`). That is what reviewing the PR actually
    cost across agents and re-runs. (Updated 2026-11-21: earlier this was the latest finished
    run only.)
  - `GET /runs/:runId/trace` (`RunTrace.stats.cost_usd`).

**Out**
- Backfilling runs created before this migration (they stay `null`).
- Budgets and alerts.
- Partial token/cost accounting for failed or cancelled runs.

## API / data changes
- Migration (generated): `agent_runs.cost_usd double precision NULL`.
  We use `double precision` instead of `numeric` so Drizzle returns a `number`. Display needs
  at most 4 decimals, so float precision is enough.
- `completeAgentRun(..., { costUsd })`: the success path passes `outcome.costUsd`, and the
  failed and cancelled paths pass `null`.
- Contracts (`src/vendor/shared/contracts`, mirrored to client):
  - `RunStats.cost_usd: number | null | undefined` (nullish, so traces stored before M1 still parse).
  - `RunSummary.cost_usd: number | null`.
  - `PrMeta.cost_usd: number | null | undefined`: total of the PR's finished runs (list endpoint
    only, same as `score`). Update the contract comment to say "total", not "latest".
- PR list: one extra query on `agent_runs` filtered to `pr_id IN (...)` and `status='done'`.
  It aggregates per PR, either `SUM(cost_usd) … GROUP BY pr_id` in SQL or a JS sum over the
  same rows. Replaces the old newest-first "first row wins" lookup (`latestRunCostByPr`).

### Null semantics
`cost_usd = null` means "no data": the run is running, failed or cancelled, ran before M1, or
used a model with an unknown price. `0` is real data (a free model). The UI shows `—` for null
and `$0.00` for 0.

For the PR total:
- Runs whose `cost_usd` is `null` are **skipped**; they add nothing. This matches SQL
  `SUM`, which ignores NULL.
- The total is `null` when the PR has no finished run, or none of its finished runs has a cost.
- A mix of priced and unpriced runs yields the sum of the priced ones (a lower bound). This is
  accepted for M1. The UI does not flag it.

## Acceptance criteria
- A run that completes successfully stores a non-null `cost_usd` whenever the engine returns one.
- Failed and cancelled runs store `cost_usd = null`.
- `GET /pulls/:id/runs` returns `cost_usd` for every run.
- `GET /repos/:repoId/pulls` returns the **sum** of `cost_usd` over the PR's `done` runs:
  - two done runs at `0.001` and `0.002` → `0.003`;
  - failed, cancelled and running runs are not counted, even if they somehow have a cost;
  - a done run with `cost_usd = null` is skipped, not treated as an error;
  - no finished run, or none with a cost → `null`.
- Integration test (`*.it.test.ts`) covers the sum, the skipped statuses and the `null` case.
- No new outbound calls.
