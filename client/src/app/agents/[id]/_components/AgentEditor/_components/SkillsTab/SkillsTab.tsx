/* SkillsTab — which workspace skills this agent sends, in what order. Rows:
   drag handle · checkbox (enabled for this agent) · name · type. Every change
   saves the full ordered list at once (optimistic). Order = order of the skill
   blocks in the agent's system prompt. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { countActive, matchesFilter, mergeAgentSkills, moveRow, toLinks, type SkillRow } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const skills = useSkills();
  const links = useAgentSkills(agent.id);
  const setLinks = useSetAgentSkills();
  const [filter, setFilter] = React.useState("");
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);

  const rows = mergeAgentSkills(skills.data ?? [], links.data ?? []);
  const filtering = filter.trim() !== "";
  // Reordering a filtered subset is ambiguous — only allow it on the full list.
  const canReorder = !filtering && !setLinks.isPending;

  const save = (next: SkillRow[]) => setLinks.mutate({ agentId: agent.id, links: toLinks(next) });
  const toggle = (index: number, checked: boolean) =>
    save(rows.map((r, i) => (i === index ? { ...r, checked } : r)));
  const move = (from: number, to: number) => {
    const next = moveRow(rows, from, to);
    if (next !== rows) save(next);
  };

  if (skills.isLoading || links.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <Skeleton height={160} />
      </div>
    );
  }
  if (skills.isError || links.isError) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          void skills.refetch();
          void links.refetch();
        }}
      />
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: countActive(rows), total: rows.length })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {rows.length === 0 ? (
        <div style={s.empty}>
          {t("skills.empty")}
          <Button kind="secondary" size="sm" icon="Sparkles" onClick={() => router.push("/skills")}>
            {t("skills.openSkills")}
          </Button>
        </div>
      ) : (
        <ul style={s.list}>
          {rows.map((row, index) =>
            matchesFilter(row, filter) ? (
              <li
                key={row.skill.id}
                data-testid={`skill-row-${row.skill.name}`}
                tabIndex={0}
                draggable={canReorder}
                onDragStart={(e) => {
                  setDragFrom(index);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (dragFrom !== null) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) move(dragFrom, index);
                  setDragFrom(null);
                }}
                onDragEnd={() => setDragFrom(null)}
                onKeyDown={(e) => {
                  if (!canReorder || !e.altKey) return;
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    move(index, index - 1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    move(index, index + 1);
                  }
                }}
                style={s.row(!row.skill.enabled, dragFrom === index)}
              >
                <span
                  aria-label={t("skills.dragHandle", { name: row.skill.name })}
                  title={t("skills.dragHandle", { name: row.skill.name })}
                  style={s.handle(canReorder)}
                >
                  <Icon.Menu size={15} />
                </span>
                <Checkbox
                  checked={row.checked}
                  onChange={(checked) => toggle(index, checked)}
                  label={
                    <span className="mono" style={s.name}>
                      {row.skill.name}
                    </span>
                  }
                />
                <span style={{ flex: 1 }} />
                {!row.skill.enabled && <span style={s.note}>{t("skills.disabledGlobally")}</span>}
                <SkillTypeBadge type={row.skill.type} />
              </li>
            ) : null,
          )}
        </ul>
      )}
      {filtering && rows.every((r) => !matchesFilter(r, filter)) && <p style={s.hint}>{t("skills.noMatch")}</p>}
    </div>
  );
}

export default SkillsTab;
