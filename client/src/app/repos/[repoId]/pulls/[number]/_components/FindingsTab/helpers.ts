import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/** Findings of kind `lethal_trifecta` across all review runs. */
export function lethalTrifectaFindings(runs: ReviewRecord[]): FindingRecord[] {
  return runs.flatMap((r) => r.findings).filter((f) => f.kind === "lethal_trifecta");
}
