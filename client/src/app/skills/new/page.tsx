"use client";

import { useTranslations } from "next-intl";
import { SkillEditor } from "../_components/SkillEditor";
import { SkillsWorkspace } from "../_components/SkillsWorkspace";

/* Route: /skills/new — create a skill inline in the skills workspace. */
export default function NewSkillPage() {
  const t = useTranslations("skills");
  return (
    <SkillsWorkspace crumbLabel={t("form.createTitle")}>
      <SkillEditor />
    </SkillsWorkspace>
  );
}
