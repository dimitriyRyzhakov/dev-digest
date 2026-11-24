import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab (layout follows the agent editor design). */
export const s = {
  wrap: { maxWidth: 1060 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  filter: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 300,
  } satisfies CSSProperties,
  filterIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  list: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 } satisfies CSSProperties,
  row: (muted: boolean, dragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid " + (dragging ? "var(--accent)" : "var(--border)"),
    background: "var(--bg-elevated)",
    opacity: muted ? 0.55 : 1,
    outline: "none",
  }),
  handle: (enabled: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    cursor: enabled ? "grab" : "default",
    display: "inline-flex",
  }),
  name: { fontSize: 14, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
