import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "@messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: TRACE, isLoading: false }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";
import { TraceBody } from "./_components/TraceBody";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
    // M1 — COST tile next to DURATION / TOKENS / FINDINGS
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.060")).toBeInTheDocument();
    // TOKENS tile uses the shared K-formatter (was "12k→1.5k"; "1k→0.0k" on small runs)
    expect(screen.getByText("12K→1.5K")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});

describe("M2 per-skill blocks in Prompt assembly", () => {
  const SKILL_BLOCKS = [
    { skill_id: "sk1", name: "no-secrets-in-logs", version: 2, tokens: 120 },
    { skill_id: "sk2", name: "rate-limit-endpoints", version: 1, tokens: 1 },
  ];

  it("lists each skill with its version and tokens, plus the total", () => {
    const trace: RunTrace = { ...TRACE, prompt_assembly: { ...TRACE.prompt_assembly, skill_blocks: SKILL_BLOCKS } };
    renderWithIntl(<TraceBody trace={trace} findings={[]} />);
    fireEvent.click(screen.getByText("Prompt assembly")); // section is collapsed by default
    const blocks = screen.getByTestId("skill-blocks");
    expect(within(blocks).getByText("Skills sent (2)")).toBeInTheDocument();
    expect(within(blocks).getByText("no-secrets-in-logs")).toHaveClass("mono");
    expect(within(blocks).getByText("v2")).toBeInTheDocument();
    expect(within(blocks).getByText("120 tokens")).toBeInTheDocument();
    expect(within(blocks).getByText("rate-limit-endpoints")).toBeInTheDocument();
    expect(within(blocks).getByText("1 token")).toBeInTheDocument();
    expect(within(blocks).getByText("Total")).toBeInTheDocument();
    expect(within(blocks).getByText("121 tokens")).toBeInTheDocument();
  });

  it("renders no breakdown for old traces without skill_blocks, keeping the Skills block", () => {
    const trace: RunTrace = { ...TRACE, prompt_assembly: { ...TRACE.prompt_assembly, skill_blocks: null } };
    renderWithIntl(<TraceBody trace={trace} findings={[]} />);
    fireEvent.click(screen.getByText("Prompt assembly")); // section is collapsed by default
    expect(screen.queryByTestId("skill-blocks")).not.toBeInTheDocument();
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
  });
});
