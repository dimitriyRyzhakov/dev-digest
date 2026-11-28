/* SmartDiffGroup — one Smart Diff role (core, tests, …) on the Files changed
   tab: a collapsible header (marker, label, hint, open-findings counter, file
   count) over its FileCards. Skim-only roles (docs, boilerplate) start collapsed
   with their files closed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { FileCard, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "@/components/finding-card";
import type { PrFile, SmartDiffRole } from "@/lib/types";
import { COLLAPSED_ROLES, ROLE_META } from "./constants";
import { s, chevronFor, markerFor, findingDotFor } from "./styles";

/** Files of the group that have open findings, and the worst open severity. */
export interface GroupFindingSummary {
  files: number;
  severity: Severity;
}

interface SmartDiffGroupProps {
  role: SmartDiffRole;
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** Null / undefined → no open findings in the group, counter hidden. */
  openFindings?: GroupFindingSummary | null;
}

export function SmartDiffGroup({ role, files, commenting, findings, openFindings }: SmartDiffGroupProps) {
  const t = useTranslations("prReview.smartDiff");
  const collapsed = COLLAPSED_ROLES.includes(role);
  const [open, setOpen] = React.useState(!collapsed);
  const meta = ROLE_META[role];
  const bodyId = React.useId();

  return (
    <div style={s.group} data-role={role}>
      <button
        type="button"
        style={s.header}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span aria-hidden style={markerFor(meta.color)} />
        <span style={s.label}>{t(meta.labelKey)}</span>
        <span style={s.hint}>{t(meta.hintKey)}</span>
        {openFindings && openFindings.files > 0 && (
          <span
            className="tnum"
            style={s.findingCount}
            title={t("filesWithFindings", { count: openFindings.files })}
          >
            <span aria-hidden style={findingDotFor(SEV_COLOR[openFindings.severity] ?? SEV_COLOR_FALLBACK)} />
            <span aria-hidden>{openFindings.files}</span>
            <span style={s.srOnly}>{t("filesWithFindings", { count: openFindings.files })}</span>
          </span>
        )}
        <span className="tnum" style={s.count}>
          {t("filesCount", { count: files.length })}
        </span>
      </button>
      {open && files.length > 0 && (
        <div id={bodyId} style={s.body}>
          {files.map((f) => (
            <FileCard
              key={f.path}
              file={f}
              commenting={commenting}
              findings={findings}
              defaultOpen={collapsed ? false : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
