import type { IconName } from "@devdigest/ui";
import type { IntentConfidenceLevel, IntentRiskKind } from "@/lib/types";

/** Icon per risk-area kind (design: auth → shield, dependency → boxes, …). */
export const RISK_ICON: Record<IntentRiskKind, IconName> = {
  auth: "Shield",
  security: "AlertOctagon",
  dependency: "Boxes",
  data: "Database",
  migration: "Database",
  performance: "Zap",
  api: "Globe",
  config: "Settings",
  other: "Dot",
};

/** Text / background colour of the confidence badge per level. */
export const CONFIDENCE_TONE: Record<IntentConfidenceLevel, { c: string; bg: string }> = {
  high: { c: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { c: "var(--info)", bg: "var(--info-bg)" },
  low: { c: "var(--warn)", bg: "var(--warn-bg)" },
};
