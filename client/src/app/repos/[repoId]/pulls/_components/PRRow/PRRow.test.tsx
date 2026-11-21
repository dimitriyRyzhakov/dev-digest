/** PRRow — M1 COST column (total of finished runs) + FINDINGS column (latest review of each agent). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "abc123",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: 61,
    cost_usd: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — COST column", () => {
  it("shows the latest run cost compactly", () => {
    renderRow(pr({ cost_usd: 0.012 }));
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("$0.012");
  });

  it("shows an em dash when the PR has no finished run with cost", () => {
    renderRow(pr({ cost_usd: null, score: null }));
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("—");
  });
});

describe("PRRow — COST tooltip", () => {
  it("says the value is a total of finished runs", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByTestId("run-cost-badge")).toHaveAttribute("title", "Total of finished runs: $0.014");
  });
});

describe("PRRow — FINDINGS column", () => {
  const previews = [
    {
      id: "f1",
      severity: "CRITICAL" as const,
      category: "security" as const,
      title: "Hardcoded Stripe secret key in commit",
      file: "src/config.ts",
      start_line: 12,
      end_line: 12,
      confidence: 0.98,
      rationale: "Line 12 contains a literal sk_live_ key.",
    },
  ];

  it("shows the counts; hover opens the 'N findings' popover; clicks don't navigate", () => {
    push.mockClear();
    renderRow(pr({ finding_counts: { CRITICAL: 2, WARNING: 2, SUGGESTION: 2 }, findings_preview: previews }));
    const trigger = screen.getByRole("button", { name: "Findings: 2 critical, 2 warning, 2 suggestion" });
    fireEvent.mouseEnter(trigger);
    const dialog = screen.getByRole("dialog", { name: "6 findings" });
    expect(dialog).toHaveTextContent("Hardcoded Stripe secret key in commit");
    expect(screen.getByRole("link", { name: "+5 more" })).toHaveAttribute("href", "/repos/repo-1/pulls/482?tab=findings");
    // Clicks inside the popover (portalled, but React events still bubble to the row)…
    fireEvent.click(screen.getByText("Hardcoded Stripe secret key in commit"));
    // …and on the trigger itself must not open the PR.
    fireEvent.click(trigger);
    expect(push).not.toHaveBeenCalled();
  });

  it("never reviewed → '—'; reviewed and clean → '0'", () => {
    renderRow(pr({ finding_counts: null, findings_preview: null, score: null }));
    expect(screen.queryByRole("button", { name: /^Findings:/ })).not.toBeInTheDocument();
    cleanup();
    renderRow(pr({ finding_counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, findings_preview: [] }));
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("clicking the row itself still navigates", () => {
    push.mockClear();
    renderRow(pr({}));
    fireEvent.click(screen.getByText("Add rate limiting to public API endpoints"));
    expect(push).toHaveBeenCalledWith("/repos/repo-1/pulls/482");
  });
});
