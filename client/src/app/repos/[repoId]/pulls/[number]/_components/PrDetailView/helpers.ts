import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/** Every finding across all review runs, in run order. */
export function collectFindings(runs: ReviewRecord[]): FindingRecord[] {
  return runs.flatMap((r) => r.findings);
}

/** The review produced by a run (for the trace drawer), or undefined. */
export function reviewForRun(runs: ReviewRecord[], runId: string | null): ReviewRecord | undefined {
  return runId ? runs.find((r) => r.run_id === runId) : undefined;
}

/**
 * Query string after setting (or, with `null`, removing) one param.
 * Returns "" or "?a=1&b=2" so it can be appended to a path as is.
 */
export function withSearchParam(current: string, key: string, value: string | null): string {
  const sp = new URLSearchParams(current);
  if (value == null) sp.delete(key);
  else sp.set(key, value);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}
