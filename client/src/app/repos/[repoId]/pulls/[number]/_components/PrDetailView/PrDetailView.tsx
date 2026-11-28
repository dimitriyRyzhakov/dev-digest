/* PrDetailView — PR detail screen for /repos/:repoId/pulls/:number:
   header + Run Review, Overview / Findings / Files tabs and the run trace drawer.
   Tab and open trace live in the URL (?tab, ?trace). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePrIdByNumber, usePullDetail } from "@/lib/hooks";
import { usePrReviews, usePrRunsRefresh } from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";
import { PrDetailHeader } from "../PrDetailHeader";
import { OverviewTab } from "../OverviewTab";
import { FindingsTab } from "../FindingsTab";
import { DiffTab } from "../DiffTab";
import RunTraceDrawer from "../RunTraceDrawer";
import { collectFindings, reviewForRun, withSearchParam } from "./helpers";
import { s } from "./styles";

export function PrDetailView({ repoId, number }: { repoId: string; number: number }) {
  const t = useTranslations("prReview.detail");
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { prId, isLoading: pullsLoading } = usePrIdByNumber(repoId, number);
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);
  const { data: reviews } = usePrReviews(prId);
  const refresh = usePrRunsRefresh(prId);
  const isLoading = pullsLoading || (prId != null && detailLoading);

  const tab = search.get("tab") ?? "overview";
  const traceRunId = search.get("trace");
  const setParam = (key: string, val: string | null) =>
    router.replace(`/repos/${repoId}/pulls/${number}${withSearchParam(search.toString(), key, val)}`);
  const setTab = (next: string) => setParam("tab", next);

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = reviews ?? [];
  const findingsCount = collectFindings(runs).length;
  const traceReview = reviewForRun(runs, traceRunId);

  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = [
    { label: repoFullName ?? repoId, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("crumbPulls"), href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true },
  ];

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.skeleton}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  if (isError || !pr) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("loadErrorBody", { number })}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <PrDetailHeader
        pr={pr}
        prId={prId}
        tab={tab}
        findingsCount={findingsCount}
        githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
        onSetTab={setTab}
        onRunStart={() => setTab("findings")}
        onRunsStarted={refresh.activeRuns}
      />

      <div style={s.body}>
        {tab === "overview" && <OverviewTab prId={prId} prBody={pr.body} />}

        {tab === "findings" && (
          <FindingsTab
            prId={prId}
            runs={runs}
            prCommits={pr.commits}
            repoFullName={repoFullName}
            headSha={pr.head_sha}
            onOpenTrace={(id) => setParam("trace", id)}
          />
        )}

        {tab === "diff" && (
          <DiffTab prId={prId} filesCount={pr.files_count} files={pr.files} canComment={pr.status === "open"} />
        )}
      </div>

      {prId && traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr.number}
          findings={traceReview?.findings ?? []}
          agentName={traceReview?.agent_name ?? null}
          onClose={() => setParam("trace", null)}
        />
      )}
    </AppShell>
  );
}
