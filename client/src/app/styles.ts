import type { CSSProperties } from "react";

/** Styles for the root route files (home, error, not-found). */
export const s = {
  loading: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 } satisfies CSSProperties,
  redirecting: { color: "var(--text-secondary)", marginBottom: 14 } satisfies CSSProperties,
  fallbackActions: { display: "flex", justifyContent: "center", marginTop: 4 } satisfies CSSProperties,
};
