/* SkillEditor — the skill Config tab (and /skills/new): inline editor in the
   right panel, like the agent Config tab: name, description, type, markdown body, enabled. With `skill` it edits
   (a changed body → new version); without it, it creates and opens the new skill. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@/lib/types";
import { useCreateSkill, useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { isExternalSkill } from "@/lib/skills";
import { EMPTY_DRAFT, SkillFields, isDraftValid, toSkillDraft, toSkillInput, toSkillPatch, type SkillDraft } from "../SkillFields";
import { s } from "./styles";

export function SkillEditor({ skill }: { skill?: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  // Seeded once; the route keys this component by skill id, so switching skills remounts it.
  const [draft, setDraft] = React.useState<SkillDraft>(() => (skill ? toSkillDraft(skill) : EMPTY_DRAFT));
  const valid = isDraftValid(draft);
  const pending = create.isPending || update.isPending;
  const bodyChanged = !!skill && draft.body.trim() !== skill.body;
  const imported = !!skill && isExternalSkill(skill);

  const save = async () => {
    if (!valid) return;
    try {
      if (skill) {
        const saved = await update.mutateAsync({ id: skill.id, patch: toSkillPatch(draft) });
        toast.success(t("form.saved", { version: saved.version }));
      } else {
        const saved = await create.mutateAsync(toSkillInput(draft));
        toast.success(t("form.created", { name: saved.name }));
        router.replace(`/skills/${saved.id}`);
      }
    } catch {
      // The global mutation handler already toasted the server's message (e.g. duplicate name).
    }
  };

  const cancel = () => (skill ? setDraft(toSkillDraft(skill)) : router.push("/skills"));

  const remove = () => {
    if (!skill || !window.confirm(t("preview.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("preview.deleted"));
        router.push("/skills");
      },
    });
  };

  return (
    <>
      {!skill && (
        <div style={s.head}>
          <Icon.Sparkles size={18} style={s.headIcon} />
          <h1 style={s.title}>{t("form.createTitle")}</h1>
        </div>
      )}
      <div style={s.body}>
        <div style={s.wrap}>
          <div style={s.header}>
            <h2 style={s.h2}>{t("form.configuration")}</h2>
            {skill && <span style={s.version}>{t("preview.version", { version: skill.version })}</span>}
            {skill && (
              <label style={s.enabledLabel}>
                {t("preview.enabled")}
                <Toggle
                  on={skill.enabled}
                  onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
                  size={16}
                />
              </label>
            )}
          </div>
          {imported && (
            <div role="note" style={s.notice}>
              {t("preview.untrustedNotice")}
            </div>
          )}
          <SkillFields
            draft={draft}
            onChange={setDraft}
            bodyHint={bodyChanged ? t("form.versionHint", { version: skill.version + 1 }) : t("form.bodyHint")}
          />
          <div style={s.actions}>
            <Button kind="primary" icon="Check" onClick={save} disabled={!valid || pending}>
              {pending ? t("form.saving") : skill ? t("form.save") : t("form.create")}
            </Button>
            <Button kind="secondary" onClick={cancel}>
              {t("form.cancel")}
            </Button>
            {!valid && <span style={s.invalid}>{t("form.required")}</span>}
            <span style={s.spacer} />
            {skill && (
              <Button kind="danger" size="sm" icon="Trash" onClick={remove} disabled={del.isPending}>
                {t("preview.delete")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default SkillEditor;
