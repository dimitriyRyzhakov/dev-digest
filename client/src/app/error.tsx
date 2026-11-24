/* Route-level error boundary: a render error in any screen shows this inside
   the root layout (providers + i18n still mounted) instead of a blank app. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { s } from "./styles";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common.errorPage");
  const router = useRouter();

  React.useEffect(() => {
    // Keep the stack in the browser console for debugging (no remote reporting: local-first).
    console.error(error);
  }, [error]);

  return (
    <AppShell crumb={[{ label: "DevDigest" }]}>
      <ErrorState fullScreen title={t("title")} body={t("body")} onRetry={reset} />
      <div style={s.fallbackActions}>
        <Button kind="ghost" size="sm" icon="ChevronLeft" onClick={() => router.push("/")}>
          {t("home")}
        </Button>
      </div>
    </AppShell>
  );
}
