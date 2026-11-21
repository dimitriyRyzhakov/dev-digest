import type { Severity } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "@/lib/findings";

/** Total findings across all contract levels. */
export function totalOf(counts: Record<Severity, number>): number {
  return SEVERITY_LEVELS.reduce((sum, l) => sum + (counts[l] ?? 0), 0);
}

/** Levels to render in the trigger — zero-count levels are hidden (M1 rule). */
export function visibleLevels(counts: Record<Severity, number>): Severity[] {
  return SEVERITY_LEVELS.filter((l) => (counts[l] ?? 0) > 0);
}

/** `file:12` or `file:12-18`. */
export function lineRef(file: string, start: number, end: number): string {
  return end > start ? `${file}:${start}-${end}` : `${file}:${start}`;
}

/** Popover placement: below the trigger, flipped above when it would overflow the viewport. */
export const POPOVER_WIDTH = 400;
export const POPOVER_MAX_HEIGHT = 360;
const GAP = 6;
const MARGIN = 8;

export function placePopover(
  rect: { top: number; bottom: number; left: number },
  viewport: { width: number; height: number },
): { top?: number; bottom?: number; left: number } {
  const left = Math.max(MARGIN, Math.min(rect.left, viewport.width - POPOVER_WIDTH - MARGIN));
  const spaceBelow = viewport.height - rect.bottom;
  if (spaceBelow < POPOVER_MAX_HEIGHT + GAP && rect.top > spaceBelow) {
    return { bottom: viewport.height - rect.top + GAP, left };
  }
  return { top: rect.bottom + GAP, left };
}
