import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView. */
export const s = {
  page: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "28px 32px 48px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 } satisfies CSSProperties,
  headerText: { minWidth: 0 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { margin: "6px 0 0", fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  list: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 } satisfies CSSProperties,
} as const;
