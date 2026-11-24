/* SkillTypeBadge — the coloured type pill on skill cards and agent skill rows. */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@/lib/types";
import { SKILL_TYPE_COLOR } from "./constants";

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[type];
  return (
    <Badge color={color} bg={`color-mix(in srgb, ${color} 14%, transparent)`}>
      {t(`listItem.type.${type}`)}
    </Badge>
  );
}

export default SkillTypeBadge;
