import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { SEVERITY_LEVELS, applyConfidence, countBySeverity, visibleFindings } from "./helpers";

function finding(id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const MIXED = [
  finding("s1", "SUGGESTION"),
  finding("w1", "WARNING"),
  finding("c1", "CRITICAL"),
  finding("w2", "WARNING", 0.5), // low confidence
  finding("w3", "WARNING"),
];

describe("SEVERITY_LEVELS", () => {
  it("is the contract's three levels in display order (no INFO)", () => {
    expect(SEVERITY_LEVELS).toEqual(["CRITICAL", "WARNING", "SUGGESTION"]);
  });
});

describe("countBySeverity", () => {
  it("counts each level", () => {
    expect(countBySeverity(MIXED)).toEqual({ CRITICAL: 1, WARNING: 3, SUGGESTION: 1 });
  });

  it("returns 0 for levels with no findings", () => {
    expect(countBySeverity([finding("w1", "WARNING")])).toEqual({
      CRITICAL: 0,
      WARNING: 1,
      SUGGESTION: 0,
    });
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it("matches the list after the confidence filter", () => {
    expect(countBySeverity(applyConfidence(MIXED, true)).WARNING).toBe(2);
  });
});

describe("visibleFindings", () => {
  const ids = (fs: FindingRecord[]) => fs.map((f) => f.id);

  it("without a severity keeps everything, sorted CRITICAL → SUGGESTION", () => {
    expect(ids(visibleFindings(MIXED, false))).toEqual(["c1", "w1", "w2", "w3", "s1"]);
    expect(ids(visibleFindings(MIXED, false, null))).toEqual(["c1", "w1", "w2", "w3", "s1"]);
  });

  it.each([
    ["CRITICAL", ["c1"]],
    ["WARNING", ["w1", "w2", "w3"]],
    ["SUGGESTION", ["s1"]],
  ] as const)("keeps only %s", (level, expected) => {
    expect(ids(visibleFindings(MIXED, false, level))).toEqual(expected);
  });

  it("intersects the severity filter with hide-low-confidence", () => {
    expect(ids(visibleFindings(MIXED, true, "WARNING"))).toEqual(["w1", "w3"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(visibleFindings([finding("w1", "WARNING")], false, "CRITICAL")).toEqual([]);
  });
});
