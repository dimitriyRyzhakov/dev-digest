import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import type { PrFile, SmartDiff } from "@/lib/types";
import {
  SMART_DIFF_ROLES,
  countOpenFindings,
  diffTotals,
  filesWithOpenFindings,
  findingsByPath,
  groupSummary,
  hasReviewRun,
  latestReviewFindings,
  orderBySmartDiff,
} from "./helpers";

const file = (path: string, additions = 1, deletions = 0): PrFile => ({ path, additions, deletions, patch: null });

const smart = (groups: Partial<Record<string, string[]>>): SmartDiff => ({
  groups: SMART_DIFF_ROLES.map((role) => ({
    role,
    files: (groups[role] ?? []).map((path) => ({ path, additions: 0, deletions: 0, finding_lines: [] })),
  })),
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
});

const shape = (groups: ReturnType<typeof orderBySmartDiff>) =>
  groups.map((g) => [g.role, g.files.map((f) => f.path)]);

describe("orderBySmartDiff", () => {
  it("returns all five roles in reading order, empty groups included", () => {
    const groups = orderBySmartDiff([file("src/a.ts")], smart({ core: ["src/a.ts"] }));
    expect(shape(groups)).toEqual([
      ["core", ["src/a.ts"]],
      ["tests", []],
      ["wiring", []],
      ["docs", []],
      ["boilerplate", []],
    ]);
  });

  it("keeps GitHub order inside a group, not the server's", () => {
    const files = [file("src/b.ts"), file("pnpm-lock.yaml"), file("src/a.ts")];
    const groups = orderBySmartDiff(files, smart({ core: ["src/a.ts", "src/b.ts"], boilerplate: ["pnpm-lock.yaml"] }));
    expect(groups[0]?.files.map((f) => f.path)).toEqual(["src/b.ts", "src/a.ts"]);
    expect(groups[4]?.files.map((f) => f.path)).toEqual(["pnpm-lock.yaml"]);
  });

  it("puts files unknown to Smart Diff into core and drops Smart Diff paths with no file", () => {
    const groups = orderBySmartDiff([file("new.ts")], smart({ docs: ["README.md"] }));
    expect(shape(groups)).toEqual([
      ["core", ["new.ts"]],
      ["tests", []],
      ["wiring", []],
      ["docs", []],
      ["boilerplate", []],
    ]);
  });

  it("without a Smart Diff, every file lands in core", () => {
    const groups = orderBySmartDiff([file("a.md"), file("b.ts")], undefined);
    expect(groups.map((g) => g.files.length)).toEqual([2, 0, 0, 0, 0]);
  });
});

describe("diffTotals", () => {
  it("counts files and sums additions / deletions", () => {
    expect(diffTotals([file("a", 3, 1), file("b", 4, 2)])).toEqual({ files: 2, additions: 7, deletions: 3 });
  });

  it("is zero for no files", () => {
    expect(diffTotals([])).toEqual({ files: 0, additions: 0, deletions: 0 });
  });
});

// Same selection cases as server modules/smart-diff/domain.ts#selectDiffFindings.
const finding = (id: string, path = "src/a.ts", dismissed = false): FindingRecord => ({
  id,
  severity: "WARNING",
  category: "bug",
  title: id,
  file: path,
  start_line: 1,
  end_line: 1,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r",
  accepted_at: null,
  dismissed_at: dismissed ? "2026-11-28T12:00:00Z" : null,
});

const review = (
  id: string,
  agentId: string | null,
  createdAt: string,
  findings: FindingRecord[],
  kind: ReviewRecord["kind"] = "review",
): ReviewRecord => ({
  id,
  pr_id: "pr1",
  agent_id: agentId,
  run_id: null,
  agent_name: null,
  kind,
  verdict: null,
  summary: null,
  score: null,
  model: null,
  grounding: null,
  created_at: createdAt,
  findings,
});

const ids = (fs: FindingRecord[]) => fs.map((f) => f.id).sort();

describe("latestReviewFindings", () => {
  it("keeps only the newest review per agent, across agents", () => {
    const reviews = [
      review("r-old", "agent-a", "2026-11-27T10:00:00Z", [finding("old")]),
      review("r-new", "agent-a", "2026-11-28T10:00:00Z", [finding("new")]),
      review("r-b", "agent-b", "2026-11-26T10:00:00Z", [finding("b")]),
    ];
    expect(ids(latestReviewFindings(reviews))).toEqual(["b", "new"]);
  });

  it("treats each review without an agent as its own source", () => {
    const reviews = [
      review("r1", null, "2026-11-27T10:00:00Z", [finding("x")]),
      review("r2", null, "2026-11-28T10:00:00Z", [finding("y")]),
    ];
    expect(ids(latestReviewFindings(reviews))).toEqual(["x", "y"]);
  });

  it("ignores summary reviews even when they are newer, and keeps dismissed findings", () => {
    const reviews = [
      review("r1", "agent-a", "2026-11-27T10:00:00Z", [finding("kept"), finding("gone", "src/a.ts", true)]),
      review("s1", "agent-a", "2026-11-28T10:00:00Z", [finding("summary")], "summary"),
    ];
    expect(ids(latestReviewFindings(reviews))).toEqual(["gone", "kept"]);
    expect(latestReviewFindings(undefined)).toEqual([]);
  });
});

describe("hasReviewRun", () => {
  it("is undefined while reviews load, false with only summaries or none, true with a review", () => {
    expect(hasReviewRun(undefined)).toBeUndefined();
    expect(hasReviewRun([])).toBe(false);
    expect(hasReviewRun([review("s1", "agent-a", "2026-11-28T10:00:00Z", [], "summary")])).toBe(false);
    expect(hasReviewRun([review("r1", "agent-a", "2026-11-28T10:00:00Z", [])])).toBe(true);
  });
});

describe("findingsByPath / counters", () => {
  const all = [finding("a1", "a.ts"), finding("a2", "a.ts"), finding("b1", "b.ts", true), finding("c1", "c.ts")];
  const byPath = findingsByPath(all);

  it("groups findings by file path", () => {
    expect(byPath.get("a.ts")?.map((f) => f.id)).toEqual(["a1", "a2"]);
    expect([...byPath.keys()]).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("counts files (not findings) with open findings, dismissed excluded", () => {
    expect(filesWithOpenFindings(["a.ts", "b.ts", "c.ts", "d.ts"], byPath)).toBe(2);
    expect(filesWithOpenFindings(["b.ts"], byPath)).toBe(0);
    expect(countOpenFindings(all)).toBe(3);
  });
});

describe("groupSummary", () => {
  const crit = { ...finding("x1", "x.ts"), severity: "CRITICAL" as const };
  const dismissedCrit = { ...finding("y1", "y.ts", true), severity: "CRITICAL" as const };

  it("counts files with open findings and takes the worst open severity", () => {
    const byPath = findingsByPath([finding("a1", "a.ts"), finding("a2", "a.ts"), crit]);
    expect(groupSummary([file("a.ts"), file("x.ts"), file("z.ts")], byPath)).toEqual({ files: 2, severity: "CRITICAL" });
  });

  it("ignores dismissed findings for both the count and the severity", () => {
    const byPath = findingsByPath([finding("a1", "a.ts"), dismissedCrit]);
    expect(groupSummary([file("a.ts"), file("y.ts")], byPath)).toEqual({ files: 1, severity: "WARNING" });
  });

  it("is null when the group has no open findings (empty group too)", () => {
    const byPath = findingsByPath([dismissedCrit]);
    expect(groupSummary([file("y.ts")], byPath)).toBeNull();
    expect(groupSummary([], byPath)).toBeNull();
  });
});
