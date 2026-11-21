/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — run cost (M1)", () => {
  it("a done run shows total tokens · cost", () => {
    renderRuns([run({ status: "done", tokens_in: 8000, tokens_out: 1119, cost_usd: 0.0013 })]);
    expect(screen.getByTestId("run-usage").textContent).toBe("9 119 tok · $0.0013");
  });

  it("a done run without cost data shows an em dash, not $0.00", () => {
    renderRuns([run({ status: "done", cost_usd: null })]);
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("—");
  });

  it("failed / running runs show no usage line", () => {
    renderRuns([run({ status: "failed", error: "429 quota" }), run({ run_id: "run-2", status: "running" })]);
    expect(screen.queryByTestId("run-usage")).not.toBeInTheDocument();
  });
});

describe("RunHistory — per-run findings popover (M1)", () => {
  const finding = (id: string, severity: FindingRecord["severity"], title: string): FindingRecord => ({
    id,
    severity,
    category: "perf",
    title,
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "Loop issues one query per user.",
    suggestion: null,
    confidence: 0.86,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv-1",
    accepted_at: null,
    dismissed_at: null,
  });

  function renderWithFindings(runs: RunSummary[], byRun: Map<string, FindingRecord[]>) {
    return render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <RunHistory runs={runs} onOpenTrace={() => {}} findingsByRunId={byRun} />
      </NextIntlClientProvider>,
    );
  }

  it("shows severity counts and a popover with only this run's findings", () => {
    const byRun = new Map([
      ["run-1", [finding("f1", "WARNING", "N+1 query in user list endpoint"), finding("f2", "SUGGESTION", "Extract magic number 3600")]],
      ["run-2", [finding("f3", "CRITICAL", "Other run's secret")]],
    ]);
    renderWithFindings(
      [run({ run_id: "run-1", findings_count: 2 }), run({ run_id: "run-2", findings_count: 1, ran_at: "2026-06-11T17:00:00.000Z" })],
      byRun,
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Findings: 0 critical, 1 warning, 1 suggestion" }));
    const dialog = screen.getByRole("dialog", { name: "2 findings in this run" });
    expect(dialog).toHaveTextContent("N+1 query in user list endpoint");
    expect(dialog).toHaveTextContent("Extract magic number 3600");
    expect(dialog).not.toHaveTextContent("Other run's secret");
  });

  it("falls back to the plain text when the run's review isn't loaded", () => {
    renderWithFindings([run({ findings_count: 3 })], new Map());
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Findings:/ })).not.toBeInTheDocument();
  });
});
