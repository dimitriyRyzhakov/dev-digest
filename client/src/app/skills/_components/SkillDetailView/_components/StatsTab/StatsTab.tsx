/* StatsTab — who uses the skill and how often runs actually sent it (counted
   from run traces). Accept-rate / findings-by-category need findings to be
   attributed to skills, which arrives with the eval milestone. */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@/lib/types";
import { useSkillStats } from "@/lib/hooks/skills";
import { agentState, isoDay } from "./helpers";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading) return <Skeleton height={160} />;
  if (isError || !stats) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  const tiles = [
    { label: t("stats.usedBy"), value: String(stats.used_by), unit: t("stats.agentsUnit", { count: stats.used_by }) },
    {
      label: t("stats.pullRate"),
      value: stats.pull_rate == null ? t("stats.none") : String(stats.pull_rate),
      unit: stats.pull_rate == null ? "" : t("stats.percentUnit"),
    },
    { label: t("stats.runs30d"), value: String(stats.runs_30d), unit: "" },
    { label: t("stats.lastUsed"), value: stats.last_used_at ? isoDay(stats.last_used_at) : t("stats.none"), unit: "" },
  ];

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        {tiles.map((tile) => (
          <div key={tile.label} style={s.tile}>
            <div style={s.tileLabel}>{tile.label}</div>
            <div style={s.tileValue}>
              {tile.value}
              {tile.unit && <span style={s.tileUnit}>{tile.unit}</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={s.panel}>
        <div style={s.panelTitle}>
          <Icon.Cpu size={13} />
          {t("stats.agentsTitle")}
        </div>
        {stats.agents.length === 0 ? (
          <div style={s.empty}>{t("stats.noAgents")}</div>
        ) : (
          <ul style={s.agentList}>
            {stats.agents.map((a) => {
              const state = agentState(a);
              return (
                <li key={a.id} style={s.agentRow(state !== "active")}>
                  <Icon.Cpu size={14} style={s.agentIcon} />
                  <button type="button" style={s.agentName} onClick={() => router.push(`/agents/${a.id}?tab=skills`)}>
                    {a.name}
                  </button>
                  <span style={s.agentState}>{t(`stats.state.${state}`)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default StatsTab;
