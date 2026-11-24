import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@/lib/types";
import { countActive, matchesFilter, mergeAgentSkills, moveRow, toLinks, type SkillRow } from "./helpers";

function skill(id: string, name: string, over: Partial<Skill> = {}): Skill {
  return {
    id,
    name,
    description: `${name} description`,
    type: "custom",
    source: "manual",
    body: "# body",
    enabled: true,
    version: 1,
    ...over,
  };
}

function link(skill_id: string, order: number, enabled = true): AgentSkillLink {
  return { agent_id: "ag1", skill_id, order, enabled };
}

const names = (rows: SkillRow[]) => rows.map((r) => r.skill.name);

describe("mergeAgentSkills", () => {
  const skills = [skill("s1", "zeta"), skill("s2", "alpha"), skill("s3", "mid"), skill("s4", "beta")];

  it("puts linked skills first by link order, then unlinked ones by name, unchecked", () => {
    // links given out of order on purpose: the `order` field decides
    const rows = mergeAgentSkills(skills, [link("s3", 1, false), link("s1", 0, true)]);
    expect(names(rows)).toEqual(["zeta", "mid", "alpha", "beta"]);
    expect(rows.map((r) => r.checked)).toEqual([true, false, false, false]);
  });

  it("takes the checked flag from link.enabled", () => {
    const rows = mergeAgentSkills(skills, [link("s2", 0, false), link("s4", 1, true)]);
    expect(rows.slice(0, 2).map((r) => [r.skill.id, r.checked])).toEqual([
      ["s2", false],
      ["s4", true],
    ]);
  });

  it("drops links to unknown (deleted) skills", () => {
    const rows = mergeAgentSkills(skills, [link("gone", 0), link("s2", 1)]);
    expect(rows).toHaveLength(4);
    expect(names(rows)).toEqual(["alpha", "beta", "mid", "zeta"]);
    expect(rows[0]?.checked).toBe(true);
  });

  it("returns no rows when there are no skills", () => {
    expect(mergeAgentSkills([], [link("s1", 0)])).toEqual([]);
  });
});

describe("moveRow", () => {
  const rows = ["a", "b", "c", "d"];

  it("moves an item down and up", () => {
    expect(moveRow(rows, 0, 1)).toEqual(["b", "a", "c", "d"]);
    expect(moveRow(rows, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(rows).toEqual(["a", "b", "c", "d"]); // input not mutated
  });

  it("returns the SAME array for a no-op or out-of-range move", () => {
    expect(moveRow(rows, 2, 2)).toBe(rows);
    expect(moveRow(rows, 0, -1)).toBe(rows);
    expect(moveRow(rows, 3, 4)).toBe(rows);
    expect(moveRow(rows, -1, 0)).toBe(rows);
    expect(moveRow(rows, 4, 0)).toBe(rows);
  });
});

describe("toLinks / countActive / matchesFilter", () => {
  const rows: SkillRow[] = [
    { skill: skill("s1", "api-versioning", { description: "Flag unversioned API changes" }), checked: true },
    { skill: skill("s2", "secrets", { enabled: false }), checked: true },
    { skill: skill("s3", "tests"), checked: false },
  ];

  it("toLinks keeps every row in order with its checked flag", () => {
    expect(toLinks(rows)).toEqual([
      { skill_id: "s1", enabled: true },
      { skill_id: "s2", enabled: true },
      { skill_id: "s3", enabled: false },
    ]);
  });

  it("countActive counts only rows checked here AND enabled globally", () => {
    expect(countActive(rows)).toBe(1);
    expect(countActive([])).toBe(0);
  });

  it("matchesFilter matches name or description, case-insensitive and trimmed", () => {
    const [api] = rows as [SkillRow];
    expect(matchesFilter(api, "")).toBe(true);
    expect(matchesFilter(api, "   ")).toBe(true);
    expect(matchesFilter(api, "API-VERS")).toBe(true);
    expect(matchesFilter(api, "  unversioned ")).toBe(true);
    expect(matchesFilter(api, "secrets")).toBe(false);
  });
});
