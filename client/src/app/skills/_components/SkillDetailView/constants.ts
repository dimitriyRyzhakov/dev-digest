import type { IconName } from "@devdigest/ui";

/** Skill editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface SkillTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Skill editor tabs (design: Config · Preview · Versions · Stats). Evals arrive with the eval milestone. */
export const TABS: readonly SkillTab[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "GitCommit" },
  { key: "stats", labelKey: "detail.tabs.stats", icon: "BarChart" },
];

export const VALID_TABS = TABS.map((t) => t.key);
