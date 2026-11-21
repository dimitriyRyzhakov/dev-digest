# client — insights

Append-only. Written via the `engineering-insights` skill (.claude/skills/engineering-insights). One insight per bullet.
Format: `- YYYY-MM-DD — <context/trigger> → <what to do instead> (evidence: path:line#symbol | command)` — `:line` jumps you there; `#symbol` re-finds it if lines drift.
Never edit or delete entries; correct with a new dated `supersedes …` entry.

## What Works
<!-- approaches and solutions that worked here -->

## What Doesn't Work
<!-- dead ends and antipatterns, with why — the most valuable section -->

## Codebase Patterns
<!-- conventions and architecture decisions, with the reason -->
- 2026-11-20 — Building per-severity UI (counters, filters, legends) → iterate `Severity.options` from `@devdigest/shared` (3 levels), take only colours from `SEV`; NEVER iterate `SEV` keys, because `@devdigest/ui` `Severity`/`SEV` also has `INFO`, which the contract lacks, and both packages export the name `Severity`, so alias one on import (evidence: client/src/vendor/ui/primitives/tokens.ts:6#SEV, client/src/vendor/shared/contracts/findings.ts:11#Severity)
- 2026-11-21 — Popover/tooltip inside a PR list row → portal it to `document.body` with `position: fixed` (the list's `s.tableCard` has `overflow: hidden` and clips absolute children), and ALWAYS `stopPropagation` on clicks inside the portal too: React synthetic events bubble along the React tree, so a portalled click still reaches `PRRow`'s `onClick` and navigates (evidence: client/src/components/findings-summary/FindingsSummary.tsx:107#stop, client/src/app/repos/[repoId]/pulls/styles.ts:92#tableCard)

## Tool & Library Notes
<!-- dependency / CLI quirks -->

## Recurring Errors & Fixes
<!-- error message → fix -->
- 2026-11-20 — Page 500 `Module not found: Can't resolve './contracts/findings.js'` after a runtime (non-type) import from `@devdigest/shared` while vitest + tsc were green → Next's webpack doesn't map the barrel's `.js` re-exports to `.ts`; import values from the contract file (`@devdigest/shared/contracts/findings`), keep barrel imports `import type`, and ALWAYS load the page once, since tests won't catch it (evidence: client/src/lib/findings.ts:7#Severity import — moved here from FindingsPanel/helpers.ts on 2026-11-21)
- 2026-11-20 — Warning `Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)` in FindingsPanel tests or console → it is pre-existing in `FindingCard` `s.card`, firing whenever `focused` flips (`borderColor` is itself a shorthand); not caused by new toolbar code, so don't chase it there (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:5#s.card)

## Session Notes
<!-- ### YYYY-MM-DD + 1–3 bullets: what was done, what was decided -->
### 2026-11-20
- Wrote spec `client/specs/M1-severity-filter.md` (per-run severity counters + single-select filter in `FindingsPanel`). Decided with user: hide levels with 0 findings (screenshot over text); counters count after Hide low confidence.
- Implemented it: `SeverityCounters` component + `countBySeverity`/`applyConfidence`/`visibleFindings(…, severity)` in FindingsPanel helpers; verified in the browser on a seeded PR (filter, switch, clear, no network on click).

## Open Questions
<!-- still unclear; move out once answered -->
