/* Route: /agents/:id (Agent Editor). Thin route entry — the screen lives
   under _components/AgentDetailView. */
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { AgentDetailView } from "./_components/AgentDetailView";

export default function AgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  // AgentDetailView reads ?tab (useSearchParams) → needs its own Suspense.
  return (
    <Suspense fallback={null}>
      <AgentDetailView id={id} />
    </Suspense>
  );
}
