import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";
import type { AgentPatch } from "@/lib/types";

/** Editable fields of the Config tab form. */
export interface ConfigForm {
  name: string;
  description: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  repoIntel: boolean;
  enabled: boolean;
}

/** Initial form state from the saved agent. */
export function toConfigForm(agent: Agent): ConfigForm {
  return {
    name: agent.name,
    description: agent.description,
    provider: agent.provider,
    model: agent.model,
    systemPrompt: agent.system_prompt,
    strategy: agent.strategy,
    ciFailOn: agent.ci_fail_on,
    repoIntel: agent.repo_intel,
    enabled: agent.enabled,
  };
}

/** Form state → PATCH body for `useUpdateAgent`. */
export function toAgentPatch(form: ConfigForm): AgentPatch {
  return {
    name: form.name,
    description: form.description,
    provider: form.provider,
    model: form.model,
    system_prompt: form.systemPrompt,
    strategy: form.strategy,
    ci_fail_on: form.ciFailOn,
    repo_intel: form.repoIntel,
    enabled: form.enabled,
  };
}
