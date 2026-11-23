// Runtime value import from the contract FILE, not the barrel: the barrel's
// `./contracts/*.js` re-exports don't resolve under Next's webpack (vitest/tsc
// do resolve them, so tests alone won't catch it). Type-only imports are fine.
import { Severity } from "@devdigest/shared/contracts/findings";
import type { FindingRecord } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** The contract's severity levels, in display order (CRITICAL → SUGGESTION).
 *  Deliberately NOT the keys of `SEV` from @devdigest/ui, which also has INFO. */
export const SEVERITY_LEVELS: readonly Severity[] = Severity.options;

/** Drop low-confidence findings when "hide low confidence" is on. */
export function applyConfidence(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  return hideLow ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD) : findings;
}

/** Count findings per contract severity level (every level present, 0 when none). */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts = Object.fromEntries(SEVERITY_LEVELS.map((l) => [l, 0])) as Record<Severity, number>;
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

/** Optionally drop low-confidence findings, keep only one severity level, and sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = applyConfidence(findings, hideLow);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}
