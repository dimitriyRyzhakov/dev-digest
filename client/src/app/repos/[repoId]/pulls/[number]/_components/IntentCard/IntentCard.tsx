/* IntentCard — the PR's derived intent (M3) at the top of Overview:
   quoted summary, in/out of scope, risk areas, and a footer with confidence,
   sources, unresolved refs and model · cost. Text is model output from
   author-controlled input: rendered as plain text only, refs never linked. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { PrIntentRecord } from "@/lib/types";
import { CONFIDENCE_TONE, RISK_ICON } from "./constants";
import {
  formatConfidence,
  modelCostLine,
  quoted,
  sourceChipLabel,
  unresolvedLabel,
  visibleSources,
} from "./helpers";
import { s } from "./styles";

export function IntentCard({ intent }: { intent: PrIntentRecord | null }) {
  const t = useTranslations("prReview.detail.intent");
  return (
    <section style={s.card} data-testid="intent-card" aria-label={t("title")}>
      <div style={s.columnLabel("var(--text-muted)")}>
        <Icon.Target size={13} />
        {t("title")}
      </div>
      {intent ? <IntentBody intent={intent} /> : <span style={s.empty}>{t("empty")}</span>}
    </section>
  );
}

function IntentBody({ intent }: { intent: PrIntentRecord }) {
  const t = useTranslations("prReview.detail.intent");
  return (
    <>
      {intent.confidence_level === "low" && (
        <div style={s.hint} role="note">
          <Icon.AlertTriangle size={14} />
          {t("lowHint")}
        </div>
      )}
      <p style={s.summary}>{quoted(intent.intent)}</p>
      <div style={s.columns}>
        <ScopeColumn
          label={t("inScope")}
          icon="Check"
          color="var(--ok)"
          items={intent.in_scope}
          emptyText={t("none")}
        />
        <ScopeColumn
          label={t("outOfScope")}
          icon="X"
          color="var(--text-muted)"
          items={intent.out_of_scope}
          emptyText={t("none")}
          muted
        />
      </div>
      {intent.risk_areas.length > 0 && (
        <>
          <hr style={s.divider} />
          <div>
            <div style={s.columnLabel("var(--text-muted)")}>
              <Icon.AlertTriangle size={13} />
              {t("riskAreas")}
            </div>
            <div style={s.chips}>
              {intent.risk_areas.map((r) => {
                const RIcon = Icon[RISK_ICON[r.kind]];
                return (
                  <span key={`${r.origin}:${r.kind}:${r.label}`} style={s.riskChip} data-testid="risk-chip">
                    <RIcon size={13} />
                    {r.label}
                  </span>
                );
              })}
            </div>
          </div>
        </>
      )}
      <hr style={s.divider} />
      <IntentFooter intent={intent} />
    </>
  );
}

function ScopeColumn({
  label,
  icon,
  color,
  items,
  emptyText,
  muted = false,
}: {
  label: string;
  icon: "Check" | "X";
  color: string;
  items: string[];
  emptyText: string;
  muted?: boolean;
}) {
  const CIcon = Icon[icon];
  return (
    <div>
      <div style={s.columnLabel(color)}>
        <CIcon size={13} />
        {label}
      </div>
      <ul style={s.list}>
        {items.length > 0 ? (
          items.map((item, i) => (
            <li key={`${i}:${item}`} style={s.item(muted)}>
              <span style={s.bullet}>·</span>
              {item}
            </li>
          ))
        ) : (
          <li style={s.item(true)}>{emptyText}</li>
        )}
      </ul>
    </div>
  );
}

function IntentFooter({ intent }: { intent: PrIntentRecord }) {
  const t = useTranslations("prReview.detail.intent");
  const tone = CONFIDENCE_TONE[intent.confidence_level];
  const modelCost = modelCostLine(intent);
  return (
    <div style={s.footer} data-testid="intent-footer">
      <Badge color={tone.c} bg={tone.bg}>
        {formatConfidence(intent)}
      </Badge>
      {intent.breaking && (
        <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertOctagon">
          {t("breaking")}
        </Badge>
      )}
      {visibleSources(intent.sources).map((src) => (
        <Badge key={`${src.kind}:${src.ref}`} mono>
          {sourceChipLabel(src)}
        </Badge>
      ))}
      {intent.unresolved_refs.map((u) => (
        <span
          key={`${u.kind}:${u.ref}`}
          style={s.unresolved}
          title={t("unresolvedTitle", { reason: t(`reason.${u.reason}`) })}
          data-testid="intent-unresolved"
        >
          {unresolvedLabel(u)}
        </span>
      ))}
      {modelCost && <span style={s.modelCost}>{modelCost}</span>}
    </div>
  );
}
