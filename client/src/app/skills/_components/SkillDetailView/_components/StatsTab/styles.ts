import type { CSSProperties } from "react";

/** Co-located styles for StatsTab (tiles + agents panel, as in the design). */
export const s = {
  wrap: { maxWidth: 980 } satisfies CSSProperties,
  tiles: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 16 } satisfies CSSProperties,
  tile: {
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  tileLabel: { fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" } satisfies CSSProperties,
  tileValue: { fontSize: 28, fontWeight: 700, marginTop: 8 } satisfies CSSProperties,
  tileUnit: { fontSize: 13, fontWeight: 400, color: "var(--text-muted)", marginLeft: 4 } satisfies CSSProperties,
  panel: {
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  panelTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 12,
  } satisfies CSSProperties,
  agentList: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 } satisfies CSSProperties,
  agentRow: (muted: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 14,
    opacity: muted ? 0.6 : 1,
  }),
  agentIcon: { color: "var(--accent)" } satisfies CSSProperties,
  agentName: { flex: 1, border: "none", background: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", padding: 0 } satisfies CSSProperties,
  agentState: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
