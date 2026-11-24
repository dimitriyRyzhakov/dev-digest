import { describe, it, expect } from "vitest";
import { resolveTab } from "./helpers";
import { diffLines, firstLine } from "./_components/VersionsTab/helpers";
import { agentState } from "./_components/StatsTab/helpers";

describe("resolveTab", () => {
  it("keeps known tabs and falls back to config", () => {
    expect(resolveTab("versions")).toBe("versions");
    expect(resolveTab("stats")).toBe("stats");
    expect(resolveTab("evals")).toBe("config");
    expect(resolveTab(null)).toBe("config");
  });
});

describe("diffLines", () => {
  it("marks removed, added and unchanged lines in order", () => {
    expect(diffLines("# Rule\nold\nkeep", "# Rule\nkeep\nnew")).toEqual([
      { kind: "same", text: "# Rule" },
      { kind: "del", text: "old" },
      { kind: "same", text: "keep" },
      { kind: "add", text: "new" },
    ]);
  });

  it("returns only unchanged lines for equal bodies", () => {
    expect(diffLines("a\nb", "a\nb").every((d) => d.kind === "same")).toBe(true);
  });
});

describe("agentState", () => {
  it("distinguishes active, switched-off link and disabled agent", () => {
    expect(agentState({ id: "a", name: "A", link_enabled: true, agent_enabled: true })).toBe("active");
    expect(agentState({ id: "a", name: "A", link_enabled: false, agent_enabled: true })).toBe("linkOff");
    expect(agentState({ id: "a", name: "A", link_enabled: true, agent_enabled: false })).toBe("agentOff");
  });
});

describe("firstLine", () => {
  it("returns the first non-empty line without a heading marker", () => {
    expect(firstLine("\n\n## What to flag\n- x")).toBe("What to flag");
    expect(firstLine("plain text\nmore")).toBe("plain text");
    expect(firstLine("   \n")).toBe("");
  });
});
