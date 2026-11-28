/* UnmatchedFindings — footer block for findings whose start line is not a
   rendered RIGHT line of this file (outside the patch, or no patch at all). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { cs } from "../comments";
import type { DiffFindingApi } from "../findings";
import { FindingList } from "../FindingList";

export function UnmatchedFindings({ findings, api }: { findings: FindingRecord[]; api: DiffFindingApi }) {
  const t = useTranslations("prReview.smartDiff");
  if (findings.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{t("unmatchedTitle", { count: findings.length })}</span>
      <FindingList findings={findings} api={api} />
    </div>
  );
}
