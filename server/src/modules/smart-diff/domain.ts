import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import {
  SMART_DIFF_FALLBACK_ROLE,
  SMART_DIFF_MAX_PATH_CHARS,
  SMART_DIFF_ROLE_ORDER,
  SMART_DIFF_RULES,
} from './constants.js';

/**
 * Smart Diff — pure rules (M3). Deterministic and model-free: a PR file's role is decided by its
 * path alone, so the same PR always groups the same way and needs no review run.
 */

const LEADING_DOT_SLASH = /^(?:\.\/)+/;

/** Role of a changed file by its repo-relative path; first matching rule in `SMART_DIFF_RULES` wins. */
export function classifyFile(path: string): SmartDiffRole {
  // Clip from the start so the basename (what most rules look at) is kept.
  const normalized = path.replace(LEADING_DOT_SLASH, '').slice(-SMART_DIFF_MAX_PATH_CHARS);
  for (const rule of SMART_DIFF_RULES) {
    if (rule.patterns.some((re) => re.test(normalized))) return rule.role;
  }
  return SMART_DIFF_FALLBACK_ROLE;
}

/** A changed file of the PR, as the store reads it. */
export interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

/** A finding reduced to what Smart Diff needs. */
export interface SmartDiffFindingInput {
  file: string;
  startLine: number;
  dismissed: boolean;
}

/** A stored review of the PR with its findings. `createdAt` is an ISO timestamp. */
export interface SmartDiffReviewInput {
  id: string;
  agentId: string | null;
  kind: 'summary' | 'review';
  createdAt: string;
  findings: SmartDiffFindingInput[];
}

/**
 * Findings Smart Diff shows: per agent (`agentId ?? review id`) only the newest `kind: 'review'`
 * review, so a re-run never duplicates findings under one line. Summary reviews are ignored.
 * Dismissed findings are kept here (the caller decides what they count for).
 */
export function selectDiffFindings(reviews: readonly SmartDiffReviewInput[]): SmartDiffFindingInput[] {
  const latest = new Map<string, SmartDiffReviewInput>();
  for (const review of reviews) {
    if (review.kind !== 'review') continue;
    const key = review.agentId ?? review.id;
    const current = latest.get(key);
    if (!current || Date.parse(review.createdAt) > Date.parse(current.createdAt)) latest.set(key, review);
  }
  return [...latest.values()].flatMap((r) => r.findings);
}

/**
 * The Smart Diff of a PR: all five groups in `SMART_DIFF_ROLE_ORDER` (empty ones included), files
 * in input order within a group, `finding_lines` = sorted unique start lines of non-dismissed
 * findings. Splits are not suggested yet (no model call), only the total size is reported.
 */
export function buildSmartDiff(
  files: readonly SmartDiffFileInput[],
  findings: readonly SmartDiffFindingInput[],
): SmartDiff {
  const linesByPath = new Map<string, Set<number>>();
  for (const f of findings) {
    if (f.dismissed) continue;
    let lines = linesByPath.get(f.file);
    if (!lines) linesByPath.set(f.file, (lines = new Set()));
    lines.add(f.startLine);
  }

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>(SMART_DIFF_ROLE_ORDER.map((role) => [role, []]));
  let totalLines = 0;
  for (const file of files) {
    totalLines += file.additions + file.deletions;
    byRole.get(classifyFile(file.path))!.push({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: [...(linesByPath.get(file.path) ?? [])].sort((a, b) => a - b),
    });
  }

  return {
    groups: SMART_DIFF_ROLE_ORDER.map((role) => ({ role, files: byRole.get(role)! })),
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
