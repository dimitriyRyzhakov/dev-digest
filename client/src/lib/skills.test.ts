import { describe, it, expect } from "vitest";
import type { Skill } from "@/lib/types";
import { countByType, filterSkills, isExternalSkill } from "./skills";

function skill(id: string, name: string, over: Partial<Skill> = {}): Skill {
  return {
    id,
    name,
    description: "",
    type: "custom",
    source: "manual",
    body: "# body",
    enabled: true,
    version: 1,
    ...over,
  };
}

const SKILLS: Skill[] = [
  skill("1", "api-versioning-gate", { type: "convention", description: "Flag unversioned API changes." }),
  skill("2", "secrets-scan", { type: "security", description: "Flag hard-coded credentials." }),
  skill("3", "pr-quality", { type: "rubric", description: "Score PR hygiene." }),
  skill("4", "naming", { type: "convention", description: "Match the repo's naming." }),
];
const ids = (list: Skill[]) => list.map((s) => s.id);

describe("filterSkills", () => {
  it("returns everything for an empty search and no type", () => {
    expect(ids(filterSkills(SKILLS, "", null))).toEqual(["1", "2", "3", "4"]);
    expect(ids(filterSkills(SKILLS, "   ", null))).toEqual(["1", "2", "3", "4"]);
  });

  it("searches name and description, case-insensitive", () => {
    expect(ids(filterSkills(SKILLS, "SECRETS", null))).toEqual(["2"]);
    expect(ids(filterSkills(SKILLS, "flag", null))).toEqual(["1", "2"]);
    expect(ids(filterSkills(SKILLS, "  Hygiene ", null))).toEqual(["3"]);
    expect(filterSkills(SKILLS, "nothing-matches", null)).toEqual([]);
  });

  it("filters by type, combined with the search", () => {
    expect(ids(filterSkills(SKILLS, "", "convention"))).toEqual(["1", "4"]);
    expect(ids(filterSkills(SKILLS, "naming", "convention"))).toEqual(["4"]);
    expect(filterSkills(SKILLS, "secrets", "convention")).toEqual([]);
    expect(filterSkills(SKILLS, "", "custom")).toEqual([]);
  });
});

describe("countByType", () => {
  it("counts every type, including zeros", () => {
    expect(countByType(SKILLS)).toEqual({ rubric: 1, convention: 2, security: 1, custom: 0 });
    expect(countByType([])).toEqual({ rubric: 0, convention: 0, security: 0, custom: 0 });
  });
});

describe("isExternalSkill", () => {
  it("flags imported and community skills, not manual or extracted ones", () => {
    expect(isExternalSkill({ source: "imported_file" })).toBe(true);
    expect(isExternalSkill({ source: "imported_url" })).toBe(true);
    expect(isExternalSkill({ source: "community" })).toBe(true);
    expect(isExternalSkill({ source: "manual" })).toBe(false);
    expect(isExternalSkill({ source: "extracted" })).toBe(false);
  });
});
