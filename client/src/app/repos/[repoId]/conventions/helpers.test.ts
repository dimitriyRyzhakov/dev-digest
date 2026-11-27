import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@/lib/types";
import {
  acceptedOnly,
  buildSkillBody,
  confidenceTone,
  defaultSkillName,
  evidenceLocation,
  fenceFor,
  fenceLang,
  slugifyRule,
} from "./helpers";

const C = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "c1",
  rule: "Always use async/await instead of .then() chains.",
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const user = await db.users.find(id);\n",
  evidence_start_line: 23,
  evidence_end_line: 31,
  confidence: 0.91,
  accepted: true,
  status: "accepted",
  created_at: "2026-11-25T10:00:00.000Z",
  ...over,
});

const TEXT = {
  intro: "House conventions for `payments-api`. Flag changes that violate any rule below and cite the offending `file:line`.",
  detectedIn: (loc: string) => `Detected in \`${loc}\`:`,
};

describe("evidenceLocation", () => {
  it("formats path:start-end, path:line and bare path", () => {
    expect(evidenceLocation(C())).toBe("src/api/users.ts:23-31");
    expect(evidenceLocation(C({ evidence_end_line: 23 }))).toBe("src/api/users.ts:23");
    expect(evidenceLocation(C({ evidence_start_line: null, evidence_end_line: null }))).toBe("src/api/users.ts");
  });
});

describe("slugifyRule / fenceLang / defaultSkillName", () => {
  it("builds a short kebab slug", () => {
    expect(slugifyRule("Always use async/await instead of .then() chains.")).toBe("always-use-async-await-instead-of");
    expect(slugifyRule("!!!")).toBe("rule");
  });
  it("maps extensions to fence languages", () => {
    expect(fenceLang("src/a.ts")).toBe("ts");
    expect(fenceLang("lib/x.py")).toBe("python");
    expect(fenceLang("Makefile")).toBe("");
  });
  it("names the skill after the repo", () => {
    expect(defaultSkillName("payments-api")).toBe("payments-api-conventions");
  });
});

describe("buildSkillBody", () => {
  it("renders title, directive and one section per accepted rule with its evidence", () => {
    const body = buildSkillBody("payments-api-conventions", [C()], TEXT);
    expect(body).toBe(
      [
        "# payments-api-conventions",
        "",
        TEXT.intro,
        "",
        "## always-use-async-await-instead-of",
        "Always use async/await instead of .then() chains.",
        "",
        "Detected in `src/api/users.ts:23-31`:",
        "```ts",
        "const user = await db.users.find(id);",
        "```",
        "",
      ].join("\n"),
    );
  });

  it("de-duplicates equal slugs", () => {
    const body = buildSkillBody("x", [C({ id: "a" }), C({ id: "b" })], TEXT);
    expect(body).toContain("## always-use-async-await-instead-of\n");
    expect(body).toContain("## always-use-async-await-instead-of-2\n");
  });
});

describe("acceptedOnly / confidenceTone", () => {
  it("keeps accepted candidates in order", () => {
    const list = [C({ id: "a" }), C({ id: "b", status: "pending", accepted: false }), C({ id: "c" })];
    expect(acceptedOnly(list).map((c) => c.id)).toEqual(["a", "c"]);
  });
  it("tones by thresholds", () => {
    expect(confidenceTone(0.91)).toBe("ok");
    expect(confidenceTone(0.78)).toBe("warn");
    expect(confidenceTone(0.4)).toBe("crit");
  });
});

describe("fenceFor", () => {
  it("is ``` for plain snippets", () => {
    expect(fenceFor("const a = 1;")).toBe("```");
  });

  it("outlasts any backtick run in the snippet so it cannot be closed early", () => {
    expect(fenceFor("a ``` b")).toBe("````");
    expect(fenceFor("````` x")).toBe("``````");
  });
});
