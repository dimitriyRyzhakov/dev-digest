import type { IntentSource, IntentUnresolvedRef, PrIntentRecord } from "@/lib/types";
import { formatUsd } from "@/lib/format-cost";

/** `medium · 0.62` — level computed by the server, number to two decimals. */
export function formatConfidence(record: Pick<PrIntentRecord, "confidence_level" | "confidence">): string {
  return `${record.confidence_level} · ${record.confidence.toFixed(2)}`;
}

/**
 * Chip text for a source that was sent to the classifier: tickets and specs
 * show their ref (`#471`, `specs/M3-x.md`), other kinds their kind name.
 */
export function sourceChipLabel(source: IntentSource): string {
  return source.kind === "ticket" || source.kind === "spec" ? source.ref : source.kind;
}

/** Chips for the documented sources first (title is implied, not shown). */
export function visibleSources(sources: IntentSource[]): IntentSource[] {
  return sources.filter((s) => s.kind !== "title");
}

/** A short, plain-text form of an unresolved ref (never rendered as a link). */
export function unresolvedLabel(ref: IntentUnresolvedRef): string {
  const text = ref.kind === "link" && ref.host ? ref.host : ref.ref;
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

/** `deepseek/deepseek-v4-flash · $0.0004`, or null when the model is unknown. */
export function modelCostLine(record: Pick<PrIntentRecord, "model" | "cost_usd">): string | null {
  if (!record.model) return null;
  return `${record.model} · ${formatUsd(record.cost_usd)}`;
}

/** Wrap the summary in typographic quotes (design: italic quoted sentence). */
export function quoted(summary: string): string {
  return `“${summary.trim()}”`;
}
