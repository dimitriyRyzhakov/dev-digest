import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function finding(
  id: string,
  severity: FindingRecord["severity"],
  title: string,
  confidence = 0.9,
): FindingRecord {
  return {
    id,
    severity,
    category: "security",
    title,
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "Rationale.",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const FINDINGS: FindingRecord[] = [finding("f1", "CRITICAL", "Hardcoded secret", 0.95)];

/** 1 CRITICAL · 3 WARNING (one low-confidence) · 1 SUGGESTION */
const MIXED: FindingRecord[] = [
  finding("c1", "CRITICAL", "Crit one"),
  finding("w1", "WARNING", "Warn one"),
  finding("w2", "WARNING", "Warn two"),
  finding("w3", "WARNING", "Warn low", 0.5),
  finding("s1", "SUGGESTION", "Sugg one"),
];
const ALL_TITLES = ["Crit one", "Warn one", "Warn two", "Warn low", "Sugg one"];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const pill = (name: string) => screen.getByRole("button", { name });
const titlesShown = () => ALL_TITLES.filter((t) => screen.queryByText(t));

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity counters + filter", () => {
  it("shows one counter per level with the run's counts", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(pill("1 CRITICAL")).toBeInTheDocument();
    expect(pill("3 WARNING")).toBeInTheDocument();
    expect(pill("1 SUGGESTION")).toBeInTheDocument();
    for (const name of ["1 CRITICAL", "3 WARNING", "1 SUGGESTION"]) {
      expect(pill(name)).toHaveAttribute("aria-pressed", "false");
    }
    expect(titlesShown()).toEqual(ALL_TITLES);
  });

  it("clicking a level keeps only its findings and marks it pressed", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(pill("3 WARNING"));
    expect(pill("3 WARNING")).toHaveAttribute("aria-pressed", "true");
    expect(titlesShown()).toEqual(["Warn one", "Warn two", "Warn low"]);
  });

  it("clicking another level moves the selection", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(pill("3 WARNING"));
    fireEvent.click(pill("1 CRITICAL"));
    expect(pill("1 CRITICAL")).toHaveAttribute("aria-pressed", "true");
    expect(pill("3 WARNING")).toHaveAttribute("aria-pressed", "false");
    expect(titlesShown()).toEqual(["Crit one"]);
  });

  it("clicking the active level again clears the filter", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(pill("1 SUGGESTION"));
    fireEvent.click(pill("1 SUGGESTION"));
    expect(pill("1 SUGGESTION")).toHaveAttribute("aria-pressed", "false");
    expect(titlesShown()).toEqual(ALL_TITLES);
  });

  it("works together with Hide low confidence (counts and list)", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(pill("2 WARNING")).toBeInTheDocument();
    fireEvent.click(pill("2 WARNING"));
    expect(titlesShown()).toEqual(["Warn one", "Warn two"]);
  });

  it("hides a level with no findings", () => {
    const noCritical = MIXED.filter((f) => f.severity !== "CRITICAL");
    renderWithIntl(<FindingsPanel findings={noCritical} prId="pr1" />);
    expect(screen.queryByRole("button", { name: /CRITICAL/ })).not.toBeInTheDocument();
    expect(pill("3 WARNING")).toBeInTheDocument();
    expect(pill("1 SUGGESTION")).toBeInTheDocument();
  });

  it("keeps the active level visible at 0 and shows the empty state", () => {
    const lowSuggestion = [finding("w1", "WARNING", "Warn one"), finding("s1", "SUGGESTION", "Sugg low", 0.3)];
    renderWithIntl(<FindingsPanel findings={lowSuggestion} prId="pr1" />);
    fireEvent.click(pill("1 SUGGESTION"));
    fireEvent.click(screen.getByRole("switch"));
    expect(pill("0 SUGGESTION")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    fireEvent.click(pill("0 SUGGESTION"));
    expect(screen.queryByRole("button", { name: /SUGGESTION/ })).not.toBeInTheDocument();
    expect(screen.getByText("Warn one")).toBeInTheDocument();
  });

  it("renders no counters row for an empty run", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Filter by severity" })).not.toBeInTheDocument();
  });
});
