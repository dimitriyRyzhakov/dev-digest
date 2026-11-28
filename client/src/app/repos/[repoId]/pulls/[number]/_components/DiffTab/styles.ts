import type { CSSProperties } from "react";

/** Co-located styles for the DiffTab. */
export const s = {
  /** Second header row: totals left, comments toggle + order toggle right. */
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginTop: -6,
    marginBottom: 14,
  } satisfies CSSProperties,
  totals: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  notRun: { fontSize: 12.5, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  actions: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  orderGroup: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    border: "1px solid var(--border)",
    borderRadius: 7,
  } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
} as const;
