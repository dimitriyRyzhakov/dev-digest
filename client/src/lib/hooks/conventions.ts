/* hooks/conventions.ts — React Query hooks for the M2 conventions extractor:
   the per-repo candidate list, the extraction run, accept/reject/edit of one
   candidate, and merging the accepted ones into a skill. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionList,
  ConventionPatch,
  ConventionSkillInput,
  Skill,
} from "@/lib/types";
import { agentKeys } from "./agents";
import { skillKeys } from "./skills";

/** Query keys for the conventions domain — the only place these arrays are spelled. */
export const conventionKeys = {
  list: (repoId: string | null | undefined) => ["conventions", repoId] as const,
};

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionKeys.list(repoId),
    queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Run (or re-run) the extraction. One model call server-side; accepted candidates survive. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: () => qc.invalidateQueries({ queryKey: conventionKeys.list(repoId) }),
  });
}

export interface PatchConventionInput {
  id: string;
  patch: ConventionPatch;
}

/** Apply a patch to the cached candidate (status keeps the derived `accepted` in step). */
function applyPatch(c: ConventionCandidate, patch: ConventionPatch): ConventionCandidate {
  const status = patch.status ?? c.status;
  return { ...c, rule: patch.rule ?? c.rule, status, accepted: status === "accepted" };
}

/** Accept / reject / edit one candidate — optimistic, rolled back on error. */
export function usePatchConvention(repoId: string) {
  const qc = useQueryClient();
  const key = conventionKeys.list(repoId);
  return useMutation({
    mutationFn: ({ id, patch }: PatchConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ConventionList>(key);
      if (previous) {
        qc.setQueryData<ConventionList>(key, {
          ...previous,
          candidates: previous.candidates.map((c) => (c.id === id ? applyPatch(c, patch) : c)),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** Merge the accepted candidates into one `extracted` skill (created, or a new version). */
export function useSaveConventionSkill(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConventionSkillInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: (skill) => {
      qc.setQueryData(skillKeys.detail(skill.id), skill);
      qc.invalidateQueries({ queryKey: skillKeys.list() });
      qc.invalidateQueries({ queryKey: skillKeys.versions(skill.id) });
      qc.invalidateQueries({ queryKey: agentKeys.list() });
    },
  });
}
