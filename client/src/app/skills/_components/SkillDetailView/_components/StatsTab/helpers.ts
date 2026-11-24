import type { SkillStats } from "@/lib/types";

/** Agent row state: sends it / linked but switched off / agent itself disabled. */
export function agentState(a: SkillStats["agents"][number]): "active" | "linkOff" | "agentOff" {
  if (!a.agent_enabled) return "agentOff";
  return a.link_enabled ? "active" : "linkOff";
}

/** YYYY-MM-DD of an ISO timestamp. */
export function isoDay(iso: string): string {
  return iso.slice(0, 10);
}
