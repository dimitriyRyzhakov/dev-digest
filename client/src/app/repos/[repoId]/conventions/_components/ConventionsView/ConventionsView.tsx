/* ConventionsView — /repos/:repoId/conventions. Run / re-run the extractor,
   curate the grounded candidates (accept, reject, edit the rule), and merge the
   accepted ones into one skill through CreateConventionSkillModal. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { githubBlobUrl } from "@/lib/github-urls";
import { useConventions, useExtractConventions, usePatchConvention } from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import type { ConventionCandidate, ConventionPatch } from "@/lib/types";
import { acceptedOnly } from "../../helpers";
import { ConventionCard } from "../ConventionCard";
import { ConventionsToolbar } from "../ConventionsToolbar";
import { CreateConventionSkillModal } from "../CreateConventionSkillModal";
import { SKELETON_CARDS } from "./constants";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions.page");
  const tm = useTranslations("conventions.modal");
  const tc = useTranslations("conventions.card");
  const format = useFormatter();
  const toast = useToast();
  const { repos, activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const repo = repos.find((r) => r.id === repoId) ?? (activeRepo?.id === repoId ? activeRepo : null);
  const repoName = repo?.name ?? t("repoFallback");

  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const patch = usePatchConvention(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);

  const candidates = data?.candidates ?? [];
  const accepted = acceptedOnly(candidates);

  const runExtraction = () =>
    extract.mutate(undefined, {
      onSuccess: (res) =>
        toast.success(t("extractionDone", { found: res.candidates.length, dropped: res.dropped })),
      onError: (err) =>
        toast.error(err instanceof ApiError ? `${t("extractionFailed")}: ${err.message}` : t("extractionFailed")),
    });

  const patchOne = (id: string, body: ConventionPatch) =>
    patch.mutate({ id, patch: body }, { onError: () => toast.error(t("patchFailed")) });

  const deselectAll = () => accepted.forEach((c) => patchOne(c.id, { status: "pending" }));

  const copySnippet = (snippet: string) => {
    if (!navigator.clipboard) {
      toast.error(tc("copyFailed"));
      return;
    }
    navigator.clipboard.writeText(snippet).then(
      () => toast.info(tc("copied")),
      () => toast.error(tc("copyFailed")),
    );
  };

  const evidenceHref = (c: ConventionCandidate) =>
    repo
      ? githubBlobUrl(
          repo.full_name,
          repo.default_branch,
          c.evidence_path,
          c.evidence_start_line ?? undefined,
          c.evidence_end_line ?? undefined,
        )
      : null;

  const crumb = [{ label: t("crumbLab") }, { label: t("crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const subtitle =
    candidates.length > 0
      ? [
          t("candidateCount", { count: candidates.length }),
          data?.sample_files != null ? t("detectedFrom", { count: data.sample_files }) : null,
          data?.last_scan_at ? t("lastScan", { when: format.relativeTime(new Date(data.last_scan_at)) }) : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : t("subtitle");

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <header style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.title}>
              {t("headingPrefix")}
              <span className="mono" style={s.repo}>
                {repoName}
              </span>
            </h1>
            <p style={s.subtitle}>{subtitle}</p>
          </div>
          {candidates.length > 0 && (
            <Button icon="RefreshCw" onClick={runExtraction} loading={extract.isPending}>
              {extract.isPending ? t("scanning") : t("rescan")}
            </Button>
          )}
        </header>

        {isLoading ? (
          <div style={s.list}>
            {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
              <Skeleton key={i} height={150} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title={t("loadError")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("empty.title")}
            body={t("empty.body")}
            cta={extract.isPending ? t("scanning") : t("empty.cta")}
            onCta={runExtraction}
            ctaLoading={extract.isPending}
          />
        ) : (
          <>
            <ConventionsToolbar
              accepted={accepted.length}
              total={candidates.length}
              onDeselectAll={deselectAll}
              onCreateSkill={() => setModalOpen(true)}
            />
            <div style={s.list}>
              {candidates.map((c) => (
                <ConventionCard
                  key={c.id}
                  candidate={c}
                  evidenceHref={evidenceHref(c)}
                  onPatch={(body) => patchOne(c.id, body)}
                  onCopy={copySnippet}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <CreateConventionSkillModal
          repoId={repoId}
          repoName={repoName}
          accepted={accepted}
          onClose={() => setModalOpen(false)}
          onSaved={(skill) => {
            setModalOpen(false);
            toast.success(tm("saved", { name: skill.name, version: skill.version }));
          }}
        />
      )}
    </AppShell>
  );
}

export default ConventionsView;
