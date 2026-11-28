import type { CSSProperties } from "react";

/** Co-located styles for a Smart Diff role group. */
export const s = {
  group: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  /** Sticks under the sticky PR header inside AppFrame's scrolling <main>;
      `--pr-header-h` is published by PrDetailHeader/useStickyOffset. */
  header: {
    position: "sticky",
    top: "var(--pr-header-h, 0px)",
    zIndex: 3,
    background: "var(--bg-primary)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "6px 4px",
    border: "none",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
    textAlign: "left",
    color: "inherit",
    font: "inherit",
  } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)", flexShrink: 0 } satisfies CSSProperties,
  hint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  findingCount: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,
  /** Visually hidden, still read by screen readers. */
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
} as const;

/** Severity dot of the group's open-findings counter. */
export function findingDotFor(color: string): CSSProperties {
  return { width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 };
}

/** Small coloured square marking the role. */
export function markerFor(color: string): CSSProperties {
  return { width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 };
}

/** Chevron rotates 90deg when the group is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    flexShrink: 0,
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}
