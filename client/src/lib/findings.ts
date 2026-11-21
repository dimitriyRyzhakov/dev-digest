// Shared severity helpers for every place that summarises findings: the per-run
// FindingsPanel, the PR list FINDINGS column and the Agent-runs timeline.
//
// Runtime value import from the contract FILE, not the barrel: the barrel's
// `./contracts/*.js` re-exports don't resolve under Next's webpack (vitest/tsc
// do resolve them, so tests alone won't catch it). Type-only imports are fine.
import { Severity } from "@devdigest/shared/contracts/findings";

/** The contract's severity levels, in display order (CRITICAL → SUGGESTION).
 *  Deliberately NOT the keys of `SEV` from @devdigest/ui, which also has INFO. */
export const SEVERITY_LEVELS: readonly Severity[] = Severity.options;

const RANK: Record<string, number> = Object.fromEntries(SEVERITY_LEVELS.map((l, i) => [l, i]));

/** Count findings per contract severity level (every level present, 0 when none). */
export function countBySeverity(findings: { severity: string }[]): Record<Severity, number> {
  const counts = Object.fromEntries(SEVERITY_LEVELS.map((l) => [l, 0])) as Record<Severity, number>;
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as Severity] += 1;
  }
  return counts;
}

/** Popover order — severity (CRITICAL → SUGGESTION), then confidence desc, then id.
 *  Same order the server uses for `PrMeta.findings_preview`. */
export function sortForPreview<T extends { id: string; severity: string; confidence: number }>(findings: T[]): T[] {
  return [...findings].sort(
    (a, b) =>
      (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9) ||
      b.confidence - a.confidence ||
      a.id.localeCompare(b.id),
  );
}
