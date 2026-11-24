"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore } from "@devdigest/ui";
import type { RunSummary, PrCommit } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { formatTokenTotal } from "@/lib/format-cost";
import { buildTimeline, outcomeOf } from "./helpers";
import { s } from "./styles";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Failed runs show their error
 * inline; clicking a run row opens its trace. Badge rules: `outcomeOf` (helpers).
 */
export function RunHistory({
  runs,
  commits = [],
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  if (runs.length === 0 && commits.length === 0) return null;
  return (
    <div style={s.list}>
      {buildTimeline(runs, commits).map((item) =>
        item.kind === "commit" ? (
          <CommitRow key={`commit:${item.commit.sha}`} commit={item.commit} />
        ) : (
          <RunRow
            key={`run:${item.run.run_id}`}
            run={item.run}
            onOpenTrace={onOpenTrace}
            onGoToReview={onGoToReview}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );
}

function CommitRow({ commit: c }: { commit: PrCommit }) {
  return (
    <div style={s.commitRow}>
      <Icon.GitCommit size={15} style={s.commitIcon} />
      <span className="mono" style={s.commitSha}>
        {c.sha.slice(0, 7)}
      </span>
      <span style={s.commitMessage} title={c.message}>
        {c.message.split("\n")[0]}
      </span>
      <span style={s.meta}>{c.author}</span>
      {c.committed_at && <span style={s.meta}>{new Date(c.committed_at).toLocaleTimeString()}</span>}
    </div>
  );
}

function RunRow({
  run: r,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  run: RunSummary;
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  const o = outcomeOf(r);
  const settled = r.status === "done";
  return (
    <div style={s.row}>
      <Badge color={o.color} bg={o.bg} icon={o.icon}>
        {t(`runStatus.${o.key}`)}
      </Badge>
      {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
      <div style={s.runBody}>
        <div style={s.runTitle}>
          <button
            type="button"
            onClick={() => onGoToReview?.(r.run_id)}
            title={t("timeline.goToReview")}
            style={s.agentLink(!!onGoToReview)}
          >
            {r.agent_name ?? t("timeline.agentFallback")}
          </button>{" "}
          <span className="mono" style={s.model}>
            {r.provider}/{r.model}
          </span>
        </div>
        {r.status === "failed" && r.error && (
          <div style={s.error} title={r.error}>
            {r.error}
          </div>
        )}
        {settled && (
          <div style={s.counts}>
            {t("runStatus.findings", { count: r.findings_count ?? 0 })}
            {(r.blockers ?? 0) > 0 ? t("runStatus.blockers", { count: r.blockers ?? 0 }) : ""}
          </div>
        )}
      </div>
      <div style={s.side}>
        {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
        {settled && (
          <span data-testid="run-usage">
            <span className="mono">
              {t("timeline.tokens", { tokens: formatTokenTotal((r.tokens_in ?? 0) + (r.tokens_out ?? 0)) })}
            </span>
            {" · "}
            <RunCostBadge costUsd={r.cost_usd} style={s.cost} />
          </span>
        )}
      </div>
      <button
        type="button"
        title={t("timeline.openTrace")}
        aria-label={t("timeline.openTrace")}
        onClick={() => onOpenTrace(r.run_id)}
        style={s.iconBtn}
      >
        <Icon.FileText size={13} />
      </button>
      {onDelete && r.status !== "running" && (
        <button
          type="button"
          aria-label={t("timeline.deleteRun")}
          title={t("timeline.deleteRun")}
          onClick={() => onDelete(r.run_id)}
          style={s.deleteBtn}
        >
          <Icon.Trash size={13} />
        </button>
      )}
    </div>
  );
}
