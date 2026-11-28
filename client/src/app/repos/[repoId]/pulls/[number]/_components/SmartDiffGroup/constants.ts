import type { SmartDiffRole } from "@/lib/types";

export interface SmartDiffRoleMeta {
  /** i18n key under prReview.smartDiff. */
  labelKey: `${SmartDiffRole}Label`;
  /** i18n key under prReview.smartDiff. */
  hintKey: `${SmartDiffRole}Hint`;
  /** Colour of the group's square marker. */
  color: string;
}

/** Label, hint and marker colour of each Smart Diff role. */
export const ROLE_META: Record<SmartDiffRole, SmartDiffRoleMeta> = {
  core: { labelKey: "coreLabel", hintKey: "coreHint", color: "var(--accent)" },
  tests: { labelKey: "testsLabel", hintKey: "testsHint", color: "var(--ok)" },
  wiring: { labelKey: "wiringLabel", hintKey: "wiringHint", color: "var(--info)" },
  docs: { labelKey: "docsLabel", hintKey: "docsHint", color: "var(--sugg)" },
  boilerplate: { labelKey: "boilerplateLabel", hintKey: "boilerplateHint", color: "var(--text-muted)" },
};

/** Roles whose group starts collapsed and whose files start closed (skim-only content). */
export const COLLAPSED_ROLES: readonly SmartDiffRole[] = ["docs", "boilerplate"];
