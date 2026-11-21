/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsSummary } from "@/components/findings-summary";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed
  // Latest review of EACH agent, summed on the server (null = never reviewed).
  const counts = pr.finding_counts ?? null;
  const findingsTotal = counts ? counts.CRITICAL + counts.WARNING + counts.SUGGESTION : 0;
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div style={s.findingsCell}>
        <FindingsSummary
          counts={counts}
          previews={pr.findings_preview ?? []}
          title={t("list.findingsPopover", { count: findingsTotal })}
          emptyLabel="0"
          moreHref={`/repos/${repoId}/pulls/${pr.number}?tab=findings`}
        />
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.costCell}>
        <RunCostBadge
          costUsd={pr.cost_usd}
          // The list value is the PR's TOTAL (all finished runs), not one run's cost.
          title={pr.cost_usd == null ? undefined : t("list.costTotalTitle", { usd: `$${+pr.cost_usd.toFixed(6)}` })}
          style={{ fontSize: 13, color: "var(--text-secondary)" }}
        />
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
