/**
 * useStickyOffset — publishes the sticky header's height as `--pr-header-h`
 * on its parent (the scroll container), follows resizes, and removes the
 * variable + stops observing on unmount.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { PR_HEADER_HEIGHT_VAR, useStickyOffset } from "./useStickyOffset";

/** Minimal ResizeObserver double: lets the test fire a resize by hand. */
const observers: FakeResizeObserver[] = [];
class FakeResizeObserver {
  observed: Element[] = [];
  disconnected = false;
  constructor(readonly cb: () => void) {
    observers.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
}

function Header() {
  const ref = useStickyOffset<HTMLDivElement>();
  return <div ref={ref}>sticky header</div>;
}

function renderInContainer() {
  return render(
    <main data-testid="scroll-container">
      <Header />
    </main>,
  );
}

afterEach(() => {
  cleanup();
  observers.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useStickyOffset", () => {
  it("sets --pr-header-h on the parent, follows resizes and cleans up on unmount", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(64);

    const { unmount } = renderInContainer();
    const container = screen.getByTestId("scroll-container");
    expect(container.style.getPropertyValue(PR_HEADER_HEIGHT_VAR)).toBe("64px");
    expect(observers).toHaveLength(1);
    const ro = observers[0]!;
    expect(ro.observed).toEqual([screen.getByText("sticky header")]);

    height.mockReturnValue(96);
    act(() => ro.cb());
    expect(container.style.getPropertyValue(PR_HEADER_HEIGHT_VAR)).toBe("96px");

    unmount();
    expect(container.style.getPropertyValue(PR_HEADER_HEIGHT_VAR)).toBe("");
    expect(ro.disconnected).toBe(true);
  });

  it("does nothing (and does not throw) where ResizeObserver is unavailable", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    renderInContainer();
    expect(screen.getByTestId("scroll-container").style.getPropertyValue(PR_HEADER_HEIGHT_VAR)).toBe("");
  });
});
