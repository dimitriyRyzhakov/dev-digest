import type { CSSProperties } from "react";

/** Co-located styles for SkillDetailView (header + tabs, like the agent editor). */
export const s = {
  loading: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 } satisfies CSSProperties,
  headIcon: { color: "var(--accent)" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  tabsBar: { marginTop: 14 } satisfies CSSProperties,
  tabBody: { padding: 28 } satisfies CSSProperties,
} as const;
