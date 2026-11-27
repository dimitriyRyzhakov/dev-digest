import type { ConventionCandidate, ConventionSkillInput } from "@/lib/types";
import { buildSkillBody, defaultSkillName, type SkillBodyText } from "../../helpers";

/** Editable fields of the merged skill (type/source are fixed by the server). */
export interface ConventionSkillDraft {
  name: string;
  description: string;
  body: string;
  enabled: boolean;
}

export interface InitialDraftText extends SkillBodyText {
  /** Interpolated default description, e.g. "3 house conventions extracted from payments-api". */
  description: string;
}

/** Prefilled draft from the accepted candidates: `<repo>-conventions`, enabled. */
export function buildInitialDraft(
  repoName: string,
  accepted: ConventionCandidate[],
  text: InitialDraftText,
): ConventionSkillDraft {
  const name = defaultSkillName(repoName);
  return {
    name,
    description: text.description,
    body: buildSkillBody(name, accepted, text),
    enabled: true,
  };
}

/** The server requires a non-blank name, description and body. */
export function isSkillDraftValid(d: ConventionSkillDraft): boolean {
  return d.name.trim().length > 0 && d.description.trim().length > 0 && d.body.trim().length > 0;
}

/** Draft → POST /repos/:id/conventions/skill body. */
export function toConventionSkillInput(d: ConventionSkillDraft): ConventionSkillInput {
  return {
    name: d.name.trim(),
    description: d.description.trim(),
    body: d.body.trim(),
    enabled: d.enabled,
  };
}
