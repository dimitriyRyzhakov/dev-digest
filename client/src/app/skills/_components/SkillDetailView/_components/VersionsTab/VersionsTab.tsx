/* VersionsTab — body snapshots, newest first. Each save of a changed body
   creates one; Diff compares a snapshot with the current body, Restore saves
   that body again (as a NEW version, history is never rewritten). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@/lib/types";
import { useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { diffLines, firstLine, shortDate } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [open, setOpen] = React.useState<number | null>(null);

  const restore = (version: number, body: string) =>
    update.mutate(
      { id: skill.id, patch: { body } },
      { onSuccess: (saved) => toast.success(t("versions.restored", { from: version, version: saved.version })) },
    );

  if (isLoading) return <Skeleton height={160} />;
  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;
  const list = versions ?? [];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        <Badge>{t("versions.count", { count: list.length })}</Badge>
      </div>
      <p style={s.sub}>{t("versions.subtitle")}</p>
      <ul style={s.list}>
        {list.map((v) => {
          const current = v.version === skill.version;
          return (
            <li key={v.version} style={s.row}>
              <div style={s.rowHead}>
                <span style={s.ver(current)}>{t("preview.version", { version: v.version })}</span>
                <div style={s.rowText}>
                  <div style={s.firstLine}>{firstLine(v.body) || t("versions.empty")}</div>
                  <div style={s.meta}>
                    {shortDate(v.created_at)} · {t("versions.chars", { count: v.body.length })}
                  </div>
                </div>
                {current ? (
                  <span style={s.current}>
                    <Icon.CheckCircle size={12} />
                    {t("versions.current")}
                  </span>
                ) : (
                  <>
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="Eye"
                      onClick={() => setOpen(open === v.version ? null : v.version)}
                    >
                      {t("versions.diff")}
                    </Button>
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="History"
                      onClick={() => restore(v.version, v.body)}
                      disabled={update.isPending}
                    >
                      {t("versions.restore")}
                    </Button>
                  </>
                )}
              </div>
              {open === v.version && !current && (
                <pre className="mono" style={s.diff} aria-label={t("versions.diffLabel", { version: v.version })}>
                  {diffLines(v.body, skill.body).map((d, i) => (
                    <span key={i} style={s.diffLine(d.kind)}>
                      {d.kind === "add" ? "+ " : d.kind === "del" ? "- " : "  "}
                      {d.text}
                    </span>
                  ))}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default VersionsTab;
