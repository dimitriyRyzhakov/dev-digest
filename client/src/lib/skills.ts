/* lib/skills.ts — pure skill helpers shared by the Skills screens and the
   agent Skills tab (L1: no React, no I/O). */
// Runtime value: import from the contract file, never the barrel (client INSIGHTS).
import { SkillType } from "@devdigest/shared/contracts/knowledge";
import type { Skill, SkillSource } from "@/lib/types";

/** Every skill type, in contract order. */
export const SKILL_TYPES = SkillType.options;

/** Sources whose text came from outside this workspace — someone else's instructions. */
const EXTERNAL_SOURCES: ReadonlySet<SkillSource> = new Set(["imported_file", "imported_url", "community"]);

/** True when the skill's text is external and should be vetted before agents use it. */
export function isExternalSkill(skill: Pick<Skill, "source">): boolean {
  return EXTERNAL_SOURCES.has(skill.source);
}

/** Case-insensitive match on name + description, then an optional type filter. */
export function filterSkills(skills: Skill[], search: string, type: SkillType | null): Skill[] {
  const q = search.trim().toLowerCase();
  return skills.filter(
    (sk) =>
      (type === null || sk.type === type) &&
      (q === "" || sk.name.toLowerCase().includes(q) || sk.description.toLowerCase().includes(q)),
  );
}

/** Count skills per type (for the filter chips); every type is present, zero included. */
export function countByType(skills: Skill[]): Record<SkillType, number> {
  const counts = Object.fromEntries(SKILL_TYPES.map((ty) => [ty, 0])) as Record<SkillType, number>;
  for (const sk of skills) counts[sk.type] += 1;
  return counts;
}

/** Rough token estimate (~4 chars/token) for editor labels; the run trace has exact counts. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 4);
}
