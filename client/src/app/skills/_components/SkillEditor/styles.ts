import type { CSSProperties } from "react";

/** Co-located styles for SkillEditor (mirrors the agent editor head + Config tab). */
export const s = {
  head: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 14px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  headIcon: { color: "var(--accent)" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  body: { padding: 28 } satisfies CSSProperties,
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  version: {
    marginLeft: 10,
    fontSize: 12,
    padding: "1px 8px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono, monospace)",
  } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  notice: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid color-mix(in srgb, var(--warn) 45%, transparent)",
    background: "color-mix(in srgb, var(--warn) 10%, transparent)",
    fontSize: 13,
    lineHeight: 1.45,
    marginBottom: 20,
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 10, alignItems: "center" } satisfies CSSProperties,
  invalid: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
