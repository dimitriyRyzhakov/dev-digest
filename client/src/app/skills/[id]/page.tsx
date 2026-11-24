/* Route: /skills/:id (skill editor). Thin route entry — the screen lives
   under ../_components/SkillDetailView. */
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { SkillDetailView } from "../_components/SkillDetailView";

export default function SkillEditorPage() {
  const { id } = useParams<{ id: string }>();
  // SkillDetailView reads ?tab (useSearchParams) → needs its own Suspense.
  return (
    <Suspense fallback={null}>
      <SkillDetailView id={id} />
    </Suspense>
  );
}
