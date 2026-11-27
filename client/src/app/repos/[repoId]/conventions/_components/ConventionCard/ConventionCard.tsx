/* ConventionCard — one extracted candidate: the rule (click to edit inline),
   its evidence (file:lines → GitHub, copyable snippet), confidence, and the
   Accept / Reject toggles. Emits changes; the view owns the mutation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, IconBtn, MonoLink } from "@devdigest/ui";
import type { ConventionCandidate, ConventionPatch } from "@/lib/types";
import { confidenceTone, evidenceLocation } from "../../helpers";
import { RULE_EDIT_ROWS, STATUS_BADGE } from "./constants";
import { nextStatus, normalizeRuleEdit, splitInlineCode } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  evidenceHref,
  onPatch,
  onCopy,
}: {
  candidate: ConventionCandidate;
  /** GitHub blob URL of the evidence (null when the repo is unknown). */
  evidenceHref: string | null;
  onPatch: (patch: ConventionPatch) => void;
  onCopy?: (snippet: string) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(candidate.rule);

  const accepted = candidate.status === "accepted";
  const rejected = candidate.status === "rejected";
  const pending = !accepted && !rejected;
  const pct = Math.round(candidate.confidence * 100);

  const startEdit = () => {
    setDraft(candidate.rule);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const rule = normalizeRuleEdit(draft, candidate.rule);
    if (rule !== null) onPatch({ rule });
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
      setDraft(candidate.rule);
    }
  };

  return (
    <article style={s.card(accepted, rejected)} aria-label={candidate.rule}>
      <div style={s.main}>
        {editing ? (
          <textarea
            aria-label={t("card.editLabel")}
            autoFocus
            value={draft}
            rows={RULE_EDIT_ROWS}
            // Select the whole rule on open: typing replaces it, a click places the caret.
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            style={s.ruleInput}
          />
        ) : (
          <button type="button" onClick={startEdit} title={t("card.editHint")} style={s.rule}>
            {splitInlineCode(candidate.rule).map((seg, i) =>
              seg.code ? (
                <code key={i} style={s.ruleCode}>
                  {seg.text}
                </code>
              ) : (
                <React.Fragment key={i}>{seg.text}</React.Fragment>
              ),
            )}
          </button>
        )}

        {(candidate.category || !pending) && (
          <div style={s.tags}>
            {candidate.category && <Badge>{candidate.category}</Badge>}
            {!pending && (
              <Badge icon={STATUS_BADGE[candidate.status].icon} color={STATUS_BADGE[candidate.status].color} bg={STATUS_BADGE[candidate.status].bg}>
                {accepted ? t("card.accepted") : t("card.rejected")}
              </Badge>
            )}
          </div>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHead}>
            {/* Long paths are cut at the START so the file name and lines stay visible. */}
            <span style={s.locationWrap} title={evidenceLocation(candidate)}>
              {evidenceHref ? (
                <MonoLink href={evidenceHref}>
                  <bdi dir="ltr">{evidenceLocation(candidate)}</bdi>
                </MonoLink>
              ) : (
                <span className="mono" style={s.location}>
                  <bdi dir="ltr">{evidenceLocation(candidate)}</bdi>
                </span>
              )}
            </span>
            {onCopy && (
              <span style={s.copyBtn}>
                <IconBtn icon="Copy" label={t("card.copy")} size={26} onClick={() => onCopy(candidate.evidence_snippet)} />
              </span>
            )}
          </div>
          <pre className="mono" style={s.snippet}>
            {candidate.evidence_snippet}
          </pre>
        </div>

        <div style={s.confidenceRow}>
          <span>{t("card.confidence")}</span>
          <span style={s.bar} aria-hidden>
            <span style={s.barFill(pct, confidenceTone(candidate.confidence))} />
          </span>
          <span className="mono">{pct}%</span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          icon="Check"
          full
          aria-pressed={accepted}
          onClick={() => onPatch({ status: nextStatus(candidate.status, "accepted") })}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind={rejected ? "danger" : "ghost"}
          icon="X"
          full
          aria-pressed={rejected}
          onClick={() => onPatch({ status: nextStatus(candidate.status, "rejected") })}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
      </div>
    </article>
  );
}

export default ConventionCard;
