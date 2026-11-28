"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import {
  DiffViewer,
  type DiffCommentApi,
  type DiffFindingApi,
} from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrSmartDiff,
  usePrReviews,
  useFindingAction,
  useRefreshOnRunsSettled,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { SmartDiffGroup } from "../SmartDiffGroup";
import { DIFF_ORDERS, DIFF_ORDER_LABEL_KEY, type DiffOrder } from "./constants";
import {
  countOpenFindings,
  diffTotals,
  findingsByPath,
  groupSummary,
  hasReviewRun,
  latestReviewFindings,
  orderBySmartDiff,
} from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function DiffTab({ prId, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview.smartDiff");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const smartDiff = usePrSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const findingAction = useFindingAction();
  // A review finishing while this tab is open refreshes cards, counters and groups.
  useRefreshOnRunsSettled(prId);
  const reviewRun = hasReviewRun(reviews);
  // null = user hasn't toggled: cards show by default when open findings exist,
  // GitHub comments ride along with the same toggle.
  const [showOverride, setShowOverride] = React.useState<boolean | null>(null);
  const [order, setOrder] = React.useState<DiffOrder>("smart");

  const diffFindings = React.useMemo(() => latestReviewFindings(reviews), [reviews]);
  const byPath = React.useMemo(() => findingsByPath(diffFindings), [diffFindings]);
  const openFindingCount = countOpenFindings(diffFindings);
  const show = showOverride ?? openFindingCount > 0;

  const commentCount = comments?.length ?? 0;
  const toggleCount = commentCount + openFindingCount;
  const totals = diffTotals(files);
  // Smart Diff loading / failed → the flat GitHub-order list, so the tab always works.
  const groups = order === "smart" && smartDiff.data ? orderBySmartDiff(files, smartDiff.data) : null;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments: show,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowOverride(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("commentPostFailed"));
        throw err;
      }
    },
  };

  const findingApi: DiffFindingApi = {
    byPath,
    show,
    pendingId: findingAction.isPending ? (findingAction.variables?.findingId ?? null) : null,
    onAction: (f, action) => findingAction.mutate({ findingId: f.id, action, prId: prId ?? undefined }),
    repoFullName,
    headSha,
  };

  return (
    <section>
      <SectionLabel icon="Code">{order === "smart" ? t("title") : t("filesChanged")}</SectionLabel>
      <div style={s.toolbar}>
        <span className="mono tnum" style={s.totals}>
          {t("totals", { files: totals.files, additions: totals.additions, deletions: totals.deletions })}
        </span>
        {reviewRun === false && <span style={s.notRun}>{t("reviewNotRun")}</span>}
        <div style={s.actions}>
          {toggleCount > 0 && (
            <Button kind="ghost" size="sm" icon={show ? "EyeOff" : "Eye"} onClick={() => setShowOverride(!show)}>
              {t(show ? "hideComments" : "showComments", { count: toggleCount })}
            </Button>
          )}
          <div role="group" aria-label={t("orderLabel")} style={s.orderGroup}>
            {DIFF_ORDERS.map((o) => (
              <Button
                key={o}
                kind="tertiary"
                size="sm"
                active={order === o}
                aria-pressed={order === o}
                onClick={() => setOrder(o)}
              >
                {t(DIFF_ORDER_LABEL_KEY[o])}
              </Button>
            ))}
          </div>
        </div>
      </div>
      {groups ? (
        <div style={s.groups}>
          {groups.map((g) => (
            <SmartDiffGroup
              key={g.role}
              role={g.role}
              files={g.files}
              commenting={commenting}
              findings={findingApi}
              openFindings={groupSummary(g.files, byPath)}
            />
          ))}
        </div>
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findingApi} />
      )}
    </section>
  );
}
