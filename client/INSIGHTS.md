# client — insights

Append-only. Written via the `engineering-insights` skill (.claude/skills/engineering-insights). One insight per bullet.
Format: `- YYYY-MM-DD — <context/trigger> → <what to do instead> (evidence: path#symbol | command)`
Never edit or delete entries; correct with a new dated `supersedes …` entry.

## What Works
<!-- approaches and solutions that worked here -->

## What Doesn't Work
<!-- dead ends and antipatterns, with why — the most valuable section -->
- 2026-11-24 — `pnpm build` in client/ while `pnpm dev` runs there (also `scripts/e2e.sh`, which starts a 2nd `next dev` in client/) → the running dev server loses its `.next/` and serves 404 for its own JS/CSS; stop dev first, or build a copy (`rsync -a --exclude node_modules --exclude .next client/ <tmp>/client/` + symlink `node_modules`) (evidence: client/AGENTS.md#Commands)

## Codebase Patterns
<!-- conventions and architecture decisions, with the reason -->
- 2026-11-20 — Building per-severity UI (counters, filters, legends) → iterate `Severity.options` from `@devdigest/shared` (3 levels), take only colours from `SEV`; NEVER iterate `SEV` keys, because `@devdigest/ui` `Severity`/`SEV` also has `INFO`, which the contract lacks, and both packages export the name `Severity`, so alias one on import (evidence: client/src/vendor/ui/primitives/tokens.ts#SEV, client/src/vendor/shared/contracts/findings.ts#Severity)
- 2026-11-24 — A pure route helper (L1) needing a DTO/patch type that a hook defines → put the type in `src/lib/types.ts` (L0, derived from `@devdigest/shared`) and import it from both; NEVER `import type` from `@/lib/hooks/*` — eslint-plugin-boundaries sees all of `src/lib/**` as one element and won't flag it, only self-review does (evidence: client/src/lib/types.ts#AgentPatch)

- 2026-11-24 — Editing an entity (skill, agent) in a modal or side drawer was rejected by the user → follow the Agents screen: grid at `/<entity>`, then `/<entity>/:id` with the list on the left and the editor inline on the right; create/import are routes in the same frame (`/new`, `/import`), never popups (evidence: client/src/app/skills/_components/SkillsWorkspace, client/src/app/agents/[id]/_components/AgentDetailView)

## Tool & Library Notes
<!-- dependency / CLI quirks -->
- 2026-11-24 — eslint-plugin-boundaries v5 ships no rule docs in its README and silently passes a mis-set element map → after editing `client/eslint.config.mjs`, prove each rule fires: `printf 'import { AppShell } from "@/components/app-shell";\n' | pnpm exec eslint --stdin --stdin-filename src/lib/probe.ts` must report `boundaries/element-types` (evidence: client/eslint.config.mjs)
- 2026-11-24 — `pnpm build` prints `Warning: Next.js inferred your workspace root, but it may not be correct` → harmless: repo has one lockfile per package (no workspace) by design; build still exits 0, don't chase it unless output tracing breaks (fix then: `outputFileTracingRoot` in next.config) (evidence: client/next.config.mjs, AGENTS.md#Packages)

## Recurring Errors & Fixes
<!-- error message → fix -->
- 2026-11-24 — Browser console on :3000 `Refused to apply style … layout.css … MIME type ('text/plain')` / `Refused to execute script … main-app.js` → dev server's `.next/` was clobbered by a build; kill the `next dev` (and its `pnpm dev` parent), `rm -rf .next && pnpm dev` (evidence: client/AGENTS.md#Commands)
- 2026-11-20 — Page 500 `Module not found: Can't resolve './contracts/findings.js'` after a runtime (non-type) import from `@devdigest/shared` while vitest + tsc were green → Next's webpack doesn't map the barrel's `.js` re-exports to `.ts`; import values from the contract file (`@devdigest/shared/contracts/findings`), keep barrel imports `import type`, and ALWAYS load the page once, since tests won't catch it (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts#SEVERITY_LEVELS)
- 2026-11-20 — Warning `Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)` in FindingsPanel tests or console → it is pre-existing in `FindingCard` `s.card`, firing whenever `focused` flips (`borderColor` is itself a shorthand); not caused by new toolbar code, so don't chase it there (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts#s.card)

## Session Notes
<!-- ### YYYY-MM-DD + 1–3 bullets: what was done, what was decided -->
### 2026-11-20
- Wrote spec `client/specs/M1-severity-filter.md` (per-run severity counters + single-select filter in `FindingsPanel`). Decided with user: hide levels with 0 findings (screenshot over text); counters count after Hide low confidence.
- Implemented it: `SeverityCounters` component + `countBySeverity`/`applyConfidence`/`visibleFindings(…, severity)` in FindingsPanel helpers; verified in the browser on a seeded PR (filter, switch, clear, no network on click).

## Open Questions
<!-- still unclear; move out once answered -->
