import type { FindingLike } from './format.js';

export interface Summary {
  total: number;
  bySeverity: Record<FindingLike['severity'], number>;
}

/** Count findings per severity. */
export function summarize(findings: FindingLike[]): Summary {
  const bySeverity = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) bySeverity[f.severity] += 1;
  return { total: findings.length, bySeverity };
}
