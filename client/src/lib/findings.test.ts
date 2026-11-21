import { describe, it, expect } from "vitest";
import { SEVERITY_LEVELS, countBySeverity, sortForPreview } from "./findings";

describe("SEVERITY_LEVELS", () => {
  it("is the contract's 3 levels in display order (no INFO)", () => {
    expect(SEVERITY_LEVELS).toEqual(["CRITICAL", "WARNING", "SUGGESTION"]);
  });
});

describe("countBySeverity", () => {
  it("counts every contract level, 0 when missing, ignores unknown", () => {
    expect(countBySeverity([{ severity: "WARNING" }, { severity: "WARNING" }, { severity: "INFO" }])).toEqual({
      CRITICAL: 0,
      WARNING: 2,
      SUGGESTION: 0,
    });
  });
});

describe("sortForPreview", () => {
  it("orders by severity, then confidence desc, then id (server order)", () => {
    const f = (id: string, severity: string, confidence: number) => ({ id, severity, confidence });
    const sorted = sortForPreview([
      f("s1", "SUGGESTION", 0.99),
      f("w-low", "WARNING", 0.5),
      f("c2", "CRITICAL", 0.8),
      f("w-high", "WARNING", 0.9),
      f("c1", "CRITICAL", 0.8),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["c1", "c2", "w-high", "w-low", "s1"]);
  });

  it("does not mutate the input", () => {
    const input = [
      { id: "b", severity: "SUGGESTION", confidence: 1 },
      { id: "a", severity: "CRITICAL", confidence: 1 },
    ];
    sortForPreview(input);
    expect(input[0]!.id).toBe("b");
  });
});
