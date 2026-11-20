# M1 — Severity counters + filter on findings (client)

Client-only. No server half: the data already arrives with `GET /pulls/:id/reviews`.

## Goal
On a PR's **Agent runs** tab, findings are grouped per run, and each run expands into its own list
of cards. Today you scroll and count by eye to learn how many are critical. Per-run counters by
severity show the split at a glance, and clicking a level narrows that run's list to that level.

User flow:
1. Open a PR → **Agent runs** → expand a run → above the findings list see a counters row:
   `3 CRITICAL` `5 WARNING` `2 SUGGESTION`.
2. Click a level → the run's list shows only findings of that level.
3. Click it again → the full list is back.

## Scope
**In**
- A counters row in the toolbar of `FindingsPanel` (left side; Hide low confidence stays on the right).
- A single-select severity filter, per run (each `ReviewRunAccordion` body has its own state).
- i18n labels, a unit test for counting and filtering, and a component test.

**Out**
- Server, API, DB, and contract changes. No new hooks or requests.
- The `N findings · N blocker(s)` header in `ReviewRunAccordion` and `VerdictBanner`. These are separate
  numbers (blockers = CRITICAL not dismissed). Do not touch them.
- `FindingCard`, filtering across runs or for the whole PR, multi-select, persisting the filter
  in the URL or storage, and the `INFO` level.

## Data
- Source: `review.findings` (`FindingRecord[]`) that `ReviewRunAccordion` already passes to
  `FindingsPanel`. They come from `usePrReviews(prId)` → `GET /pulls/:id/reviews`.
- Levels: `Severity.options` from `@devdigest/shared` (`CRITICAL`, `WARNING`, `SUGGESTION`), in that
  order. **Do not** iterate over `SEV` keys from `@devdigest/ui`: the UI type also has `INFO`, which the
  contract does not have. Both packages export a `Severity` name, so alias one on import.
- Import the `Severity` **value** from `@devdigest/shared/contracts/findings`, not from the
  barrel: the barrel's `./contracts/*.js` re-exports don't resolve under Next's webpack.
- Clicking a counter sends no request and does not run a model. Counts are derived with `useMemo`
  from props.
- Accept and dismiss invalidate `["reviews", prId]` (`useFindingAction`). The new `findings` prop
  re-derives the counts, so no page reload is needed.

## Behaviour

### Pipeline (in `FindingsPanel`)
```
findings ──hideLow──▶ base ──count by severity──▶ counters
                       └──severity filter──▶ sort by SEVERITY_ORDER ──▶ shown (cards)
```
- `base` = findings after Hide low confidence (`confidence >= LOW_CONFIDENCE_THRESHOLD`).
- **Counters are computed from `base`.** Each number always equals the number of cards of that level
  the list would show with that level selected. Toggling Hide low can change the numbers.
- `shown` = `base` filtered by the active level (if any), then sorted by `SEVERITY_ORDER`.
  With both filters on, only findings that pass both remain.
- Dismissed or accepted findings stay in the list (existing behaviour) and are counted.

### Counters row
- Each counter is a pill with the label `{count} CRITICAL` / `{count} WARNING` / `{count} SUGGESTION`,
  uppercase, and the count first.
- Colours come from `SEV[level]` in `@devdigest/ui` (`c` for text and border, `bg`/`c` for fill).
  No new palette and no hard-coded colours. `SeverityBadge` is not reused as-is because it renders
  the icon and the English `SEV.label` with the count last. The pill takes only colours from `SEV`,
  and its text comes from i18n.
- **A level with 0 findings in `base` is not rendered.** Exception: the active level stays rendered
  (showing `0`) so the user can still clear it. The row never wraps oddly or leaves gaps when
  levels are missing.
- If `base` is empty and no level is active, the row is not rendered. The empty state shows.
- Each pill is a `<button type="button">` with `aria-pressed`.

### Filter state
- Local state `activeSeverity: Severity | null`, default `null`.
- Click a level that is not active → it becomes active. Only one level can be active, so clicking
  another level moves the selection.
- Click the active level → `null` (filter and highlight cleared, and all pills look the same again).
- Active pill: filled with its `SEV` colour (background), and it stays filled regardless of hover,
  so the state is readable from a screenshot.
- Other pills while a filter is active: muted (reduced opacity). With no filter, all pills look
  the same (outlined in their `SEV` colour).
- Changing the filter (or Hide low) resets `focusIdx` to 0, so `j`/`k`/`a`/`d` never target an
  index outside `shown`.
- When `shown` is empty, the existing `EmptyState` renders (`panel.noMatchTitle` / `panel.noMatchBody`).

## Code changes
All in `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/` unless noted.

| File | Change |
|---|---|
| `helpers.ts` | `visibleFindings(findings, hideLow, severity?: Severity \| null)` adds the severity filter. New pure `countBySeverity(findings): Record<Severity, number>` (all three keys, 0 when missing). Optionally `applyConfidence(findings, hideLow)` shared by both. |
| `FindingsPanel.tsx` | `activeSeverity` state, `base`/`counts`/`shown` memos, counters row in `s.toolbar` (left), `focusIdx` reset. |
| `../SeverityCounters/` (new component folder, per client convention: `SeverityCounters.tsx`, `styles.ts`, `index.ts`) | Presentational: `{ levels, counts, active, onToggle }` → pills. Pill styles (base / active / muted) in its `styles.ts`. No data logic. |
| `styles.ts` | Toolbar layout only, if needed (reuse `s.divider` for a separator). |
| `client/messages/en/prReview.json` | `panel.severityCount.CRITICAL\|WARNING\|SUGGESTION` = `"{count} CRITICAL"` and so on, plus `panel.severityFilterLabel` (`aria-label` of the group, e.g. "Filter by severity"). |
| `FindingsPanel.test.tsx` / `helpers.test.ts` | See Tests. |

Not changed: `FindingsTab`, `ReviewRunAccordion`, `FindingCard`, `usePrReviews`, anything in `server/`.

## Tests
- `helpers.test.ts` (unit):
  - `countBySeverity` returns 0 for missing levels and the correct counts for a mixed list.
  - `visibleFindings` with each level, with `null`, and combined with `hideLow` (intersection).
- `FindingsPanel.test.tsx` (component; same `vi.mock` of `useFindingAction` and the same `renderWithIntl` as today):
  - A fixture of 1 CRITICAL, 3 WARNING (one with confidence < 0.65), and 1 SUGGESTION renders
    `1 CRITICAL`, `3 WARNING`, `1 SUGGESTION`.
  - Click `WARNING` → only the WARNING titles are visible and the pill has `aria-pressed="true"`.
  - Click `CRITICAL` → the selection moves (WARNING `aria-pressed="false"`).
  - Click the active pill again → all 5 cards are back and no pill is pressed.
  - Hide low on → `2 WARNING`, and with WARNING active only 2 cards show.
  - A fixture without CRITICAL renders no CRITICAL pill.
  - A level whose cards are all filtered out → `No findings match` empty state.
- `pnpm test` and `pnpm typecheck` in `client/` are green.

## Acceptance criteria
- An expanded run on Agent runs shows the counters row (`3 CRITICAL · 5 WARNING · 2 SUGGESTION`;
  levels with 0 are hidden).
- The counters match the number of cards of each level in that run's list (after Hide low).
- Clicking a level leaves only that level's findings. Clicking it again (or clearing it) returns
  the full list.
- Only one level is active at a time. The active pill is filled in its `SEV` colour, the others are
  muted, and the state does not depend on hover.
- Severity filter + Hide low = intersection.
- No network request on click (verify in the DevTools Network tab).
- Colours come from `SEV`. Labels come from `prReview.json`.
- After accept or dismiss, the counters still match the list without a reload.
- No match → the existing empty state.
- Tests cover counting and filtering. `pnpm test` and `pnpm typecheck` in `client/` are green.

## Delivery checklist (PR)
- [ ] `client/INSIGHTS.md` has an entry for this session (via the `engineering-insights` skill).
      The PR description says whether the skill triggered on its own or was invoked manually.
- [ ] `CLAUDE.md` and `INSIGHTS.md` from the lab are in the repo.
- [ ] The PR description walks through the five phases: what was in the plan, what was cut,
      and how the result was verified.
- [ ] The PR description has a short reviewer-run report: what the baseline agent found, how the
      result through Claude Code differed, and what the prompt change gave.
