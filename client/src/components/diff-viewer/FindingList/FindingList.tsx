/* FindingList — review findings rendered as expanded FindingCards inside the
   diff (under a line, or in a file's unmatched block). Actions go back through
   the DiffFindingApi; dismissed findings stay, muted by FindingCard. */
"use client";

import React from "react";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import type { DiffFindingApi } from "../findings";

export function FindingList({
  findings,
  api,
  inline = false,
}: {
  findings: FindingRecord[];
  api: DiffFindingApi;
  /** Cards sit under their own line → no file:line row (the unmatched block keeps it). */
  inline?: boolean;
}) {
  return (
    <>
      {findings.map((f) => (
        <FindingCard
          key={f.id}
          f={f}
          defaultExpanded
          inline={inline}
          pending={api.pendingId === f.id}
          repoFullName={api.repoFullName}
          headSha={api.headSha}
          onAction={(action) => api.onAction(f, action)}
        />
      ))}
    </>
  );
}
