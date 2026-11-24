import type { AgentSkillLink, AgentSkillLinkInput, Skill } from "@/lib/types";

/** One row of the agent's Skills tab: a workspace skill + this agent's switch. */
export interface SkillRow {
  skill: Skill;
  /** Enabled for THIS agent (checkbox). Sent only if `skill.enabled` too. */
  checked: boolean;
}

/**
 * Every workspace skill as a row: linked skills first in link order, then the
 * unlinked ones by name (unchecked). Links to deleted skills are dropped.
 */
export function mergeAgentSkills(skills: Skill[], links: AgentSkillLink[]): SkillRow[] {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linked = [...links]
    .sort((a, b) => a.order - b.order)
    .flatMap((l) => {
      const skill = byId.get(l.skill_id);
      return skill ? [{ skill, checked: l.enabled }] : [];
    });
  const linkedIds = new Set(linked.map((r) => r.skill.id));
  const rest = skills
    .filter((sk) => !linkedIds.has(sk.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, checked: false }));
  return [...linked, ...rest];
}

/** Move a row; out-of-range or no-op moves return the same array. */
export function moveRow<T>(rows: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const next = [...rows];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** Rows → the ordered `links` body. Every row is persisted so its position sticks. */
export function toLinks(rows: SkillRow[]): AgentSkillLinkInput[] {
  return rows.map((r) => ({ skill_id: r.skill.id, enabled: r.checked }));
}

/** Rows the agent actually sends: checked here AND enabled globally. */
export function countActive(rows: SkillRow[]): number {
  return rows.filter((r) => r.checked && r.skill.enabled).length;
}

export function matchesFilter(row: SkillRow, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  return q === "" || row.skill.name.toLowerCase().includes(q) || row.skill.description.toLowerCase().includes(q);
}
