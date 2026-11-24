import type { CSSProperties } from "react";

/** Co-located styles for SkillFields. */
export const s = {
  row: { display: "grid", gridTemplateColumns: "1fr 180px", gap: 14 } satisfies CSSProperties,
  tokens: { marginLeft: 8, fontSize: 12, fontWeight: 400, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
