/* SkillImportPanel — inline import in the right panel (no dialogs).
   Step 1: pick a .md / .zip; the server parses it in memory.
   Step 2: review the draft, the ignored (never-run) files and the trust notice;
   Confirm saves via POST /skills and opens the new skill. Cancel saves nothing. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { SkillImportPreview } from "@/lib/types";
import { useCreateSkill, useImportSkillPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SkillFields, isDraftValid, toSkillDraft, toSkillInput, type SkillDraft } from "../SkillFields";
import { ACCEPT, MAX_UPLOAD_BYTES } from "./constants";
import { fileToBase64 } from "./helpers";
import { s } from "./styles";

export function SkillImportPanel() {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  // One value: a loaded preview always comes with its editable draft.
  const [loaded, setLoaded] = React.useState<{ parsed: SkillImportPreview; draft: SkillDraft } | null>(null);

  const clearInput = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(t("import.readFailed"));
      clearInput();
      return;
    }
    try {
      const result = await preview.mutateAsync({ filename: file.name, content_base64: await fileToBase64(file) });
      setLoaded({ parsed: result, draft: toSkillDraft(result) });
    } catch {
      // The global mutation handler already toasted the server's message.
      clearInput();
    }
  };

  const reset = () => {
    setLoaded(null);
    clearInput();
  };

  const confirm = async () => {
    if (!loaded || !isDraftValid(loaded.draft)) return;
    try {
      const saved = await create.mutateAsync(toSkillInput(loaded.draft, "imported_file"));
      toast.success(t("import.saved", { name: saved.name }));
      router.replace(`/skills/${saved.id}`);
    } catch {
      // Stays on the preview so the user can fix e.g. a duplicate name; error already toasted.
    }
  };

  return (
    <>
      <div style={s.head}>
        <Icon.Upload size={18} style={s.headIcon} />
        <h1 style={s.title}>{t("import.title")}</h1>
        <span style={s.subtitle}>{t("import.subtitle")}</span>
      </div>
      <div style={s.body}>
        <div style={s.wrap}>
          {!loaded ? (
            <>
              <div style={s.dropzone}>
                <Icon.Upload size={22} />
                <Button
                  kind="secondary"
                  icon="FileText"
                  onClick={() => inputRef.current?.click()}
                  disabled={preview.isPending}
                >
                  {preview.isPending ? t("import.parsing") : t("import.pick")}
                </Button>
                <div style={s.hint}>{t("import.pickHint")}</div>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  aria-label={t("import.pick")}
                  style={s.hiddenInput}
                  onChange={(e) => void pick(e.target.files?.[0])}
                />
              </div>
              <div style={s.actions}>
                <Button kind="secondary" onClick={() => router.push("/skills")}>
                  {t("import.cancel")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div role="note" style={s.trust}>
                <Icon.AlertTriangle size={16} style={s.trustIcon} />
                <div>
                  <div style={s.trustTitle}>{t("import.trustTitle")}</div>
                  <div>{t("import.trustBody")}</div>
                </div>
              </div>
              <div className="mono" style={s.source}>
                {t("import.sourceFile", { file: loaded.parsed.source_file })}
              </div>
              {loaded.parsed.warnings.length > 0 && (
                <>
                  <div style={s.sectionTitle}>{t("import.warnings")}</div>
                  <ul style={s.list}>
                    {loaded.parsed.warnings.map((w) => (
                      <li key={w} style={s.warning}>
                        {w}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <SkillFields draft={loaded.draft} onChange={(draft) => setLoaded({ ...loaded, draft })} />
              <div style={s.sectionTitle}>{t("import.ignoredTitle")}</div>
              {loaded.parsed.ignored_files.length === 0 ? (
                <div style={s.muted}>{t("import.noIgnored")}</div>
              ) : (
                <ul style={s.list} aria-label={t("import.ignoredTitle")}>
                  {loaded.parsed.ignored_files.map((f) => (
                    <li key={f.path} style={s.ignoredRow}>
                      <Icon.EyeOff size={12} style={s.ignoredReason} />
                      <span className="mono" style={s.ignoredPath}>
                        {f.path}
                      </span>
                      <span style={s.ignoredReason}>{f.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div style={s.actions}>
                <Button
                  kind="primary"
                  icon="Check"
                  onClick={confirm}
                  disabled={!isDraftValid(loaded.draft) || create.isPending}
                >
                  {create.isPending ? t("import.saving") : t("import.confirm")}
                </Button>
                <Button kind="secondary" onClick={reset}>
                  {t("import.back")}
                </Button>
                <Button kind="ghost" onClick={() => router.push("/skills")}>
                  {t("import.cancel")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default SkillImportPanel;
