import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@messages/en/prReview.json";
import type { PrIntentRecord } from "@/lib/types";
import { IntentCard } from "./IntentCard";

afterEach(cleanup);

function renderCard(intent: PrIntentRecord | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <IntentCard intent={intent} />
    </NextIntlClientProvider>,
  );
}

const base: PrIntentRecord = {
  pr_id: "pr1",
  intent: "Add rate limiting to public API endpoints to prevent abuse.",
  in_scope: ["Add middleware for rate limiting", "Return 429 with Retry-After"],
  out_of_scope: ["Authentication changes"],
  category: "feat",
  breaking: false,
  confidence: 0.62,
  confidence_level: "medium",
  documented: true,
  signals: [],
  sources: [
    { kind: "title", ref: "title", via: "pr", chars: 30, truncated: false },
    { kind: "description", ref: "description", via: "pr", chars: 240, truncated: false },
    { kind: "ticket", ref: "#471", via: "github", chars: 80, truncated: false },
    { kind: "spec", ref: "specs/M3-x.md", via: "head", chars: 900, truncated: false },
  ],
  unresolved_refs: [
    { kind: "link", ref: "https://linear.app/acme/issue/PAY-1", host: "linear.app", reason: "external_host" },
  ],
  risk_areas: [
    { kind: "auth", label: "Auth surface touched", origin: "code" },
    { kind: "dependency", label: "New dependency: ioredis", origin: "code" },
    { kind: "performance", label: "Adds Redis round-trip per request", origin: "model" },
  ],
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  cost_usd: 0.0004,
  input_hash: "abc",
  head_sha: "a1b2c3d",
  updated_at: "2026-11-28T00:00:00.000Z",
};

describe("IntentCard", () => {
  it("renders summary, scope columns, risk chips and a footer with confidence, sources, unresolved refs and model · cost", () => {
    renderCard(base);
    expect(screen.getByText("Intent")).toBeInTheDocument();
    expect(screen.getByText("“Add rate limiting to public API endpoints to prevent abuse.”")).toBeInTheDocument();
    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Add middleware for rate limiting")).toBeInTheDocument();
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.getByText("Authentication changes")).toBeInTheDocument();

    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getAllByTestId("risk-chip").map((c) => c.textContent)).toEqual([
      "Auth surface touched",
      "New dependency: ioredis",
      "Adds Redis round-trip per request",
    ]);

    const footer = screen.getByTestId("intent-footer");
    expect(within(footer).getByText("medium · 0.62")).toBeInTheDocument();
    expect(within(footer).getByText("description")).toBeInTheDocument();
    expect(within(footer).getByText("#471")).toBeInTheDocument();
    expect(within(footer).getByText("specs/M3-x.md")).toBeInTheDocument();
    expect(within(footer).queryByText("title")).not.toBeInTheDocument();
    expect(within(footer).getByText("deepseek/deepseek-v4-flash · $0.0004")).toBeInTheDocument();
    // Unresolved refs: muted plain text, never a link.
    const unresolved = screen.getByTestId("intent-unresolved");
    expect(unresolved).toHaveTextContent("linear.app");
    expect(unresolved).toHaveAttribute("title", "Not read — external link, never fetched");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText("Breaking")).not.toBeInTheDocument();
  });

  it("low confidence shows the hint banner; breaking badge; empty risk section and empty scope column", () => {
    renderCard({
      ...base,
      confidence_level: "low",
      confidence: 0.4,
      breaking: true,
      out_of_scope: [],
      risk_areas: [],
      unresolved_refs: [],
    });
    expect(screen.getByRole("note")).toHaveTextContent("Derived from indirect signals only — treat as a hint");
    expect(screen.getByText("Breaking")).toBeInTheDocument();
    expect(screen.getByText("low · 0.40")).toBeInTheDocument();
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("risk-chip")).toHaveLength(0);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("no intent yet → empty state", () => {
    renderCard(null);
    expect(screen.getByText("Intent is derived when a review runs")).toBeInTheDocument();
    expect(screen.queryByTestId("intent-footer")).not.toBeInTheDocument();
  });
});
