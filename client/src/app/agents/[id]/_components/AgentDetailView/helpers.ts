/** Tabs the editor ships today; unknown ?tab values fall back to the first. */
export const VALID_TABS = ["config"] as const;

export function resolveTab(raw: string | null): string {
  return raw && (VALID_TABS as readonly string[]).includes(raw) ? raw : VALID_TABS[0];
}
