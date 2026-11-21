import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { FindingsSummary, type FindingPreviewLike } from "./FindingsSummary";
import { placePopover } from "./helpers";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const preview = (id: string, severity: FindingPreviewLike["severity"], title: string): FindingPreviewLike => ({
  id,
  severity,
  category: "security",
  title,
  file: "src/config.ts",
  start_line: 12,
  end_line: severity === "CRITICAL" ? 12 : 18,
  confidence: 0.98,
  rationale: `Rationale for ${title}`,
});

const PREVIEWS = [
  preview("c1", "CRITICAL", "Hardcoded Stripe secret key"),
  preview("w1", "WARNING", "N+1 query in user list"),
];

function renderSummary(props: Partial<React.ComponentProps<typeof FindingsSummary>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsSummary
        counts={{ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }}
        previews={PREVIEWS}
        title="2 findings"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const trigger = () => screen.getByRole("button", { name: /^Findings:/ });

describe("FindingsSummary trigger", () => {
  it("shows one item per non-zero level and hides zero levels", () => {
    const { container } = renderSummary();
    expect(container.querySelector('[data-severity="CRITICAL"]')).toHaveTextContent("1");
    expect(container.querySelector('[data-severity="WARNING"]')).toHaveTextContent("1");
    expect(container.querySelector('[data-severity="SUGGESTION"]')).toBeNull();
    expect(trigger()).toHaveAccessibleName("Findings: 1 critical, 1 warning, 0 suggestion");
  });

  it("never reviewed → '—' and no button", () => {
    renderSummary({ counts: null });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("reviewed and clean → emptyLabel, or nothing without one", () => {
    const zero = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    const { unmount } = renderSummary({ counts: zero, previews: [], emptyLabel: "0" });
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();
    const { container } = renderSummary({ counts: zero, previews: [] });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FindingsSummary popover", () => {
  it("opens on hover with the header and previews; closes after leaving", () => {
    vi.useFakeTimers();
    renderSummary();
    fireEvent.mouseEnter(trigger());
    const dialog = screen.getByRole("dialog", { name: "2 findings" });
    expect(dialog).toHaveTextContent("2 findings");
    expect(dialog).toHaveTextContent("Hardcoded Stripe secret key");
    expect(dialog).toHaveTextContent("src/config.ts:12");
    expect(dialog).toHaveTextContent("src/config.ts:12-18");
    expect(dialog).toHaveTextContent("98% conf");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");

    fireEvent.mouseLeave(trigger());
    // Moving into the popover within the grace period keeps it open.
    fireEvent.mouseEnter(dialog);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseLeave(dialog);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus and closes on Escape", () => {
    renderSummary();
    fireEvent.focus(trigger());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows '+K more' when the total exceeds the previews, as a link when moreHref is set", () => {
    renderSummary({ counts: { CRITICAL: 1, WARNING: 4, SUGGESTION: 2 }, title: "7 findings", moreHref: "/repos/r/pulls/1?tab=findings" });
    fireEvent.mouseEnter(trigger());
    expect(screen.getByRole("link", { name: "+5 more" })).toHaveAttribute("href", "/repos/r/pulls/1?tab=findings");
  });

  it("clicks on the trigger and inside the popover don't bubble to the row", () => {
    const onRowClick = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <div onClick={onRowClick}>
          <FindingsSummary counts={{ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }} previews={PREVIEWS} title="2 findings" />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(trigger());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hardcoded Stripe secret key"));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe("placePopover", () => {
  const vp = { width: 1400, height: 900 };
  it("places below the trigger by default", () => {
    expect(placePopover({ top: 100, bottom: 120, left: 300 }, vp)).toEqual({ top: 126, left: 300 });
  });
  it("flips above when there is no room below", () => {
    expect(placePopover({ top: 800, bottom: 820, left: 300 }, vp)).toEqual({ bottom: 106, left: 300 });
  });
  it("keeps the popover inside the viewport horizontally", () => {
    expect(placePopover({ top: 100, bottom: 120, left: 1300 }, vp).left).toBe(1400 - 400 - 8);
  });
});
