/* SkillDetailView — /skills/:id: skill list on the left; on the right the
   skill header and tabs Config · Preview · Versions · Stats (?tab=), the same
   screen shape as /agents/:id. Everything is inline — no dialogs. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton, Tabs } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useSkill } from "@/lib/hooks/skills";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { isExternalSkill } from "@/lib/skills";
import { SkillEditor } from "../SkillEditor";
import { SkillsWorkspace } from "../SkillsWorkspace";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { resolveTab } from "./helpers";
import { s } from "./styles";

export function SkillDetailView({ id }: { id: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const tab = resolveTab(search.get("tab"));
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  const crumbLabel = skill?.name ?? t("detail.crumbSkill");

  if (isError || (!isLoading && !skill)) {
    return (
      <SkillsWorkspace activeId={id} crumbLabel={crumbLabel}>
        <ErrorState
          title={t("detail.notFound.title")}
          body={error instanceof ApiError ? error.message : t("detail.loadError")}
          onRetry={() => refetch()}
        />
      </SkillsWorkspace>
    );
  }

  if (isLoading || !skill) {
    return (
      <SkillsWorkspace activeId={id} crumbLabel={crumbLabel}>
        <div style={s.loading}>
          <Skeleton height={24} width={240} />
          <Skeleton height={200} />
        </div>
      </SkillsWorkspace>
    );
  }

  return (
    <SkillsWorkspace activeId={id} crumbLabel={crumbLabel}>
      <div style={s.head}>
        <Icon.Sparkles size={18} style={s.headIcon} />
        <h1 className="mono" style={s.title}>
          {skill.name}
        </h1>
        <SkillTypeBadge type={skill.type} />
        <Badge icon="GitCommit" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
        {isExternalSkill(skill) && <Badge color="var(--warn)">{t("preview.untrustedBadge")}</Badge>}
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={setTab} pad="0 24px" />
      </div>
      {/* key: another skill remounts the tab with fresh state (no reset effect). */}
      {tab === "config" && <SkillEditor key={skill.id} skill={skill} />}
      {tab !== "config" && (
        <div style={s.tabBody}>
          {tab === "preview" && <PreviewTab skill={skill} />}
          {tab === "versions" && <VersionsTab key={skill.id} skill={skill} />}
          {tab === "stats" && <StatsTab skill={skill} />}
        </div>
      )}
    </SkillsWorkspace>
  );
}

export default SkillDetailView;
