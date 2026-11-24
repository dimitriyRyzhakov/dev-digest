/* hooks/trace.ts — A5 Run Trace. GET /runs/:id/trace returns the ENTIRE
   trace of one run as a single document (config + stats + prompt_assembly +
   tool_calls[] + raw_output + memory_pulled[] + full log). Registered by A2;
   A5 enriches the document it returns. Live events stream via useRunEvents
   (hooks/reviews.ts) — the drawer combines both. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { RunTrace } from "@devdigest/shared";

/** Query keys for run traces — the only place these arrays are spelled. */
export const traceKeys = {
  run: (runId: string | null | undefined) => ["run-trace", runId] as const,
};

export function useRunTrace(runId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: traceKeys.run(runId),
    queryFn: () => api.get<RunTrace>(`/runs/${runId}/trace`),
    enabled: !!runId && enabled,
    retry: false,
  });
}
