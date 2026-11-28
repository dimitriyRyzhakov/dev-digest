/* DiffTab helpers (L1, pure) — join the server's Smart Diff grouping to the
   PR's files and total them for the header; pick the review findings the diff
   shows and count them for the group / toggle counters. */
import { SmartDiffRole as SmartDiffRoleEnum } from "@devdigest/shared/contracts/brief";
import { Severity as SeverityEnum } from "@devdigest/shared/contracts/findings";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import type { GroupFindingSummary } from "../SmartDiffGroup";
import type { PrFile, SmartDiff, SmartDiffRole } from "@/lib/types";

/** Reviewer reading order — the contract enum is declared in display order. */
export const SMART_DIFF_ROLES: readonly SmartDiffRole[] = SmartDiffRoleEnum.options;

export interface DiffGroup {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Group `files` by the role Smart Diff assigned to their path.
 * - Always returns all five roles in reading order (empty groups kept).
 * - Inside a group, files keep their GitHub order (`files` index), not the server's.
 * - A file Smart Diff doesn't know (or no Smart Diff at all) → `core`, so nothing is hidden.
 * - A Smart Diff path that isn't in `files` is dropped (no patch to render).
 */
export function orderBySmartDiff(files: PrFile[], smart?: SmartDiff | null): DiffGroup[] {
  const roleByPath = new Map<string, SmartDiffRole>();
  for (const group of smart?.groups ?? []) {
    for (const f of group.files) {
      if (!roleByPath.has(f.path)) roleByPath.set(f.path, group.role);
    }
  }
  const byRole = new Map<SmartDiffRole, PrFile[]>(SMART_DIFF_ROLES.map((r) => [r, []]));
  for (const file of files) {
    const role = roleByPath.get(file.path) ?? "core";
    byRole.get(role)?.push(file);
  }
  return SMART_DIFF_ROLES.map((role) => ({ role, files: byRole.get(role) ?? [] }));
}

/**
 * Findings shown in the diff: per agent (`agent_id ?? review.id`) only the newest
 * `kind: 'review'` review counts, so a re-run never duplicates findings under one
 * line; summary reviews are ignored. Dismissed findings are kept (rendered muted).
 * Mirrors server `modules/smart-diff/domain.ts#selectDiffFindings`.
 */
export function latestReviewFindings(reviews: readonly ReviewRecord[] | null | undefined): FindingRecord[] {
  const latest = new Map<string, ReviewRecord>();
  for (const review of reviews ?? []) {
    if (review.kind !== "review") continue;
    const key = review.agent_id ?? review.id;
    const current = latest.get(key);
    if (!current || Date.parse(review.created_at) > Date.parse(current.created_at)) latest.set(key, review);
  }
  return [...latest.values()].flatMap((r) => r.findings);
}

/**
 * Whether any review run produced a `kind: 'review'` record (summaries don't
 * count). `undefined` while reviews are still loading, so the tab doesn't
 * flash "Review not run yet" before the data arrives.
 */
export function hasReviewRun(reviews: readonly ReviewRecord[] | null | undefined): boolean | undefined {
  if (!reviews) return undefined;
  return reviews.some((r) => r.kind === "review");
}

/** Findings keyed by file path (input order kept within a file). */
export function findingsByPath(findings: readonly FindingRecord[]): Map<string, FindingRecord[]> {
  const byPath = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const list = byPath.get(f.file) ?? [];
    list.push(f);
    byPath.set(f.file, list);
  }
  return byPath;
}

/** A finding counts for markers and counters until it is dismissed. */
function isOpen(f: FindingRecord): boolean {
  return !f.dismissed_at;
}

/** Number of non-dismissed findings. */
export function countOpenFindings(findings: readonly FindingRecord[]): number {
  return findings.filter(isOpen).length;
}

/** How many of `paths` have at least one non-dismissed finding (files, not findings). */
export function filesWithOpenFindings(
  paths: readonly string[],
  byPath: ReadonlyMap<string, readonly FindingRecord[]>,
): number {
  return paths.filter((p) => (byPath.get(p) ?? []).some(isOpen)).length;
}

/** Group header counter; `null` when no file in the group has an open finding. */
export function groupSummary(
  files: readonly PrFile[],
  byPath: ReadonlyMap<string, readonly FindingRecord[]>,
): GroupFindingSummary | null {
  const paths = files.map((f) => f.path);
  const open = new Set(paths.flatMap((p) => (byPath.get(p) ?? []).filter(isOpen).map((f) => f.severity)));
  // The contract enum is declared worst-first (CRITICAL → SUGGESTION).
  const severity = SeverityEnum.options.find((sev) => open.has(sev));
  return severity ? { files: filesWithOpenFindings(paths, byPath), severity } : null;
}

export interface DiffTotals {
  files: number;
  additions: number;
  deletions: number;
}

/** File count and summed +/− lines of a file list. */
export function diffTotals(files: PrFile[]): DiffTotals {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    additions += f.additions ?? 0;
    deletions += f.deletions ?? 0;
  }
  return { files: files.length, additions, deletions };
}
