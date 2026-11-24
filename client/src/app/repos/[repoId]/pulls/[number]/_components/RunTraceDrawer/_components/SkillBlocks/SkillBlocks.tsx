/* SkillBlocks — per-skill token breakdown of the Skills prompt block (M2):
   one line per skill sent in the system message (name, version, tokens) + total. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillBlock } from "@devdigest/shared";
import { totalSkillTokens } from "../../helpers";
import { s } from "../../styles";

export function SkillBlocks({ blocks }: { blocks: readonly SkillBlock[] }) {
  const t = useTranslations("runs");
  return (
    <div style={s.skillBlocks} data-testid="skill-blocks">
      <span style={s.skillBlocksTitle}>{t("trace.prompt.skillBlocks", { count: blocks.length })}</span>
      {blocks.map((b) => (
        <div key={b.skill_id} style={s.skillBlockRow}>
          <span className="mono" style={s.skillBlockName} title={b.name}>
            {b.name}
          </span>
          <span className="mono" style={s.skillBlockVersion}>
            {t("trace.prompt.skillVersion", { version: b.version })}
          </span>
          <span className="tnum" style={s.skillBlockTokens}>
            {t("trace.prompt.skillTokens", { tokens: b.tokens })}
          </span>
        </div>
      ))}
      <div style={s.skillBlocksTotal}>
        <span style={s.skillBlockName}>{t("trace.prompt.skillTotal")}</span>
        <span className="tnum" style={s.skillBlockTokens}>
          {t("trace.prompt.skillTokens", { tokens: totalSkillTokens(blocks) })}
        </span>
      </div>
    </div>
  );
}
