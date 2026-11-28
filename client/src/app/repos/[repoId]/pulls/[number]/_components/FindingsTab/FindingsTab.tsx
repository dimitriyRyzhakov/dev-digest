/* FindingsTab — live runs, PR timeline (runs + commits) and the per-run review
   accordions. Container: owns the run data hooks, so the page only passes the
   PR identity and the already-loaded reviews. */
"use client";

import React, { useCallback } from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import type { ReviewRecord, PrCommit } from "@devdigest/shared";
import { useCancelRun, useDeleteRun, usePrActiveRuns, usePrRuns, usePrRunsRefresh } from "@/lib/hooks/reviews";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import { lethalTrifectaFindings } from "./helpers";
import { s } from "./styles";

interface FindingsTabProps {
  prId: string | null;
  /** Reviews of this PR, newest first (one per run). */
  runs: ReviewRecord[];
  prCommits: PrCommit[];
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (id: string) => void;
}

export function FindingsTab({ prId, runs, prCommits, repoFullName, headSha, onOpenTrace }: FindingsTabProps) {
  const t = useTranslations("prReview.findingsTab");
  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears via polling when runs finish.
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const cancel = useCancelRun();
  const deleteRun = useDeleteRun(prId);
  const refresh = usePrRunsRefresh(prId);

  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;
  const lethalTrifecta = lethalTrifectaFindings(runs);

  const handleCancelAll = () => liveRunIds.forEach((id) => cancel.mutate(id));
  const handleOpenFirstTrace = () => {
    if (liveRunIds[0]) onOpenTrace(liveRunIds[0]);
  };
  const handleDelete = (id: string) => {
    if (window.confirm(t("deleteRunConfirm"))) deleteRun.mutate(id);
  };
  // When a run settles (done OR failed) refresh active runs, run history and
  // reviews, so a just-failed run shows up in the timeline without a reload.
  // The run's pre-step may also have (re)derived the PR intent (M3).
  const handleRunDone = useCallback(() => {
    refresh.activeRuns();
    refresh.history();
    refresh.reviews();
    refresh.intent();
  }, [refresh]);

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // opens + scrolls to that run's accordion below. The nonce re-triggers the
  // scroll even when the same run is clicked twice.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const handleGoToReview = useCallback((runId: string) => {
    setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));
  }, []);

  return (
    <section>
      {liveRunIds.length > 0 && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button
                  kind="danger"
                  size="sm"
                  icon="X"
                  loading={cancel.isPending}
                  onClick={handleCancelAll}
                >
                  {t("cancel")}
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={handleOpenFirstTrace}>
                  {t("openTrace")}
                </Button>
              </div>
            }
          >
            {t("liveReview")}
          </SectionLabel>
          <RunStatus runIds={liveRunIds} onDone={handleRunDone} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={{ color: "var(--accent)", animation: "ddspin 1s linear infinite" }} />
          <span style={s.reviewInProgressText}>{t("inProgress")}</span>
          <span style={s.reviewInProgressSub}>{t("inProgressSub")}</span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={{ color: "var(--crit)" }} />
          <span style={s.lethalTrifectaTitle}>{t("trifectaDetected")}</span>
          <Badge color="var(--crit)" bg="transparent">
            {t("trifectaCount", { count: lethalTrifecta.length })}
          </Badge>
        </div>
      )}

      {((prRuns && prRuns.length > 0) || prCommits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel
            icon="Activity"
            right={<span style={s.sectionHint}>{t("timelineHint")}</span>}
          >
            {t("timeline")}
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            commits={prCommits}
            onOpenTrace={onOpenTrace}
            onGoToReview={handleGoToReview}
            onDelete={handleDelete}
          />
        </div>
      )}

      <SectionLabel
        icon="AlertOctagon"
        right={<span style={s.sectionHint}>{t("reviewRunsHint")}</span>}
      >
        {t("reviewRuns")}
      </SectionLabel>
      {runs.length === 0 ? (
        reviewRunning || liveRunIds.length > 0 ? null : (
          <EmptyState
            icon="Sparkles"
            title={t("emptyTitle")}
            body={t("emptyBody")}
          />
        )
      ) : (
        prId &&
        runs.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            prId={prId}
            defaultOpen={i === 0}
            repoFullName={repoFullName}
            headSha={headSha}
            targetRunId={target?.runId ?? null}
            targetNonce={target?.n ?? 0}
            run={prRuns?.find((r) => r.run_id === review.run_id) ?? null}
          />
        ))
      )}
    </section>
  );
}
