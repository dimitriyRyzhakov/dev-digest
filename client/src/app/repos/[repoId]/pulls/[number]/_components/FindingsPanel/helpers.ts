import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

// Shared with the PR list + timeline; re-exported so panel code keeps one import site.
export { SEVERITY_LEVELS, countBySeverity } from "../../../../../../../lib/findings";

/** Drop low-confidence findings when "hide low confidence" is on. */
export function applyConfidence(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  return hideLow ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD) : findings;
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
