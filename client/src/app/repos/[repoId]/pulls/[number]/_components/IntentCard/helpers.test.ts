import { describe, it, expect } from "vitest";
import {
  formatConfidence,
  modelCostLine,
  quoted,
  sourceChipLabel,
  unresolvedLabel,
  visibleSources,
} from "./helpers";

describe("IntentCard helpers", () => {
  it("formats confidence, quotes and model · cost", () => {
    expect(formatConfidence({ confidence_level: "high", confidence: 0.9 })).toBe("high · 0.90");
    expect(quoted("  Adds X. ")).toBe("“Adds X.”");
    expect(modelCostLine({ model: "m", cost_usd: 0.0004 })).toBe("m · $0.0004");
    expect(modelCostLine({ model: "m", cost_usd: null })).toBe("m · —");
    expect(modelCostLine({ model: null, cost_usd: 1 })).toBeNull();
  });

  it("labels sources (ref for ticket/spec, kind otherwise) and hides the title", () => {
    const sources = [
      { kind: "title" as const, ref: "title", chars: 1, truncated: false },
      { kind: "ticket" as const, ref: "#471", chars: 1, truncated: false },
      { kind: "spec" as const, ref: "specs/a.md", chars: 1, truncated: false },
      { kind: "commits" as const, ref: "3 commit(s)", chars: 1, truncated: false },
    ];
    expect(visibleSources(sources).map(sourceChipLabel)).toEqual(["#471", "specs/a.md", "commits"]);
  });

  it("shows the host for external links and truncates long refs", () => {
    expect(unresolvedLabel({ kind: "link", ref: "https://x.io/a", host: "x.io", reason: "external_host" })).toBe("x.io");
    const long = unresolvedLabel({ kind: "spec", ref: "a/".repeat(40) + "x.md", host: null, reason: "not_found" });
    expect(long.length).toBe(60);
    expect(long.endsWith("…")).toBe(true);
  });
});
