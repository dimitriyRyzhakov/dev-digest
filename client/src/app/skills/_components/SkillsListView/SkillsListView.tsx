/* /skills — Skills list (M2): card grid with search + type filter. A card opens
   /skills/:id (inline editor); Add → /skills/new or /skills/import. Agents link
   skills on their own Skills tab. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Chip, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import type { SkillType } from "@/lib/types";
import { SkillCard } from "../SkillCard";
import { SKILL_TYPES, countByType, filterSkills } from "@/lib/skills";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [type, setType] = React.useState<SkillType | null>(null);

  const all = skills ?? [];
  const list = filterSkills(all, search, type);
  const counts = countByType(all);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              aria-label={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={250}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: () => router.push("/skills/new") },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => router.push("/skills/import") },
            ]}
          />
        </div>

        {all.length > 0 && (
          <div style={s.chips}>
            <Chip active={type === null} onClick={() => setType(null)} count={all.length}>
              {t("page.allTypes")}
            </Chip>
            {SKILL_TYPES.filter((ty) => counts[ty] > 0).map((ty) => (
              <Chip key={ty} active={type === ty} onClick={() => setType(type === ty ? null : ty)} count={counts[ty]}>
                {t(`listItem.type.${ty}`)}
              </Chip>
            ))}
          </div>
        )}

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && all.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => router.push("/skills/new")}
          />
        )}
        {all.length > 0 && list.length === 0 && <div style={s.noMatch}>{t("page.noMatch")}</div>}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                onOpen={() => router.push(`/skills/${sk.id}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default SkillsListView;
