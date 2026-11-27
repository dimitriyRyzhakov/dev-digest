import { VALID_TABS } from "./constants";

/** Unknown or missing ?tab falls back to Config. */
export function resolveTab(raw: string | null): string {
  return raw && VALID_TABS.includes(raw) ? raw : "config";
}
