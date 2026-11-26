import type { IconName } from "@devdigest/ui";
import type { ConventionStatus } from "@/lib/types";

/** Rows of the inline rule editor (rules are one or two sentences). */
export const RULE_EDIT_ROWS = 2;

/** Status tag next to the category (pending shows none). Icon + label, never colour alone. */
export const STATUS_BADGE: Record<ConventionStatus, { icon: IconName; color: string; bg: string }> = {
  pending: { icon: "Clock", color: "var(--text-muted)", bg: "var(--bg-hover)" },
  accepted: { icon: "Check", color: "var(--ok)", bg: "var(--ok-bg)" },
  rejected: { icon: "X", color: "var(--text-muted)", bg: "var(--bg-hover)" },
};
