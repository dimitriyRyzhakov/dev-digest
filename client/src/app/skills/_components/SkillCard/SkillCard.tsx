/* SkillCard — icon tinted by type, name, enabled toggle, delete, description,
   type badge + source, "needs vetting" for imported skills. Click → editor. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@/lib/types";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { SKILL_TYPE_COLOR, SkillTypeBadge } from "@/components/skill-type-badge";
import { isExternalSkill } from "@/lib/skills";
import { SOURCE_ICON } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onOpen,
  onToggle,
}: {
  skill: Skill;
  /** Highlighted as the skill open in the editor (sidebar list). */
  active?: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const del = useDeleteSkill();
  const color = SKILL_TYPE_COLOR[skill.type];
  const SourceIcon = Icon[SOURCE_ICON[skill.source]];
  const external = isExternalSkill(skill);

  const remove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t("preview.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, { onSuccess: () => active && router.push("/skills") });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-current={active ? "page" : undefined}
      style={s.card(skill.enabled, !!active)}
    >
      <div style={s.headerRow}>
        <span style={s.iconBox(color)}>
          <Icon.Sparkles size={13} />
        </span>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {/* The label's hidden text names the switch for screen readers. */}
        <label onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} style={s.toggle}>
          <span style={s.srOnly}>{t("page.toggleLabel", { name: skill.name })}</span>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </label>
        <button type="button" onClick={remove} disabled={del.isPending} aria-label={t("preview.delete")} title={t("preview.delete")} style={s.trash}>
          <Icon.Trash size={13} />
        </button>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <span style={s.source}>
          <SourceIcon size={11} />
          {t(`listItem.source.${skill.source}`)}
        </span>
        <span className="mono" style={s.version}>
          {t("preview.version", { version: skill.version })}
        </span>
      </div>
      {external && (
        <div>
          <Badge color="var(--warn)" icon="AlertTriangle">
            {t("listItem.needsVetting")}
          </Badge>
        </div>
      )}
    </div>
  );
}

export default SkillCard;
