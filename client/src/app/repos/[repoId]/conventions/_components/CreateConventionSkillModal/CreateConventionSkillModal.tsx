/* CreateConventionSkillModal — merge the accepted candidates into one skill.
   Prefilled draft (name, description, markdown body) is fully editable; type is
   fixed to `convention`, the server stores source `extracted`. A taken name
   (409) shows inline under Name. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, Modal, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useSaveConventionSkill } from "@/lib/hooks/conventions";
import { estimateTokens } from "@/lib/skills";
import type { ConventionCandidate, Skill } from "@/lib/types";
import { BODY_ROWS, MODAL_WIDTH } from "./constants";
import { buildInitialDraft, isSkillDraftValid, toConventionSkillInput, type ConventionSkillDraft } from "./helpers";
import { s } from "./styles";

export function CreateConventionSkillModal({
  repoId,
  repoName,
  accepted,
  onClose,
  onSaved,
}: {
  repoId: string;
  repoName: string;
  accepted: ConventionCandidate[];
  onClose: () => void;
  onSaved: (skill: Skill) => void;
}) {
  const t = useTranslations("conventions.modal");
  const td = useTranslations("conventions.draft");
  // Seeded once on open; later edits to the list don't overwrite the user's draft.
  const [draft, setDraft] = React.useState<ConventionSkillDraft>(() =>
    buildInitialDraft(repoName, accepted, {
      description: td("description", { count: accepted.length, repo: repoName }),
      intro: td("intro", { repo: repoName }),
      detectedIn: (location) => td("detectedIn", { location }),
    }),
  );
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const save = useSaveConventionSkill(repoId);

  const set =
    <K extends keyof ConventionSkillDraft>(key: K) =>
    (value: ConventionSkillDraft[K]) => {
      if (key === "name") setNameError(null);
      setDraft((d) => ({ ...d, [key]: value }));
    };

  const submit = async () => {
    setFormError(null);
    try {
      const skill = await save.mutateAsync(toConventionSkillInput(draft));
      onSaved(skill);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setNameError(t("nameTaken"));
      else setFormError(err instanceof ApiError ? err.message : t("saveFailed"));
    }
  };

  const fileName = `${draft.name.trim() || t("fileNameFallback")}.md`;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("title")}
      subtitle={draft.name.trim() || undefined}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerHint}>
            <Icon.GitCommit size={14} />
            {t("footerHint")}
          </span>
          <div style={s.footerActions}>
            <Button kind="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              kind="primary"
              icon="Sparkles"
              onClick={submit}
              loading={save.isPending}
              disabled={!isSkillDraftValid(draft)}
            >
              {t("create")}
            </Button>
          </div>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.Sparkles size={16} />
          <span>
            {t.rich("banner", {
              count: accepted.length,
              repo: repoName,
              b: (chunks) => <b>{chunks}</b>,
              mono: (chunks) => <span className="mono" style={s.repo}>{chunks}</span>,
            })}
          </span>
        </div>

        <FormField label={t("name")} required hint={nameError ? <span style={s.error}>{nameError}</span> : undefined}>
          <TextInput value={draft.name} onChange={set("name")} mono aria-label={t("name")} />
        </FormField>

        <FormField label={t("description")}>
          <TextInput value={draft.description} onChange={set("description")} aria-label={t("description")} />
        </FormField>

        <div style={s.row}>
          <FormField label={t("type")}>
            <div style={s.locked} aria-disabled>
              <SelectInput value="convention" options={[{ value: "convention", label: t("typeConvention") }]} />
            </div>
          </FormField>
          <FormField label={t("enabled")} hint={t("enabledHint")}>
            <Toggle on={draft.enabled} onChange={set("enabled")} />
          </FormField>
        </div>

        <FormField label={t("body")} required>
          <div style={s.editor}>
            <div style={s.editorHead}>
              <Icon.FileText size={15} />
              <span className="mono" style={s.fileName}>
                {fileName}
              </span>
              <span style={s.badge}>{t("unsaved")}</span>
              <span className="mono" style={s.tokens}>
                {t("tokens", { count: estimateTokens(draft.body) })}
              </span>
            </div>
            <textarea
              className="mono"
              aria-label={t("body")}
              value={draft.body}
              rows={BODY_ROWS}
              onChange={(e) => set("body")(e.target.value)}
              style={s.textarea}
            />
          </div>
        </FormField>

        {formError && (
          <div role="alert" style={s.error}>
            {formError}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default CreateConventionSkillModal;
