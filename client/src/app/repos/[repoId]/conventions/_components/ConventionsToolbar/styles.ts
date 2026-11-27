import type { CSSProperties } from "react";

/** Co-located styles for ConventionsToolbar. */
export const s = {
  bar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  left: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
