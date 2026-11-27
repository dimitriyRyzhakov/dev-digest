"use client";

import { useTranslations } from "next-intl";
import { SkillImportPanel } from "../_components/SkillImportPanel";
import { SkillsWorkspace } from "../_components/SkillsWorkspace";

/* Route: /skills/import — import a .md / .zip skill inline (preview → confirm). */
export default function ImportSkillPage() {
  const t = useTranslations("skills");
  return (
    <SkillsWorkspace crumbLabel={t("import.title")}>
      <SkillImportPanel />
    </SkillsWorkspace>
  );
}
