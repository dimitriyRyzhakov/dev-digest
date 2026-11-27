import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { collectFindings, reviewForRun, withSearchParam } from "./helpers";

const finding = (id: string) => ({ id }) as FindingRecord;
const review = (run_id: string, ids: string[]) =>
  ({ id: `rev-${run_id}`, run_id, findings: ids.map(finding) }) as unknown as ReviewRecord;

describe("PrDetailView helpers", () => {
  it("collectFindings flattens findings of every run in order", () => {
    const runs = [review("r1", ["a", "b"]), review("r2", []), review("r3", ["c"])];
    expect(collectFindings(runs).map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("reviewForRun finds the review of a run, undefined for null/unknown", () => {
    const runs = [review("r1", []), review("r2", [])];
    expect(reviewForRun(runs, "r2")?.id).toBe("rev-r2");
    expect(reviewForRun(runs, null)).toBeUndefined();
    expect(reviewForRun(runs, "nope")).toBeUndefined();
  });

  it("withSearchParam sets, replaces and removes one param", () => {
    expect(withSearchParam("", "tab", "findings")).toBe("?tab=findings");
    expect(withSearchParam("tab=overview&trace=r1", "tab", "diff")).toBe("?tab=diff&trace=r1");
    expect(withSearchParam("tab=diff&trace=r1", "trace", null)).toBe("?tab=diff");
    expect(withSearchParam("trace=r1", "trace", null)).toBe("");
  });
});
