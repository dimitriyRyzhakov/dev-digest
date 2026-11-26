/* SkillFields — name / description / type / markdown body (with a token estimate).
   Controlled: the parent owns the draft (create, edit and import share it).
   Rendering lives in the skill's Preview tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, Textarea, TextInput } from "@devdigest/ui";
import type { SkillType } from "@/lib/types";
import { SKILL_TYPES } from "@/lib/skills";
import { BODY_ROWS, DESCRIPTION_ROWS } from "./constants";
import { estimateTokens, type SkillDraft } from "./helpers";
import { s } from "./styles";

export function SkillFields({
  draft,
  onChange,
  bodyHint,
}: {
  draft: SkillDraft;
  onChange: (next: SkillDraft) => void;
  bodyHint?: React.ReactNode;
}) {
  const t = useTranslations("skills");
  const set =
    <K extends keyof SkillDraft>(key: K) =>
    (value: SkillDraft[K]) =>
      onChange({ ...draft, [key]: value });

  return (
    <>
      <div style={s.row}>
        <FormField label={t("form.name")} required>
          <TextInput value={draft.name} onChange={set("name")} placeholder={t("form.namePlaceholder")} mono />
        </FormField>
        <FormField label={t("form.type")}>
          <SelectInput
            value={draft.type}
            onChange={(v) => set("type")(v as SkillType)}
            options={SKILL_TYPES.map((type) => ({ value: type, label: t(`listItem.type.${type}`) }))}
          />
        </FormField>
      </div>
      <FormField label={t("form.description")} required hint={t("form.descriptionHint")}>
        <Textarea
          value={draft.description}
          onChange={set("description")}
          rows={DESCRIPTION_ROWS}
          placeholder={t("form.descriptionPlaceholder")}
        />
      </FormField>
      <FormField
        label={
          <>
            {t("form.body")}
            <span style={s.tokens}>{t("form.tokens", { count: estimateTokens(draft.body) })}</span>
          </>
        }
        required
        hint={bodyHint}
      >
        <Textarea value={draft.body} onChange={set("body")} rows={BODY_ROWS} mono placeholder={t("form.bodyPlaceholder")} />
      </FormField>
    </>
  );
}

export default SkillFields;
