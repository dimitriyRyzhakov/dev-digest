/* FindingsSummary — inline per-severity counts that open a read-only popover
   previewing the findings (M1). Used by the PR list FINDINGS column (latest
   review of each agent) and the Agent-runs timeline (one run).
   The popover is portalled to <body> with fixed positioning: the PR list card
   has `overflow: hidden`, which would clip an absolutely positioned popover. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, SEV, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { lineRef, placePopover, totalOf, visibleLevels } from "./helpers";
import { s } from "./styles";

export type FindingPreviewLike = Pick<
  FindingRecord,
  "id" | "severity" | "category" | "title" | "file" | "start_line" | "end_line" | "confidence" | "rationale"
>;

/** Delay before closing, so the pointer can travel from the trigger into the popover. */
const CLOSE_DELAY_MS = 120;

export function FindingsSummary({
  counts,
  previews,
  title,
  emptyLabel,
  moreHref,
}: {
  /** null = never reviewed → "—", no popover. */
  counts: Record<Severity, number> | null;
  /** Already sorted; may be shorter than the total. */
  previews: FindingPreviewLike[];
  /** Translated popover header, e.g. "6 findings". */
  title: string;
  /** Shown (muted) when the total is 0; omit to render nothing. */
  emptyLabel?: string;
  /** Where "+K more" links to (PR list → the PR's findings tab). */
  moreHref?: string;
}) {
  const t = useTranslations("prReview.findingsSummary");
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set while Esc returns focus to the trigger, so that focus doesn't reopen it.
  const skipFocusOpen = React.useRef(false);
  const popoverId = React.useId();
  const [pos, setPos] = React.useState<ReturnType<typeof placePopover> | null>(null);
  const open = pos != null;

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const close = React.useCallback(() => {
    cancelClose();
    setPos(null);
  }, [cancelClose]);
  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPos(null), CLOSE_DELAY_MS);
  }, [cancelClose]);
  const show = React.useCallback(() => {
    cancelClose();
    const el = triggerRef.current;
    if (!el) return;
    setPos(placePopover(el.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }));
  }, [cancelClose]);

  // While open: Esc closes; page scroll/resize closes (fixed position would drift).
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        skipFocusOpen.current = true;
        triggerRef.current?.focus();
        skipFocusOpen.current = false;
      }
    };
    const onScroll = (e: Event) => {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  React.useEffect(() => cancelClose, [cancelClose]);

  if (counts == null) return <span style={s.muted}>—</span>;
  const total = totalOf(counts);
  if (total === 0) return emptyLabel != null ? <span style={s.muted}>{emptyLabel}</span> : null;

  const levels = visibleLevels(counts);
  const more = total - previews.length;
  // Clicks must not reach the PR row (it navigates). React events bubble through
  // portals along the React tree, so the popover needs this too.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={t("ariaLabel", {
          critical: counts.CRITICAL,
          warning: counts.WARNING,
          suggestion: counts.SUGGESTION,
        })}
        style={s.trigger}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={() => {
          if (!skipFocusOpen.current) show();
        }}
        onBlur={(e) => {
          if (popoverRef.current?.contains(e.relatedTarget as Node | null)) return;
          scheduleClose();
        }}
        onClick={(e) => {
          stop(e);
          if (open) close();
          else show();
        }}
      >
        {levels.map((l) => {
          const I = Icon[SEV[l].icon];
          return (
            <span key={l} style={s.level(SEV[l].c)} data-severity={l}>
              <I size={13} />
              {counts[l]}
            </span>
          );
        })}
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-label={title}
            style={{ ...s.popover, ...pos }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onClick={stop}
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (popoverRef.current?.contains(next) || triggerRef.current?.contains(next)) return;
              scheduleClose();
            }}
          >
            <div style={s.header}>
              <Icon.Info size={13} />
              {title}
            </div>
            {previews.map((f) => {
              const sev = SEV[f.severity];
              const I = Icon[sev.icon];
              return (
                <div key={f.id} style={s.item}>
                  <div style={s.itemHead}>
                    <span style={s.sevSquare(sev.c, sev.bg)}>
                      <I size={12} />
                    </span>
                    <span style={s.itemTitle}>{f.title}</span>
                    <CategoryTag category={f.category} />
                  </div>
                  <div style={s.meta}>
                    <span className="mono" style={s.file}>
                      {lineRef(f.file, f.start_line, f.end_line)}
                    </span>
                    <span style={s.conf}>
                      <ConfidenceNum value={f.confidence} />
                    </span>
                  </div>
                  <div style={s.rationale}>{f.rationale}</div>
                </div>
              );
            })}
            {more > 0 &&
              (moreHref ? (
                <Link href={moreHref} style={s.more}>
                  {t("more", { count: more })}
                </Link>
              ) : (
                <span style={s.more}>{t("more", { count: more })}</span>
              ))}
          </div>,
          document.body,
        )}
    </>
  );
}

export default FindingsSummary;
