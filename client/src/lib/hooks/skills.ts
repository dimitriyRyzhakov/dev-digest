/* hooks/skills.ts — React Query hooks for M2 skills: the Skills page (CRUD +
   import preview) and the agent editor's Skills tab (ordered links). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  AgentSkillLink,
  AgentSkillLinkInput,
  Skill,
  SkillStats,
  SkillVersion,
  SkillImportPreview,
  SkillInput,
  SkillPatch,
} from "@/lib/types";
import { agentKeys } from "./agents";

/** Query keys for the skills domain — the only place these arrays are spelled. */
export const skillKeys = {
  list: () => ["skills"] as const,
  detail: (id: string | null | undefined) => ["skill", id] as const,
  versions: (id: string | null | undefined) => ["skill-versions", id] as const,
  /** Prefix: invalidates the stats of every skill (link changes move them all). */
  statsAll: () => ["skill-stats"] as const,
  stats: (id: string | null | undefined) => ["skill-stats", id] as const,
  /** Prefix: invalidates the link list of every agent. */
  agentLinksAll: () => ["agent-skills"] as const,
  agentLinks: (agentId: string | null | undefined) => ["agent-skills", agentId] as const,
};

export function useSkills() {
  return useQuery({
    queryKey: skillKeys.list(),
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

/** Body snapshots, newest first (Versions tab). */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.versions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** Which agents use the skill and how often runs sent it (Stats tab). */
export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.stats(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.detail(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

/** Skills changes alter what agents send → refresh agent skill counts too. */
function useInvalidateSkills() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: skillKeys.list() });
    qc.invalidateQueries({ queryKey: agentKeys.list() });
  };
}

export function useCreateSkill() {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: (input: SkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => invalidate(),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: SkillPatch;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.patch<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.setQueryData(skillKeys.detail(data.id), data);
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
      invalidate();
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: skillKeys.detail(id) });
      qc.invalidateQueries({ queryKey: skillKeys.agentLinksAll() });
      invalidate();
    },
  });
}

export interface ImportPreviewInput {
  filename: string;
  content_base64: string;
}

/** Parse an uploaded .md / .zip on the server. Persists nothing. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: ImportPreviewInput) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.agentLinks(agentId),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export interface SetAgentSkillsInput {
  agentId: string;
  links: AgentSkillLinkInput[];
}

/** Replace an agent's ordered skill links. Optimistic; rolls back on error. */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, links }: SetAgentSkillsInput) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { links }),
    onMutate: async ({ agentId, links }) => {
      const key = skillKeys.agentLinks(agentId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkillLink[]>(key);
      qc.setQueryData<AgentSkillLink[]>(
        key,
        links.map((l, order) => ({ agent_id: agentId, skill_id: l.skill_id, enabled: l.enabled, order })),
      );
      return { previous };
    },
    onError: (_e, { agentId }, ctx) => {
      if (ctx?.previous) qc.setQueryData(skillKeys.agentLinks(agentId), ctx.previous);
    },
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(skillKeys.agentLinks(agentId), data);
    },
    onSettled: (_d, _e, { agentId }) => {
      qc.invalidateQueries({ queryKey: skillKeys.statsAll() });
      qc.invalidateQueries({ queryKey: agentKeys.list() });
      qc.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
    },
  });
}
