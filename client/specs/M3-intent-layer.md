# M3 — Intent layer (client)

Server half: [server/specs/M3-intent-layer.md](../../server/specs/M3-intent-layer.md).

## Goal
Show the PR intent the server derived before review: an **Intent card** in the PR Overview, an
intent block and a config row in the run trace drawer, and the new default model in Settings.

User flows:
1. **PR page → Overview.** Above the description an **Intent** card (layout per Amendment A1.2,
   design `.claude/work/m3-intent-layer/design-intent-card.png`):
   - header: target icon + `INTENT` (muted caps);
   - at low confidence a hint banner ABOVE the summary ("Derived from indirect signals only —
     treat as a hint");
   - the summary as an italic quoted sentence;
   - two columns: `✓ IN SCOPE` (green) and `✕ OUT OF SCOPE` (muted), `·` bullets; an empty
     column shows a muted "—";
   - divider, then `⚠ RISK AREAS` chips with a per-kind icon (auth → shield, dependency → boxes,
     performance → zap, migration/data → database, config → settings, security → octagon,
     api → globe, other → dot); section hidden when empty;
   - footer (muted, after a divider): confidence badge `level · 0.62`, **Breaking** badge when
     true, source chips (`description`, `#471`, `specs/M3-x.md`, …), unresolved refs as plain
     muted text (reason in the tooltip, never links), `model · $cost` right-aligned;
   - no intent yet → the card with its header + "Intent is derived when a review runs".
   - The Blast Radius column in the design is M4 — no placeholder.
2. **Run a review.** When the runs settle (`FindingsTab` refresh), the card refetches
   (`usePrRunsRefresh().intent()`), so the new intent shows without a reload.
3. **Run trace drawer.**
   - A prompt block "PR intent — derived (dynamic)" from `prompt_assembly.intent`, coloured
     `PROMPT_COLORS.intent`; hidden when absent.
   - Configuration row **Intent** = `feat · medium · cached` (or `· fresh`); hidden when absent.
   - The "Specs read" row lists the spec paths read.
4. **Settings → Models.** "PR Review · Intent" defaults to `openrouter` /
   `deepseek/deepseek-v4-flash`, with the new description.

## Scope
**In**
- `IntentCard/` folder under `app/repos/[repoId]/pulls/[number]/_components/`.
- `OverviewTab` gets a `prId` prop and calls `usePrIntent`; `PrDetailView` passes it.
- Hooks in `src/lib/hooks/reviews.ts`: `reviewKeys.intent(prId)`, `usePrIntent(prId)`,
  `usePrRunsRefresh().intent()`.
- Trace drawer: `PROMPT_COLORS.intent`, a `PromptBlock`, a Configuration `Row`.
- i18n keys `prReview.detail.intent.*` and `runs` trace keys.
- Contract copy of `brief.ts`, `review-api.ts`, `trace.ts`, `platform.ts`, `adapters.ts`;
  `src/lib/feature-models.ts` default.

**Out**
- Recomputing intent from the UI; editing intent.

## API / data changes
None of its own. Consumes `GET /pulls/:id/intent` → `PrIntentResponse`, and the new nullish trace
fields `prompt_assembly.intent` and `intent`.

## Acceptance criteria
- Card states render: none, low (with hint banner), medium, high, breaking, unresolved refs
  (muted text, not links).
- No `{count && …}` rendering; empty lists are hidden.
- A trace with intent shows the block and the row; a legacy trace renders unchanged.
- No query key array spelled outside `reviewKeys`.
- Settings → Models shows the new default.
- Tests: `IntentCard.test.tsx`, `IntentCard/helpers.test.ts`, `RunTraceDrawer.test.tsx`, hook test
  for `usePrRunsRefresh().intent`.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` are green; the PR page has been loaded once in the
  browser.
