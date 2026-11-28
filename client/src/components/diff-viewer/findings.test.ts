import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { partitionFindings, worstOpenSeverity } from "./findings";

const finding = (over: Partial<FindingRecord>): FindingRecord => ({
  id: "f",
  severity: "WARNING",
  category: "bug",
  title: "t",
  file: "src/a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
  ...over,
});

describe("partitionFindings", () => {
  it("anchors findings to rendered RIGHT lines and lists the rest as unmatched", () => {
    const onLine = finding({ id: "a", start_line: 3 });
    const sameLine = finding({ id: "b", start_line: 3 });
    const leftOnly = finding({ id: "c", start_line: 7 }); // only LEFT:7 is rendered
    const outside = finding({ id: "d", start_line: 99 });
    const { matched, unmatched } = partitionFindings(
      [onLine, sameLine, leftOnly, outside],
      new Set(["RIGHT:3", "LEFT:7"]),
    );
    expect(matched.get("RIGHT:3")?.map((f) => f.id)).toEqual(["a", "b"]);
    expect([...matched.keys()]).toEqual(["RIGHT:3"]);
    expect(unmatched.map((f) => f.id)).toEqual(["c", "d"]);
  });

  it("puts everything in unmatched when the file has no rendered lines (no patch)", () => {
    const { matched, unmatched } = partitionFindings([finding({ id: "a" })], new Set());
    expect(matched.size).toBe(0);
    expect(unmatched).toHaveLength(1);
  });
});

describe("worstOpenSeverity", () => {
  it("returns the highest severity among non-dismissed findings", () => {
    expect(
      worstOpenSeverity([finding({ severity: "SUGGESTION" }), finding({ severity: "CRITICAL" })]),
    ).toBe("CRITICAL");
    expect(
      worstOpenSeverity([
        finding({ severity: "CRITICAL", dismissed_at: "2026-11-28T10:00:00Z" }),
        finding({ severity: "SUGGESTION" }),
      ]),
    ).toBe("SUGGESTION");
  });

  it("counts accepted findings but returns null when all are dismissed or there are none", () => {
    expect(worstOpenSeverity([finding({ severity: "WARNING", accepted_at: "2026-11-28T10:00:00Z" })])).toBe(
      "WARNING",
    );
    expect(worstOpenSeverity([finding({ dismissed_at: "2026-11-28T10:00:00Z" })])).toBeNull();
    expect(worstOpenSeverity([])).toBeNull();
    expect(worstOpenSeverity(undefined)).toBeNull();
  });
});
