import type { PrStatus, FindingCounts, FindingPreview } from '@devdigest/shared';

/**
 * PR-list rollup helpers (pure — no DB / `this`, so they unit-test cleanly).
 *
 * The Pull Requests list shows, per PR: the latest review's SCORE, a FINDINGS
 * severity breakdown, and a review STATUS. The DB `status` column holds
 * GitHub's merge state (open/merged/closed); the review status
 * (needs_review / reviewed / stale) is DERIVED here for OPEN PRs from the
 * commit a review last ran against (`lastReviewedSha`) vs the PR head, plus age.
 */

/** Open PRs whose current head was reviewed but untouched this long read "stale". */
export const STALE_DAYS = 7;

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

/** Tally finding severities (CRITICAL / WARNING / SUGGESTION) for one review. */
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}

/**
 * Review-freshness status for the PR list. Merged/closed PRs keep their GitHub
 * merge state; open PRs map to:
 *  - `needs_review` — never reviewed, OR head moved since the last review
 *  - `stale`        — current head was reviewed but the PR is older than STALE_DAYS
 *  - `reviewed`     — current head reviewed and recent
 */
export function deriveReviewStatus(args: {
  /** DB `status` column = GitHub merge state (open/merged/closed). */
  ghStatus: string;
  lastReviewedSha: string | null;
  headSha: string;
  updatedAt: Date | null;
  now: number;
  staleDays?: number;
}): PrStatus {
  const { ghStatus, lastReviewedSha, headSha, updatedAt, now } = args;
  if (ghStatus === 'merged' || ghStatus === 'closed') return ghStatus as PrStatus;
  if (!lastReviewedSha || lastReviewedSha !== headSha) return 'needs_review';
  const staleMs = (args.staleDays ?? STALE_DAYS) * 86_400_000;
  if (updatedAt && now - updatedAt.getTime() > staleMs) return 'stale';
  return 'reviewed';
}

/** Max findings returned per PR for the list's hover popover. */
export const PREVIEW_LIMIT = 5;
/** Rationale is cut to this many chars in previews (an ellipsis is appended). */
export const PREVIEW_RATIONALE_MAX = 200;

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/**
 * "Latest review of each agent" for every PR. `rows` MUST be newest-first; the
 * first review seen per (PR, agent) wins. A review with a null `agentId` (legacy /
 * deleted agent) is its own group, so it is never merged with another one.
 * Returns the kept review ids per PR.
 */
export function latestReviewPerAgent(
  rows: { id: string; prId: string; agentId: string | null }[],
): Map<string, string[]> {
  const seen = new Set<string>();
  const byPr = new Map<string, string[]>();
  for (const r of rows) {
    const key = `${r.prId}:${r.agentId ?? `review:${r.id}`}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ids = byPr.get(r.prId) ?? [];
    ids.push(r.id);
    byPr.set(r.prId, ids);
  }
  return byPr;
}

type PreviewSource = Omit<FindingPreview, 'severity' | 'category'> & { severity: string; category: string };

/**
 * Counts + popover preview for one PR's current findings (dismissed ones
 * included). Unknown severities are neither counted nor previewed. Preview order:
 * severity (CRITICAL → SUGGESTION), then confidence desc, then id.
 */
export function summarizeFindings(rows: PreviewSource[]): {
  counts: FindingCounts;
  preview: FindingPreview[];
} {
  const c = rollupSeverities(rows);
  const known = rows.filter((r) => r.severity in SEVERITY_RANK);
  const preview = [...known]
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity]! - SEVERITY_RANK[b.severity]! ||
        b.confidence - a.confidence ||
        a.id.localeCompare(b.id),
    )
    .slice(0, PREVIEW_LIMIT)
    .map((r) => ({
      ...r,
      rationale:
        r.rationale.length > PREVIEW_RATIONALE_MAX
          ? `${r.rationale.slice(0, PREVIEW_RATIONALE_MAX)}…`
          : r.rationale,
    })) as FindingPreview[];
  return {
    counts: { CRITICAL: c.critical, WARNING: c.warning, SUGGESTION: c.suggestion },
    preview,
  };
}

/**
 * Total spend per PR: the sum of `costUsd` over its finished runs. Runs without
 * a cost are skipped (like SQL SUM ignoring NULL); a PR with no priced run is
 * absent from the map, which the caller reads as `null`.
 */
export function sumRunCosts(rows: { prId: string | null; costUsd: number | null }[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const r of rows) {
    if (!r.prId || r.costUsd == null) continue;
    total.set(r.prId, (total.get(r.prId) ?? 0) + r.costUsd);
  }
  return total;
}
