import type { SkillType } from "@/lib/types";

/** Text colour per skill type (design: rubric=accent, convention=ok, security=crit, custom=muted). */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-muted)",
};
