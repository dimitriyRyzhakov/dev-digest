/* Route: /repos/:repoId/pulls/:number (PR detail). Thin route entry — the
   screen, its tabs and the run trace drawer live under _components/PrDetailView. */
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { PrDetailView } from "./_components/PrDetailView";

export default function PRDetailPage() {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  // PrDetailView reads ?tab / ?trace (useSearchParams) → needs its own Suspense.
  return (
    <Suspense fallback={null}>
      <PrDetailView repoId={repoId} number={Number(number)} />
    </Suspense>
  );
}
