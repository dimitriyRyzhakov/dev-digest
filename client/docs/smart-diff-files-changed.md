# Files changed tab: Smart Diff and findings (M3)

The PR detail "Files changed" tab shows the diff grouped by reviewer role and renders the latest
review findings under their lines. Server side:
[server/docs/smart-diff.md](../../server/docs/smart-diff.md).

## Pieces

| Piece | Path | Role |
|---|---|---|
| `DiffTab` | [`_components/DiffTab/`](../src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx) | Container: loads data, owns the Smart/Original and Show/Hide state |
| `DiffTab/helpers.ts` | [`helpers.ts`](../src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.ts) | Pure: `orderBySmartDiff`, `latestReviewFindings`, `findingsByPath`, `groupSummary`, `hasReviewRun` |
| `SmartDiffGroup` | [`_components/SmartDiffGroup/`](../src/app/repos/[repoId]/pulls/[number]/_components/SmartDiffGroup/SmartDiffGroup.tsx) | One role group: header, counter, `FileCard` list |
| Hooks | [`lib/hooks/reviews.ts`](../src/lib/hooks/reviews.ts) | `usePrSmartDiff`, `useRefreshOnRunsSettled`, plus the existing `usePrReviews`, `useFindingAction` |
| Diff findings | [`components/diff-viewer/findings.ts`](../src/components/diff-viewer/findings.ts) | `DiffFindingApi`, `partitionFindings`, `worstOpenSeverity` |
| Finding UI | `components/diff-viewer/{FindingList,UnmatchedFindings}/`, `CodeLine` | Cards under a line, unmatched block, severity stripe and label |
| `FindingCard` | [`components/finding-card/`](../src/components/finding-card/FindingCard.tsx) | Shared with `FindingsPanel` (promoted from `_components/`) |

## Data flow

`SmartDiff` (server) decides only the grouping. All finding UI comes from `usePrReviews`, because
cards need the full `FindingRecord`. `DiffTab` builds a `DiffFindingApi` and passes it down
`SmartDiffGroup`/`DiffViewer` → `FileCard` → `CodeLine`, so `components/` never imports `app/`.

## Behaviour

- **Order toggle.** Smart (default) renders five groups in role order, empty ones with 0 files.
  Original renders the flat GitHub-order `DiffViewer`. While Smart Diff loads or fails, the flat
  view is shown.
- **Join.** Files join to groups by path. A file the server does not know goes to `core`; a server
  path missing from the PR files is dropped. Within a group, GitHub order is kept.
- **Collapse.** `docs` and `boilerplate` groups start collapsed with closed `FileCard`s
  (`COLLAPSED_ROLES`); other files open when `additions + deletions <= AUTO_EXPAND_MAX_LINES`.
- **Show/Hide toggle.** One button controls GitHub comments and finding cards together. Without a
  user choice the cards are visible when open findings exist. The count is comments plus open
  findings. Stripe and severity label stay visible when cards are hidden.
- **Dismissed findings.** The card stays, muted; it is excluded from counters, dots and stripes.
- **Counters.** The group counter is the number of files with open findings, not findings.
- **Unmatched findings.** A finding whose line is not in the rendered patch appears in a block at
  the end of its file card.
- **Empty state.** No `kind: 'review'` record → "Review not run yet" in the toolbar.
- **Refresh.** `useRefreshOnRunsSettled` invalidates reviews, runs, intent and Smart Diff when the
  active runs count goes from above 0 to 0, so a review run from this tab updates without reload.
- **Sticky header.** Group headers stick below the PR header using `--pr-header-h`, published by
  `PrDetailHeader/useStickyOffset`.

The finding-selection rule (newest `kind: 'review'` review per agent) is implemented twice: server
`selectDiffFindings` and client `latestReviewFindings`. Keep their tests in step.

E2E flow: [`e2e/specs/08-pr-smart-diff.flow.json`](../../e2e/specs/08-pr-smart-diff.flow.json).
