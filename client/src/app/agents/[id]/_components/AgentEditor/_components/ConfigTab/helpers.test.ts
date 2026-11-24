import { describe, it, expect } from "vitest";
import type { Agent } from "@devdigest/shared";
import { toAgentPatch, toConfigForm } from "./helpers";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: false,
  version: 3,
};

describe("ConfigTab helpers", () => {
  it("round-trips agent → form → patch with snake_case API fields", () => {
    expect(toAgentPatch(toConfigForm(AGENT))).toEqual({
      name: "Security Reviewer",
      description: "Flags secrets",
      provider: "openai",
      model: "gpt-4.1",
      system_prompt: "You are a security reviewer.",
      strategy: "single-pass",
      ci_fail_on: "critical",
      repo_intel: true,
      enabled: false,
    });
  });

  it("patch reflects edited form values", () => {
    const form = { ...toConfigForm(AGENT), name: "Renamed", systemPrompt: "New prompt", enabled: true };
    expect(toAgentPatch(form)).toMatchObject({ name: "Renamed", system_prompt: "New prompt", enabled: true });
  });
});
