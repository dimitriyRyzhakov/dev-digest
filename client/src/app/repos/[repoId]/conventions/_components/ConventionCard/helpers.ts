import type { ConventionStatus } from "@/lib/types";

/** Pressing an already-active Accept / Reject sends the candidate back to pending. */
export function nextStatus(current: ConventionStatus, pressed: Exclude<ConventionStatus, "pending">): ConventionStatus {
  return current === pressed ? "pending" : pressed;
}

/** Trimmed edited rule, or null when it is blank or unchanged (nothing to save). */
export function normalizeRuleEdit(draft: string, original: string): string | null {
  const rule = draft.trim().replace(/\s+/g, " ");
  if (rule.length === 0 || rule === original.trim()) return null;
  return rule;
}

export interface RuleSegment {
  text: string;
  code: boolean;
}

/** Split a rule on `backtick` spans so inline code renders as code, not literal backticks. */
export function splitInlineCode(rule: string): RuleSegment[] {
  const out: RuleSegment[] = [];
  const re = /`([^`]+)`/g;
  let last = 0;
  for (const m of rule.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: rule.slice(last, at), code: false });
    out.push({ text: m[1]!, code: true });
    last = at + m[0].length;
  }
  if (last < rule.length) out.push({ text: rule.slice(last), code: false });
  return out;
}
