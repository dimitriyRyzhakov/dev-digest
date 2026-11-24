import type { SkillInput, SkillPatch, SkillType } from "@/lib/types";

/** Editable skill fields shared by the create/edit form and the import preview. */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export const EMPTY_DRAFT: SkillDraft = { name: "", description: "", type: "custom", body: "" };

/** Seed a draft from a stored skill or an import preview (both carry these fields). */
export function toSkillDraft(src: { name: string; description: string; type: SkillType; body: string }): SkillDraft {
  return { name: src.name, description: src.description, type: src.type, body: src.body };
}

/** The server requires a non-blank name, description and body. */
export function isDraftValid(d: SkillDraft): boolean {
  return d.name.trim().length > 0 && d.description.trim().length > 0 && d.body.trim().length > 0;
}

/** Draft → PATCH /skills/:id body (source never changes on edit). */
export function toSkillPatch(d: SkillDraft): SkillPatch {
  return { name: d.name.trim(), description: d.description.trim(), type: d.type, body: d.body.trim() };
}

/** Draft → POST /skills body. */
export function toSkillInput(d: SkillDraft, source: SkillInput["source"] = "manual"): SkillInput {
  return {
    name: d.name.trim(),
    description: d.description.trim(),
    type: d.type,
    body: d.body.trim(),
    source,
  };
}

/** Rough token estimate (~4 chars/token) for the editor label; the run trace has exact counts. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 4);
}
