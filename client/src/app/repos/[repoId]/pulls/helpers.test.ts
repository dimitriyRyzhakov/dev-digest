import { describe, it, expect } from "vitest";
import type { PrMeta } from "./constants";
import { pullCounts, sizeOf, visiblePulls } from "./helpers";

const pr = (o: Partial<PrMeta>) =>
  ({ number: 1, title: "t", status: "needs_review", updated_at: null, additions: 0, deletions: 0, ...o }) as PrMeta;

const PULLS = [
  pr({ number: 10, title: "Fix login", status: "needs_review", updated_at: "2026-11-20T10:00:00Z" }),
  pr({ number: 11, title: "Add billing", status: "reviewed", updated_at: "2026-11-21T10:00:00Z" }),
  pr({ number: 12, title: "Old thing", status: "merged", updated_at: "2026-11-01T10:00:00Z" }),
];

describe("visiblePulls", () => {
  it("filters by status chip; 'all' keeps everything", () => {
    expect(visiblePulls(PULLS, { status: "reviewed", query: "", sort: "newest" }).map((p) => p.number)).toEqual([11]);
    expect(visiblePulls(PULLS, { status: "all", query: "", sort: "newest" })).toHaveLength(3);
  });

  it("matches the query on title (case-insensitive) or PR number", () => {
    expect(visiblePulls(PULLS, { status: "all", query: "  LOGIN ", sort: "newest" }).map((p) => p.number)).toEqual([10]);
    expect(visiblePulls(PULLS, { status: "all", query: "12", sort: "newest" }).map((p) => p.number)).toEqual([12]);
  });

  it("sorts by updated_at newest/oldest without mutating input", () => {
    const input = [...PULLS];
    expect(visiblePulls(input, { status: "all", query: "", sort: "newest" }).map((p) => p.number)).toEqual([11, 10, 12]);
    expect(visiblePulls(input, { status: "all", query: "", sort: "oldest" }).map((p) => p.number)).toEqual([12, 10, 11]);
    expect(input).toEqual(PULLS);
  });
});

describe("pullCounts", () => {
  it("counts open (derived review statuses) and needs-review PRs", () => {
    expect(pullCounts([...PULLS, pr({ status: "stale" })])).toEqual({ open: 3, needsReview: 1 });
  });
});

describe("sizeOf", () => {
  it("buckets by total changed lines", () => {
    expect(sizeOf(pr({ additions: 50, deletions: 10 })).size).toBe("S");
    expect(sizeOf(pr({ additions: 200, deletions: 0 })).size).toBe("M");
    expect(sizeOf(pr({ additions: 400, deletions: 1 }))).toEqual({ size: "L", lines: 401 });
  });
});
