import type { CSSProperties } from "react";

/** Co-located styles for SeverityCounters. Colours come from `SEV` at render time. */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 11px",
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    background: "transparent",
    font: "inherit",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "opacity .12s, background .12s",
  } satisfies CSSProperties,
  /** Text colour on a filled (active) pill — readable on every SEV colour in both themes. */
  activeText: "var(--bg-primary)",
  /** Opacity of the non-active pills while a filter is on. */
  mutedOpacity: 0.45,
} as const;
