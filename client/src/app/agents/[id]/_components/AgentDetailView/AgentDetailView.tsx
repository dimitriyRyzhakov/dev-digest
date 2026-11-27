/* AgentDetailView — /agents/:id screen: left agent list + Config editor
   (model + system prompt). Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents, useAgent, useUpdateAgent } from "@/lib/hooks/agents";
import { ApiError } from "@/lib/api";
import { AgentCard } from "../../../_components/AgentCard";
import { AgentEditor } from "../AgentEditor";
import { resolveTab } from "./helpers";
import { s } from "./styles";

export function AgentDetailView({ id }: { id: string }) {
  const t = useTranslations("agents");
  const search = useSearchParams();
  const router = useRouter();

  const { data: agents } = useAgents();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const update = useUpdateAgent();

  const tab = resolveTab(search.get("tab"));
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/agents/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("list.breadcrumbLab") },
    { label: t("list.breadcrumb"), href: "/agents" },
    { label: agent?.name ?? t("editor.agentFallback") },
  ];

  if (isError || (!isLoading && !agent)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <div style={s.sidebar}>
          <div style={s.sidebarHead}>
            <div style={s.sidebarTitleRow}>
              <h1 style={s.sidebarTitle}>{t("editor.listTitle")}</h1>
              <Dropdown
                width={210}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus">
                    {t("editor.add")}
                  </Button>
                }
                items={[{ label: t("editor.createFromScratch"), icon: "Edit", onClick: () => router.push("/agents") }]}
              />
            </div>
          </div>
          <div style={s.sidebarList}>
            {(agents ?? []).map((a) => (
              <AgentCard
                key={a.id}
                ag={a}
                skillCount={a.skill_count}
                active={a.id === id}
                onClick={() => router.push(`/agents/${a.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {isLoading || !agent ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.main}>
            <div style={s.mainHead}>
              <Icon.Cpu size={18} style={s.cpuIcon} />
              <h1 style={s.mainTitle}>{agent.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {agent.provider}/{agent.model}
              </Badge>
              {!agent.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
              <div style={s.mainActions}>
                <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push("/")}>
                  {t("editor.runOnPr")}
                </Button>
              </div>
            </div>
            <div style={s.editorScroll}>
              <AgentEditor agent={agent} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
