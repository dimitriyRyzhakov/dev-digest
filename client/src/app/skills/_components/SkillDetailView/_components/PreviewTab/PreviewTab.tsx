/* PreviewTab — the saved skill body rendered as markdown, i.e. the text the
   reviewing agent receives in its system prompt. */
"use client";

import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@/lib/types";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("detail.previewTitle")}</h2>
      <p style={s.sub}>{t("detail.previewSubtitle")}</p>
      <div className="skill-md" style={s.box}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}

export default PreviewTab;
