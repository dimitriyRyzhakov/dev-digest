"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { usePrIntent } from "@/lib/hooks/reviews";
import { IntentCard } from "../IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, prBody }: OverviewTabProps) {
  const t = useTranslations("prReview.detail");
  // M3 — intent derived by the review pre-step; hidden until the first load settles.
  const { data: intentData, isSuccess } = usePrIntent(prId);
  return (
    <>
      {isSuccess && <IntentCard intent={intentData?.intent ?? null} />}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("overviewDescription")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
