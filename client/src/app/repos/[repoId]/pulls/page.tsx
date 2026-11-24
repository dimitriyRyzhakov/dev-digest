/* Route: /repos/:repoId/pulls (PR list). Thin route entry — the screen lives
   under _components/PullsView; list rules in ./helpers, shared by its rows. */
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { PullsView } from "./_components/PullsView";

export default function PullsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  // PullsView reads ?status (useSearchParams) → needs its own Suspense.
  return (
    <Suspense fallback={null}>
      <PullsView repoId={repoId} />
    </Suspense>
  );
}
