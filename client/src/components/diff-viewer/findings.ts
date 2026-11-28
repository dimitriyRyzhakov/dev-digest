/* Review findings inside the DiffViewer (L1, pure) — the API shape the viewer
   needs plus helpers that anchor findings to rendered lines. A finding is
   "open" until dismissed; dismissed ones still render (muted) but never count
   for markers (file dot, line stripe, group counter). */
import { Severity as SeverityEnum } from "@devdigest/shared/contracts/findings";
import type { FindingActionKind, FindingRecord, Severity } from "@devdigest/shared";
import { lineKey } from "./comments";

/** What the viewer needs to show review findings and act on them. */
export interface DiffFindingApi {
  /** Findings of the latest review(s), keyed by file path. */
  byPath: Map<string, FindingRecord[]>;
  /** When false, finding cards are hidden (stripe + severity label stay). */
  show: boolean;
  onAction: (f: FindingRecord, action: FindingActionKind) => void;
  /** Id of the finding whose action is in flight, if any. */
  pendingId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}

/** A finding still counts for markers until it is dismissed. */
export function isOpenFinding(f: Pick<FindingRecord, "dismissed_at">): boolean {
  return !f.dismissed_at;
}

/** The key a finding anchors on: its start line on the new (RIGHT) side. */
export function findingKey(f: Pick<FindingRecord, "start_line">): string {
  return lineKey("RIGHT", f.start_line)!;
}

/**
 * Split a file's findings into those whose start line is a rendered RIGHT line
 * (keyed `RIGHT:n`) and the rest (line not in the patch / no patch), which are
 * listed at the end of the file so nothing is silently dropped.
 */
export function partitionFindings(
  findings: readonly FindingRecord[],
  renderedKeys: ReadonlySet<string>,
): { matched: Map<string, FindingRecord[]>; unmatched: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const unmatched: FindingRecord[] = [];
  for (const f of findings) {
    const key = findingKey(f);
    if (renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      unmatched.push(f);
    }
  }
  return { matched, unmatched };
}

/** Highest severity among non-dismissed findings, or null when none is open. */
export function worstOpenSeverity(findings: readonly FindingRecord[] | undefined): Severity | null {
  if (!findings || findings.length === 0) return null;
  const open = new Set(findings.filter(isOpenFinding).map((f) => f.severity));
  // The contract enum is declared worst-first (CRITICAL → SUGGESTION).
  return SeverityEnum.options.find((sev) => open.has(sev)) ?? null;
}
