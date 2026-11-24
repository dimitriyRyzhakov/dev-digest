import { describe, it, expect } from "vitest";
import type { PrCommit, RunSummary } from "@devdigest/shared";
import { buildTimeline, outcomeKey, tsOf } from "./helpers";

const run = (o: Partial<RunSummary>) => ({ run_id: "r", status: "done", blockers: 0, findings_count: 0, ...o }) as RunSummary;

describe("outcomeKey — badge follows the CI gate, not the run lifecycle", () => {
  it.each([
    [{ status: "running" }, "running"],
    [{ status: "failed" }, "error"],
    [{ status: "cancelled" }, "cancelled"],
    [{ status: "done", blockers: 2, findings_count: 5 }, "rejected"],
    [{ status: "done", blockers: 0, findings_count: 3 }, "reviewed"],
    [{ status: "done", blockers: 0, findings_count: 0 }, "approved"],
    [{ status: "done", blockers: null, findings_count: null }, "approved"],
  ] as const)("%o → %s", (o, expected) => {
    expect(outcomeKey(run(o as Partial<RunSummary>))).toBe(expected);
  });

  it("lifecycle wins over counts (a failed run with blockers is an error)", () => {
    expect(outcomeKey(run({ status: "failed", blockers: 3 }))).toBe("error");
  });
});

describe("buildTimeline", () => {
  it("interleaves runs and commits newest first; missing timestamps last", () => {
    const items = buildTimeline(
      [run({ run_id: "r1", ran_at: "2026-11-20T10:00:00Z" }), run({ run_id: "r0", ran_at: null })],
      [{ sha: "c1", message: "m", author: "a", committed_at: "2026-11-20T11:00:00Z" } as PrCommit],
    );
    expect(items.map((i) => (i.kind === "run" ? i.run.run_id : i.commit.sha))).toEqual(["c1", "r1", "r0"]);
  });

  it("tsOf treats unparseable dates as 0", () => {
    expect(tsOf("not a date")).toBe(0);
    expect(tsOf(undefined)).toBe(0);
  });
});
