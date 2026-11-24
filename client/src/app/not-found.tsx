/* Unknown URL → friendly empty state inside the app shell. */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";

export default function NotFound() {
  const t = useTranslations("common.notFound");
  const router = useRouter();
  return (
    <AppShell crumb={[{ label: "DevDigest" }]}>
      <EmptyState icon="Search" title={t("title")} body={t("body")} cta={t("home")} onCta={() => router.push("/")} />
    </AppShell>
  );
}
