/* ConventionsToolbar — "Deselect all · N of M accepted" on the left, the
   primary "Create skill" (disabled until something is accepted) on the right. */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export function ConventionsToolbar({
  accepted,
  total,
  onDeselectAll,
  onCreateSkill,
}: {
  accepted: number;
  total: number;
  onDeselectAll: () => void;
  onCreateSkill: () => void;
}) {
  const t = useTranslations("conventions.toolbar");
  return (
    <div style={s.bar}>
      <div style={s.left}>
        <Button kind="ghost" icon="X" onClick={onDeselectAll} disabled={accepted === 0}>
          {t("deselectAll")}
        </Button>
        <span style={s.count}>{t("acceptedCount", { accepted, total })}</span>
      </div>
      <Button kind="primary" icon="Sparkles" onClick={onCreateSkill} disabled={accepted === 0}>
        {t("createSkill")}
      </Button>
    </div>
  );
}

export default ConventionsToolbar;
