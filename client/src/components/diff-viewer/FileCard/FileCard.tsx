/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count, open-findings dot) and, when open, its parsed lines with anchored
   findings/comments, plus findings and comments that can't be anchored. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "@/components/finding-card";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  lineKey,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { partitionFindings, worstOpenSeverity, type DiffFindingApi } from "../findings";
import { s, chevronFor, findingDotFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { UnmatchedFindings } from "../UnmatchedFindings";

const NO_FINDINGS: FindingRecord[] = [];

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Findings anchored to a parsed line — only its new-side (RIGHT) number. */
function findingsForLine(ln: Line, matched: Map<string, FindingRecord[]>): FindingRecord[] | undefined {
  if (matched.size === 0 || (ln.kind !== "add" && ln.kind !== "ctx")) return undefined;
  const key = lineKey("RIGHT", ln.newNo);
  return key ? matched.get(key) : undefined;
}

export function FileCard({
  file,
  commenting,
  findings,
  defaultOpen,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** Initial open state; undefined → open when the file changes ≤ AUTO_EXPAND_MAX_LINES lines. */
  defaultOpen?: boolean;
}) {
  const t = useTranslations("shell");
  const tSmart = useTranslations("prReview.smartDiff");
  const [open, setOpen] = React.useState(
    defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  // Same split for review findings: under their line, or in the unmatched block.
  const fileFindings = findings?.byPath.get(file.path) ?? NO_FINDINGS;
  const { matched: findingsByLine, unmatched } = React.useMemo(
    () => partitionFindings(fileFindings, renderedKeys),
    [fileFindings, renderedKeys],
  );
  const worst = worstOpenSeverity(fileFindings);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {worst && (
          <span
            role="img"
            aria-label={tSmart("fileHasFindings")}
            title={tSmart("fileHasFindings")}
            style={findingDotFor(SEV_COLOR[worst] ?? SEV_COLOR_FALLBACK)}
          />
        )}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={findingsForLine(ln, findingsByLine)}
                findingApi={findings}
              />
            ))
          )}
          {findings && findings.show && <UnmatchedFindings findings={unmatched} api={findings} />}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
