/* SeverityCounters — per-run "1 CRITICAL · 3 WARNING · 1 SUGGESTION" pills that
   double as a single-select severity filter. Presentational: counts and the
   active level come from FindingsPanel; colours from `SEV`, labels from i18n. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { s } from "./styles";

export function SeverityCounters({
  levels,
  counts,
  active,
  onToggle,
}: {
  /** Levels in display order (the contract's, not SEV's keys). */
  levels: readonly Severity[];
  counts: Record<Severity, number>;
  active: Severity | null;
  onToggle: (level: Severity) => void;
}) {
  const t = useTranslations("prReview");
  // A level with no findings is hidden — unless it is the active filter, which
  // must stay visible (showing 0) so the user can clear it.
  const visible = levels.filter((l) => counts[l] > 0 || l === active);
  if (visible.length === 0) return null;

  return (
    <div role="group" aria-label={t("panel.severityFilterLabel")} style={s.row}>
      {visible.map((level) => {
        const sev = SEV[level];
        const isActive = level === active;
        const muted = active != null && !isActive;
        return (
          <button
            key={level}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(level)}
            style={{
              ...s.pill,
              borderColor: sev.c,
              color: isActive ? s.activeText : sev.c,
              background: isActive ? sev.c : "transparent",
              opacity: muted ? s.mutedOpacity : 1,
            }}
          >
            {t(`panel.severityCount.${level}`, { count: counts[level] })}
          </button>
        );
      })}
    </div>
  );
}
