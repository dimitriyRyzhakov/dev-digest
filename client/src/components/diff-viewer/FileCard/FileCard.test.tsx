/**
 * FileCard + review findings (M3 Smart Diff): a finding on a rendered RIGHT line
 * shows under it with a severity label, one outside the patch lands in the
 * unmatched block, `show=false` hides cards but keeps the label, and actions go
 * back through the DiffFindingApi.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import prReview from "@messages/en/prReview.json";
import shell from "@messages/en/shell.json";
import type { DiffFindingApi } from "../findings";
import { FileCard } from "./FileCard";

afterEach(cleanup);

const FILE: PrFile = {
  path: "src/config.ts",
  additions: 2,
  deletions: 0,
  patch: "@@ -10,1 +10,3 @@\n const a = 1;\n+const key = 'sk_live';\n+export default key;",
};

const finding = (over: Partial<FindingRecord>): FindingRecord => ({
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A live key is committed.",
  suggestion: "Move it to an env var.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
  ...over,
});

function renderCard(findings: FindingRecord[], over: Partial<DiffFindingApi> = {}, file: PrFile = FILE) {
  const api: DiffFindingApi = {
    byPath: new Map([[file.path, findings]]),
    show: true,
    onAction: vi.fn(),
    pendingId: null,
    ...over,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <FileCard file={file} findings={api} />
    </NextIntlClientProvider>,
  );
  return api;
}

describe("FileCard — findings", () => {
  it("renders a finding under its line with a severity label, file dot and working Accept", () => {
    const api = renderCard([finding({})]);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Move it to an env var.")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Has open findings" })).toBeInTheDocument();
    // anchored under the line → no unmatched block
    expect(screen.queryByText(/outside the shown diff/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(api.onAction).toHaveBeenCalledWith(expect.objectContaining({ id: "f1" }), "accept");
  });

  it("lists findings outside the patch (or with no patch) in the unmatched block", () => {
    renderCard([finding({ id: "out", title: "Far away", start_line: 99, severity: "SUGGESTION" })]);
    const block = screen.getByText("1 finding outside the shown diff").parentElement as HTMLElement;
    expect(within(block).getByText("Far away")).toBeInTheDocument();
    expect(screen.queryByText("suggestion")).toBeNull(); // no line → no line label

    cleanup();
    renderCard([finding({ title: "No patch here" })], {}, { ...FILE, patch: null });
    expect(screen.getByText("1 finding outside the shown diff")).toBeInTheDocument();
    expect(screen.getByText("No patch here")).toBeInTheDocument();
  });

  it("show=false hides the cards but keeps the line label and file dot", () => {
    renderCard([finding({}), finding({ id: "out", title: "Far away", start_line: 99 })], { show: false });
    expect(screen.queryByText("Hardcoded secret")).toBeNull();
    expect(screen.queryByText("Far away")).toBeNull();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Has open findings" })).toBeInTheDocument();
  });

  it("pendingId disables only the actions of the finding in flight", () => {
    renderCard(
      [finding({ id: "busy", title: "Busy one" }), finding({ id: "idle", title: "Idle one", severity: "WARNING" })],
      { pendingId: "busy" },
    );
    const accepts = screen.getAllByRole("button", { name: "Accept" });
    const dismisses = screen.getAllByRole("button", { name: "Dismiss" });
    expect(accepts).toHaveLength(2);
    // Same line → cards render in input order: busy first, idle second.
    expect(accepts[0]).toBeDisabled();
    expect(dismisses[0]).toBeDisabled();
    expect(accepts[1]).toBeEnabled();
    expect(dismisses[1]).toBeEnabled();
  });

  it("a finding on a line that exists only on the old (LEFT, deleted) side goes to the unmatched block", () => {
    const delOnly: PrFile = {
      path: "src/config.ts",
      additions: 0,
      deletions: 2,
      // old 10 ctx, old 11-12 deleted; new side has only line 10
      patch: "@@ -10,3 +10,1 @@\n const a = 1;\n-const b = 2;\n-const c = 3;",
    };
    renderCard([finding({ title: "On a deleted line", start_line: 12, end_line: 12 })], {}, delOnly);
    const block = screen.getByText("1 finding outside the shown diff").parentElement as HTMLElement;
    expect(within(block).getByText("On a deleted line")).toBeInTheDocument();
    expect(screen.queryByText("blocker")).toBeNull(); // not anchored to the deleted line
  });

  it("show=false keeps the severity stripe on the finding line", () => {
    renderCard([finding({})], { show: false });
    const row = screen.getByText("blocker").parentElement as HTMLElement;
    expect(row).toHaveTextContent("const key = 'sk_live';");
    expect(row.style.boxShadow).toContain("inset 3px 0 0");
    // the plain context line above carries no stripe
    const ctxRow = screen.getByText("const a = 1;").parentElement as HTMLElement;
    expect(ctxRow.style.boxShadow).toBe("");
  });

  it("a dismissed finding stays (muted) but drops the label and dot", () => {
    renderCard([finding({ dismissed_at: "2026-11-28T10:00:00Z" })]);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("dismissed")).toBeInTheDocument();
    expect(screen.queryByText("blocker")).toBeNull();
    expect(screen.queryByRole("img", { name: "Has open findings" })).toBeNull();
  });
});
