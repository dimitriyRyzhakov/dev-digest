# M1 — Findings summary + hover popover (client)

Data/API half: [server/specs/M1-pr-findings-summary.md](../../server/specs/M1-pr-findings-summary.md).
Related: [M1-severity-filter.md](./M1-severity-filter.md) (same severity rules),
[M1-run-cost-badge.md](./M1-run-cost-badge.md) (COST column next door).

## Goal
Let a reviewer see **what** was found without opening the PR. The severity counts become a
hover target that previews the findings. It is used in two places:

| # | Screen | Where | Counts = | Popover header |
|---|---|---|---|---|
| 1 | PR list `/repos/:repoId/pulls` | new **FINDINGS** column between SCORE and STATUS | sum of the **latest review of each agent** (server-computed) | `6 FINDINGS` |
| 2 | PR detail → Agent runs → Timeline | settled run row, the line under the agent name | that run's findings | `2 FINDINGS IN THIS RUN` |

Mockups: the user supplied two screenshots in chat on 2026-11-21 (PR list with the popover open on
#482, and the timeline with the popover open on the Performance Reviewer run). As in
M1-severity-filter, the screenshots define layout and behaviour. Colours, icons and type come
from the existing UI kit, not the mockups' pixels.

## Scope
**In**
- Shared component `FindingsSummary` (trigger + popover).
- PR list: FINDINGS column wired to `PrMeta.finding_counts` / `findings_preview`.
- Timeline: `RunHistory` swaps the plain "N findings" text for `FindingsSummary`.
- Move the severity helpers out of `FindingsPanel` so all three places share them.

**Out**
- Actions in the popover (accept/dismiss). It is read-only.
- Severity filtering in the PR list.
- Showing findings for running, failed or cancelled runs.
- New hooks or requests on the client. The list uses the list payload; the timeline uses
  `usePrReviews`, which the page already calls.

## Decisions (user, 2026-11-21)
- Scope covers both screens: list + timeline.
- List popover header: **"{count} findings"**. "In this run" is only for the timeline, because a
  list row aggregates several agents' runs.
- **Dismissed findings are counted** and shown, the same as "N findings" in the run header.

Carried over from M1-severity-filter:
- Levels with 0 findings are **hidden** in the trigger.
- Iterate the contract's `Severity.options` (3 levels) and take only `c` / `icon` from `SEV`. Never
  iterate `SEV` keys: it has `INFO`.
- Runtime values come from the contract **file** (`@devdigest/shared/contracts/findings`), not the
  barrel. Type imports from the barrel are fine (see client/INSIGHTS.md).

## Component: `FindingsSummary`
`src/components/findings-summary/` (folder convention: `FindingsSummary.tsx`, `helpers.ts`,
`styles.ts`, `index.ts`, test). It sits in `src/components/` because no popover primitive exists in
`@devdigest/ui` and `src/vendor/ui` is do-not-touch.

```ts
type FindingsSummaryProps = {
  counts: Record<Severity, number> | null; // null = never reviewed
  previews: FindingPreviewLike[];          // already sorted, may be shorter than total
  title: string;                           // translated header, e.g. "6 findings"
  emptyLabel?: string;                     // what to show when total = 0 (list: "0"; timeline: omit)
};
// FindingPreviewLike = Pick<FindingRecord, "id" | "severity" | "category" | "title" | "file"
//                       | "start_line" | "end_line" | "confidence" | "rationale">
// Both `FindingPreview` (list payload) and `FindingRecord` (timeline) satisfy it.
```

**Trigger**
- One inline item per level with `count > 0`: `SEV[l].icon` in `SEV[l].c`, then the count in
  the same colour. Items are separated by a small gap and have a dotted underline (as in the
  screenshots).
- `counts === null` → muted `—` with no popover. Total `0` → `emptyLabel` muted with no popover,
  or nothing when `emptyLabel` is omitted.
- Rendered as a `<button type="button">` with `aria-haspopup="dialog"` and `aria-expanded`. Its
  accessible name is e.g. "2 critical, 2 warning, 2 suggestion", so a screen reader doesn't
  depend on the icons.

**Popover**
- Opens on `mouseenter` and on keyboard `focus` of the trigger. Closes on `mouseleave` of
  trigger+popover (with a ~120 ms grace so the pointer can travel into it), on `blur` outside,
  and on `Esc`. Moving the pointer into the popover keeps it open, so a user can read it.
- Positioned below the trigger, left-aligned, width ~400px, max-height ~360px with internal
  scroll, card styling (`--bg-elevated`, `--border`, radius 10, shadow). `z-index` sits above the
  table rows. It must not be clipped by the list container (`overflow` on parents).
- Header: info icon + `title` uppercase, muted, 11px, letter-spaced.
- Each item:
  1. severity icon in a soft square (`SEV[l].bg` / `SEV[l].c`) + **title** (600) + category icon
     and label muted (`CAT[category]`);
  2. `file:start-end` (or `file:start` when equal) mono in the accent colour, then
     `● NN% conf` with the dot coloured like `ConfidenceNum` (high/mid/low);
  3. rationale, muted, clamped to 2 lines.
- Footer when `total > previews.length`: muted "+{n} more" (`prReview.findingsSummary.more`).
  In the list it is a link to the PR page (`/repos/:repoId/pulls/:number?tab=findings`).
- **Every click inside the trigger or popover calls `stopPropagation()`**, because the whole PR row
  is a click target that navigates. A trigger click toggles the popover; it does not navigate.

## PR list wiring
- `constants.ts`: `COLUMN_KEYS` adds `"findings"` after `"score"`. `GRID` gets a ~96px track at the
  same index; the header and rows share it, so they stay aligned.
- `PRRow.tsx`: new cell `<FindingsSummary counts={pr.finding_counts ?? null}
  previews={pr.findings_preview ?? []} title={t("list.findingsPopover", { count: total })}
  emptyLabel="0" />`.
- i18n (`messages/en/prReview.json`): `list.columns.findings` = "Findings",
  `list.findingsPopover` = "{count, plural, one {# finding} other {# findings}}",
  `list.costTotalTitle` = "Total of finished runs: {usd}", `findingsSummary.more` = "+{count} more",
  `findingsSummary.ariaLabel` = "Findings: {critical} critical, {warning} warning, {suggestion} suggestion".
- Contracts: mirror `FindingCounts`, `FindingPreview` and the two new `PrMeta` fields from
  `server/src/vendor/shared/contracts/platform.ts` into `client/src/vendor/shared`.

## Timeline wiring
- `FindingsTab` already receives `runs: ReviewRecord[]` (each with `run_id` and `findings`).
  Build `findingsByRunId: Map<string, FindingRecord[]>` with `useMemo` and pass it to
  `RunHistory` as a new optional prop.
- In `RunHistory`, for **settled (`done`)** rows: replace the `runStatus.findings` text with
  `<FindingsSummary counts={countBySeverity(list)} previews={sortForPreview(list)}
  title={t("runStatus.findingsInRun", { count: list.length })} />`. The `· M blockers` text stays
  after it.
- No review loaded for a run (deleted review, or still loading) → fall back to the current
  `runStatus.findings` text from `r.findings_count`, so the row never goes blank.
- i18n: `prReview.runStatus.findingsInRun` = "{count, plural, one {# finding} other {# findings}} in this run".

## Shared helpers
Move from `FindingsPanel/helpers.ts` to `src/lib/findings.ts`, and re-import them in FindingsPanel
with no behaviour change:
- `SEVERITY_LEVELS` (= `Severity.options`) and `countBySeverity(findings)`.
- New `sortForPreview(findings)`: by severity (CRITICAL → SUGGESTION), then confidence desc, then
  id. It is the same order the server uses for `findings_preview`.

`applyConfidence` / `visibleFindings` stay in FindingsPanel. They are panel-specific.

## Acceptance criteria
- PR list: the FINDINGS column lines up with its header. Hovering a reviewed row's counts opens a
  popover headed "N findings", where N = the sum of `finding_counts`, listing up to 5 previews
  in severity order, and "+K more" when there are more.
- The counts reflect the latest review of every agent (checked against the server's
  `finding_counts`; the client does not recompute them).
- Levels with 0 are hidden. A never-reviewed PR shows `—`; a reviewed, clean PR shows `0`; neither
  opens a popover.
- Clicking the counts or anything in the popover does **not** navigate to the PR.
  `Esc` closes the popover, and it is reachable with `Tab`.
- Timeline: each finished run shows its own severity counts. The popover is headed "N findings in
  this run" and lists only that run's findings. Running, failed and cancelled rows are unchanged.
- FindingsPanel behaves exactly as before after the helper move (its tests stay green).
- Tests:
  - `FindingsSummary`: zero-hiding, `null` and `0` states, hover/focus/Esc, "+K more", click
    doesn't bubble;
  - `PRRow`: the cell renders and clicking it doesn't call `router.push`;
  - `RunHistory`: popover per run, fallback text with no review;
  - `src/lib/findings.ts`: helper unit tests.
- Load the PR list and a PR page once in the browser after wiring (tests don't catch the
  webpack barrel issue).
