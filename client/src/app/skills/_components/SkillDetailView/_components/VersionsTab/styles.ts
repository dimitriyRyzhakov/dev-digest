import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  sub: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  list: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 } satisfies CSSProperties,
  row: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowHead: { display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" } satisfies CSSProperties,
  ver: (current: boolean): CSSProperties => ({
    fontSize: 12,
    fontFamily: "var(--font-mono, monospace)",
    padding: "2px 8px",
    borderRadius: 4,
    background: current ? "var(--accent-bg)" : "var(--bg-hover)",
    color: current ? "var(--accent)" : "var(--text-secondary)",
  }),
  rowText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  firstLine: {
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  current: { fontSize: 12, color: "var(--ok)", display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  diff: {
    margin: 0,
    padding: "10px 16px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    lineHeight: 1.5,
    overflow: "auto",
    maxHeight: 360,
  } satisfies CSSProperties,
  diffLine: (kind: "same" | "add" | "del"): CSSProperties => ({
    display: "block",
    whiteSpace: "pre-wrap",
    color: kind === "add" ? "var(--ok)" : kind === "del" ? "var(--crit)" : "var(--text-muted)",
    background:
      kind === "add"
        ? "color-mix(in srgb, var(--ok) 10%, transparent)"
        : kind === "del"
          ? "color-mix(in srgb, var(--crit) 10%, transparent)"
          : "transparent",
  }),
} as const;
