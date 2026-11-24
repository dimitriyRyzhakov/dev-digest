import { describe, it, expect } from "vitest";
import type { Skill } from "@/lib/types";
import { EMPTY_DRAFT, isDraftValid, toSkillDraft, toSkillInput, toSkillPatch, type SkillDraft } from "./helpers";

const DRAFT: SkillDraft = {
  name: "  api-versioning-gate ",
  description: " Flag unversioned changes. ",
  type: "convention",
  body: "\n# Gate\nBody\n  ",
};

describe("isDraftValid", () => {
  it("requires non-blank name, description and body", () => {
    expect(isDraftValid(DRAFT)).toBe(true);
    expect(isDraftValid(EMPTY_DRAFT)).toBe(false);
    expect(isDraftValid({ ...DRAFT, name: "   " })).toBe(false);
    expect(isDraftValid({ ...DRAFT, description: "\t" })).toBe(false);
    expect(isDraftValid({ ...DRAFT, body: " \n " })).toBe(false);
  });
});

describe("toSkillInput", () => {
  it("trims the text fields and defaults source to 'manual'", () => {
    expect(toSkillInput(DRAFT)).toEqual({
      name: "api-versioning-gate",
      description: "Flag unversioned changes.",
      type: "convention",
      body: "# Gate\nBody",
      source: "manual",
    });
  });

  it("passes an explicit 'imported_file' source through", () => {
    expect(toSkillInput(DRAFT, "imported_file").source).toBe("imported_file");
  });
});

describe("toSkillPatch", () => {
  it("trims the text fields and never carries a source", () => {
    const patch = toSkillPatch(DRAFT);
    expect(patch).toEqual({
      name: "api-versioning-gate",
      description: "Flag unversioned changes.",
      type: "convention",
      body: "# Gate\nBody",
    });
    expect(patch).not.toHaveProperty("source");
  });
});

describe("toSkillDraft", () => {
  it("copies only the editable fields from a stored skill", () => {
    const stored: Skill = {
      id: "sk1",
      name: "secrets-scan",
      description: "Flag credentials.",
      type: "security",
      source: "imported_file",
      body: "# Secrets",
      enabled: false,
      version: 3,
    };
    expect(toSkillDraft(stored)).toEqual({
      name: "secrets-scan",
      description: "Flag credentials.",
      type: "security",
      body: "# Secrets",
    });
  });
});
