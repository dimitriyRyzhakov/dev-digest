import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@/lib/types";
import conventionsMessages from "@messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";
import { nextStatus, normalizeRuleEdit } from "./helpers";

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  rule: "Redis access goes through src/lib/redis.ts singleton",
  evidence_path: "src/lib/redis.ts",
  evidence_snippet: "export const redis = new Redis(config.redisUrl);",
  evidence_start_line: 1,
  evidence_end_line: 9,
  confidence: 0.85,
  accepted: false,
  status: "pending",
  created_at: "2026-11-25T10:00:00.000Z",
};

function renderCard(candidate = CANDIDATE, onPatch = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: conventionsMessages }}>
      <ConventionCard
        candidate={candidate}
        evidenceHref="https://github.com/acme/payments-api/blob/main/src/lib/redis.ts#L1-L9"
        onPatch={onPatch}
      />
    </NextIntlClientProvider>,
  );
  return onPatch;
}

afterEach(cleanup);

describe("ConventionCard", () => {
  it("tags the category and the status; a pending card without category has no tags", () => {
    renderCard({ ...CANDIDATE, category: "api layer", status: "accepted", accepted: true });
    expect(screen.getByText("api layer")).toBeTruthy();
    // "Accepted" = status tag + pressed Accept button.
    expect(screen.getAllByText("Accepted")).toHaveLength(2);
    cleanup();
    renderCard({ ...CANDIDATE, category: null });
    expect(screen.queryByText("api layer")).toBeNull();
    expect(screen.queryByText("Accepted")).toBeNull();
  });

  it("shows the rule, evidence location linked to GitHub, snippet and confidence", () => {
    renderCard();
    expect(screen.getByText(CANDIDATE.rule)).toBeTruthy();
    const link = screen.getByRole("link", { name: "src/lib/redis.ts:1-9" });
    expect(link.getAttribute("href")).toBe("https://github.com/acme/payments-api/blob/main/src/lib/redis.ts#L1-L9");
    expect(screen.getByText(CANDIDATE.evidence_snippet)).toBeTruthy();
    expect(screen.getByText("85%")).toBeTruthy();
  });

  it("accept and reject send the status; pressing an active one returns to pending", () => {
    const onPatch = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onPatch).toHaveBeenLastCalledWith({ status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onPatch).toHaveBeenLastCalledWith({ status: "rejected" });

    cleanup();
    const onPatch2 = renderCard({ ...CANDIDATE, status: "accepted", accepted: true });
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
    expect(onPatch2).toHaveBeenLastCalledWith({ status: "pending" });
  });

  it("edits the rule inline: Enter saves the trimmed text, Esc cancels", () => {
    const onPatch = renderCard();
    fireEvent.click(screen.getByText(CANDIDATE.rule));
    const box = screen.getByLabelText("Convention rule") as HTMLTextAreaElement;
    // Opens with the whole rule selected, so typing replaces it.
    expect(document.activeElement).toBe(box);
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, CANDIDATE.rule.length]);
    fireEvent.change(box, { target: { value: "  Use the shared redis client  " } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onPatch).toHaveBeenCalledWith({ rule: "Use the shared redis client" });

    onPatch.mockReset();
    fireEvent.click(screen.getByText(CANDIDATE.rule));
    const box2 = screen.getByLabelText("Convention rule");
    fireEvent.change(box2, { target: { value: "something else" } });
    fireEvent.keyDown(box2, { key: "Escape" });
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeTruthy();
  });
});

describe("ConventionCard helpers", () => {
  it("nextStatus toggles back to pending", () => {
    expect(nextStatus("pending", "accepted")).toBe("accepted");
    expect(nextStatus("accepted", "accepted")).toBe("pending");
    expect(nextStatus("accepted", "rejected")).toBe("rejected");
  });
  it("normalizeRuleEdit ignores blank or unchanged text", () => {
    expect(normalizeRuleEdit("  ", "a")).toBeNull();
    expect(normalizeRuleEdit(" a ", "a")).toBeNull();
    expect(normalizeRuleEdit("b  c", "a")).toBe("b c");
  });
});
