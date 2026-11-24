/* SkillsWorkspace — the /skills/:id, /skills/new and /skills/import screen
   frame, mirroring the agent editor: left skill list (search + Add) and the
   right panel (children) where the skill is edited inline. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { filterSkills } from "@/lib/skills";
import { s } from "./styles";

export function SkillsWorkspace({
  activeId,
  crumbLabel,
  children,
}: {
  activeId?: string;
  crumbLabel: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const list = filterSkills(skills ?? [], search, null);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: crumbLabel },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <aside style={s.sidebar}>
          <div style={s.sidebarHead}>
            <div style={s.sidebarTitleRow}>
              <h1 style={s.sidebarTitle}>{t("page.heading")}</h1>
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
          </div>
          <div style={s.sidebarList}>
            {isLoading && <Skeleton height={90} />}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === activeId}
                onOpen={() => router.push(`/skills/${sk.id}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </aside>
        <main style={s.main}>{children}</main>
      </div>
    </AppShell>
  );
}

export default SkillsWorkspace;
