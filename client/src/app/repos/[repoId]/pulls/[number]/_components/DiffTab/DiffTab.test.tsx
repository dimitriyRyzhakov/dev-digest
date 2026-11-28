/**
 * DiffTab — M3 Smart Diff: files grouped by role (all five groups, reading
 * order), docs/boilerplate collapsed with their files closed, a Smart/Original
 * order toggle, and the flat GitHub list whenever Smart Diff is unavailable.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, PrReviewComment, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "@messages/en/prReview.json";
import shell from "@messages/en/shell.json";

// DiffTab is a container: its data comes through these hooks.
const hookState = vi.hoisted(() => ({
  smartDiff: { data: undefined as unknown, isError: false },
  reviews: [] as unknown[],
  comments: [] as unknown[],
  mutate: (() => {}) as (...args: unknown[]) => void,
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: hookState.comments }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrSmartDiff: () => hookState.smartDiff,
  usePrReviews: () => ({ data: hookState.reviews }),
  useFindingAction: () => ({ mutate: hookState.mutate, isPending: false, variables: undefined }),
  useRefreshOnRunsSettled: () => {},
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  hookState.smartDiff = { data: undefined, isError: false };
  hookState.reviews = [];
  hookState.comments = [];
  hookState.mutate = () => {};
});

const file = (path: string, marker: string): PrFile => ({
  path,
  additions: 1,
  deletions: 0,
  patch: `@@ -0,0 +1,1 @@\n+${marker}`,
});

const FILES: PrFile[] = [
  file("pnpm-lock.yaml", "lock-line"),
  file("src/a.ts", "core-line"),
  file("README.md", "docs-line"),
  file("src/a.test.ts", "tests-line"),
];

const SMART: SmartDiff = {
  groups: [
    { role: "core", files: [{ path: "src/a.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "tests", files: [{ path: "src/a.test.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "wiring", files: [] },
    { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 1, deletions: 0, finding_lines: [] }] },
  ],
  split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab prId="pr-1" files={FILES} />
    </NextIntlClientProvider>,
  );
}

/** Group header buttons carry aria-expanded; file-order buttons carry aria-pressed. */
const groupHeaders = () => screen.getAllByRole("button", { expanded: true }).concat(
  screen.queryAllByRole("button", { expanded: false }),
);

describe("DiffTab — Smart order", () => {
  it("renders all five groups in reading order with file counts (empty group shows 0 files)", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    const { container } = renderTab();
    const roles = Array.from(container.querySelectorAll("[data-role]")).map((el) => el.getAttribute("data-role"));
    expect(roles).toEqual(["core", "tests", "wiring", "docs", "boilerplate"]);
    const wiring = container.querySelector('[data-role="wiring"]') as HTMLElement;
    expect(within(wiring).getByText("Wiring")).toBeTruthy();
    expect(within(wiring).getByText("0 files")).toBeTruthy();
    expect(screen.getByText("Hooks the core into the app")).toBeTruthy();
    expect(groupHeaders()).toHaveLength(5);
  });

  it("shows header totals and marks Smart order as pressed", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    renderTab();
    expect(screen.getByText("4 files · +4 −0")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Smart order" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Original order" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("opens core/tests files but keeps docs and boilerplate collapsed", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    renderTab();
    expect(screen.getByText("core-line")).toBeTruthy();
    expect(screen.getByText("tests-line")).toBeTruthy();
    expect(screen.queryByText("README.md")).toBeNull();
    expect(screen.queryByText("pnpm-lock.yaml")).toBeNull();
    expect(screen.getByRole("button", { name: /^Docs/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: /^Boilerplate/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("expanding a docs group shows its files still closed", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /^Docs/ }));
    expect(screen.getByText("README.md")).toBeTruthy();
    expect(screen.queryByText("docs-line")).toBeNull();
  });
});

describe("DiffTab — one header", () => {
  it("renders a single header: label, totals from files, order toggle (no legacy Files changed · N files)", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    renderTab();
    expect(screen.getByText("Reviewer-ordered diff")).toBeTruthy();
    expect(screen.queryByText(/Files changed ·/)).toBeNull();
    expect(screen.getAllByText("4 files · +4 −0")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.getByText("Files changed")).toBeTruthy();
    expect(screen.queryByText("Reviewer-ordered diff")).toBeNull();
  });
});

describe("DiffTab — review empty state", () => {
  it("no kind:'review' record → 'Review not run yet' and no finding counters", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    hookState.reviews = [{ ...REVIEW, id: "s1", kind: "summary", findings: [] }];
    renderTab();
    expect(screen.getByText("Review not run yet")).toBeTruthy();
    expect(screen.queryByText(/with open findings/)).toBeNull();
  });

  it("hidden while reviews are still loading", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    hookState.reviews = undefined as unknown as unknown[];
    renderTab();
    expect(screen.queryByText("Review not run yet")).toBeNull();
  });

  it("hidden once a review ran (even with zero findings)", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    hookState.reviews = [{ ...REVIEW, findings: [] }];
    renderTab();
    expect(screen.queryByText("Review not run yet")).toBeNull();
  });
});

describe("DiffTab — Original order and fallback", () => {
  it("toggle → Original order renders the flat GitHub-order list", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    const { container } = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(container.querySelectorAll("[data-role]")).toHaveLength(0);
    const paths = FILES.map((f) => f.path);
    const rendered = screen.getAllByText((_, el) => !!el && paths.includes(el.textContent ?? "") && el.tagName === "SPAN");
    expect(rendered.map((el) => el.textContent)).toEqual(paths);
    expect(screen.getByRole("button", { name: "Original order" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Smart Diff error → flat list, tab still works", () => {
    hookState.smartDiff = { data: undefined, isError: true };
    const { container } = renderTab();
    expect(container.querySelectorAll("[data-role]")).toHaveLength(0);
    expect(screen.getByText("pnpm-lock.yaml")).toBeTruthy();
    expect(screen.getByText("docs-line")).toBeTruthy();
  });
});

const finding = (id: string, path: string, over: Partial<FindingRecord> = {}): FindingRecord => ({
  id,
  severity: "CRITICAL",
  category: "bug",
  title: `title-${id}`,
  file: path,
  start_line: 1,
  end_line: 1,
  rationale: "why",
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

const REVIEW: ReviewRecord = {
  id: "r1",
  pr_id: "pr-1",
  agent_id: "agent-a",
  run_id: null,
  agent_name: null,
  kind: "review",
  verdict: "comment",
  summary: null,
  score: null,
  model: null,
  grounding: null,
  created_at: "2026-11-28T10:00:00Z",
  findings: [
    finding("core1", "src/a.ts"),
    finding("core2", "src/a.ts", { severity: "WARNING" }),
    finding("test1", "src/a.test.ts", { dismissed_at: "2026-11-28T11:00:00Z" }),
    finding("doc1", "README.md", { severity: "SUGGESTION" }),
  ],
};

const COMMENT: PrReviewComment = {
  id: 1,
  path: "src/a.ts",
  line: 1,
  original_line: 1,
  side: "RIGHT",
  body: "github-comment-body",
  user: "octo",
  created_at: "2026-11-28T09:00:00Z",
  html_url: "https://github.com/o/r/pull/1#c1",
  in_reply_to_id: null,
  is_outdated: false,
};

const group = (container: HTMLElement, role: string) =>
  container.querySelector(`[data-role="${role}"]`) as HTMLElement;

describe("DiffTab — findings in the diff", () => {
  it("counts files (not findings) with open findings per group; dismissed don't count", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    hookState.reviews = [REVIEW];
    const { container } = renderTab();
    expect(within(group(container, "core")).getByText("1 file with open findings")).toBeTruthy();
    expect(within(group(container, "docs")).getByText("1 file with open findings")).toBeTruthy();
    expect(within(group(container, "tests")).queryByText(/with open findings/)).toBeNull();
    // the dismissed card still renders, muted
    expect(screen.getByText("title-test1")).toBeTruthy();
    expect(screen.getByText("title-core1")).toBeTruthy();
  });

  it("one toggle shows/hides finding cards and GitHub comments together; label stays", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    hookState.reviews = [REVIEW];
    hookState.comments = [COMMENT];
    renderTab();
    // visible by default because open findings exist; count = 1 comment + 3 open findings
    expect(screen.getByText("github-comment-body")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Hide comments \(4\)/ }));
    expect(screen.queryByText("title-core1")).toBeNull();
    expect(screen.queryByText("github-comment-body")).toBeNull();
    expect(screen.getByText("blocker")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Show comments \(4\)/ }));
    expect(screen.getByText("title-core1")).toBeTruthy();
  });

  it("without findings, comments start hidden as before", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    hookState.comments = [COMMENT];
    renderTab();
    expect(screen.queryByText("github-comment-body")).toBeNull();
    expect(screen.getByRole("button", { name: /Show comments \(1\)/ })).toBeTruthy();
  });

  it("diff finding cards are inline: no file:line meta row under their own line", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    hookState.reviews = [{ ...REVIEW, findings: [finding("core1", "src/a.ts")] }];
    renderTab();
    expect(screen.getByText("title-core1")).toBeTruthy();
    expect(screen.queryByText("src/a.ts:1")).toBeNull();
  });

  it("Original order still shows finding cards and file dots through the flat DiffViewer", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    hookState.reviews = [REVIEW];
    const { container } = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(container.querySelectorAll("[data-role]")).toHaveLength(0);
    expect(screen.getByText("title-core1")).toBeInTheDocument();
    // docs are no longer collapsed in the flat list, so their card shows too
    expect(screen.getByText("title-doc1")).toBeInTheDocument();
    // dots: src/a.ts + README.md; the test file's only finding is dismissed → no dot
    expect(screen.getAllByRole("img", { name: "Has open findings" })).toHaveLength(2);
    expect(screen.getAllByText("blocker").length).toBeGreaterThan(0);
  });

  it("a finding dismissed in a later reviews payload drops its group's open-findings counter", () => {
    hookState.smartDiff = { data: SMART, isError: false };
    hookState.reviews = [REVIEW];
    const { container, rerender } = renderTab();
    expect(within(group(container, "core")).getByText("1 file with open findings")).toBeInTheDocument();

    const dismissedAt = "2026-11-28T12:00:00Z";
    hookState.reviews = [
      {
        ...REVIEW,
        findings: REVIEW.findings.map((f) => (f.file === "src/a.ts" ? { ...f, dismissed_at: dismissedAt } : f)),
      },
    ];
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="pr-1" files={FILES} />
      </NextIntlClientProvider>,
    );
    expect(within(group(container, "core")).queryByText(/with open findings/)).toBeNull();
    expect(within(group(container, "docs")).getByText("1 file with open findings")).toBeInTheDocument();
  });

  it("Accept on a diff finding calls the finding action with the PR id", () => {
    const mutate = vi.fn();
    hookState.mutate = mutate;
    hookState.smartDiff = { data: SMART, isError: false };
    hookState.reviews = [{ ...REVIEW, findings: [finding("core1", "src/a.ts")] }];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(mutate).toHaveBeenCalledWith({ findingId: "core1", action: "accept", prId: "pr-1" });
  });
});
