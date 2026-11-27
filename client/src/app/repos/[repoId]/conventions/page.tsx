/* Route: /repos/:repoId/conventions (M2 conventions extractor). Thin route
   entry — the screen lives under _components/ConventionsView; shared pure
   helpers in ./helpers. */
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return (
    <Suspense fallback={null}>
      <ConventionsView repoId={repoId} />
    </Suspense>
  );
}
