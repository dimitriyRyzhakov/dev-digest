/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored review findings (severity stripe + label,
   cards when shown), comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "@/components/finding-card";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { worstOpenSeverity, type DiffFindingApi } from "../findings";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor, findingStripeFor, severityLabelFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { FindingList } from "../FindingList";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings,
  findingApi,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Review findings anchored to this line (start line on the RIGHT side). */
  findings?: FindingRecord[];
  findingApi?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  const tSmart = useTranslations("prReview.smartDiff");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  // Stripe + label mark open findings even when the cards are hidden.
  const worst = worstOpenSeverity(findings);
  const sevColor = worst ? (SEV_COLOR[worst] ?? SEV_COLOR_FALLBACK) : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...lineRowFor(ln.kind), ...findingStripeFor(sevColor) }}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title={t("diffViewer.addComment")}
              aria-label={t("diffViewer.addComment")}
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {worst && sevColor && (
          <span style={severityLabelFor(sevColor)}>{tSmart(`severityLabel.${worst}`)}</span>
        )}
      </div>

      {findingApi && findingApi.show && findings && findings.length > 0 && (
        <div style={cs.thread}>
          <FindingList findings={findings} api={findingApi} inline />
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
