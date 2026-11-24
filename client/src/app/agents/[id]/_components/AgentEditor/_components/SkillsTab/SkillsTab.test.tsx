import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import type { AgentSkillLink, Skill } from "@/lib/types";
import agentsMessages from "@messages/en/agents.json";
import skillsMessages from "@messages/en/skills.json";

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  skills: [] as unknown[],
  links: [] as unknown[],
}));

// Data hooks mocked at the module boundary: no query client, no network.
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: h.skills, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: h.links, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: h.mutate, isPending: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function skill(id: string, name: string, over: Partial<Skill> = {}): Skill {
  return {
    id,
    name,
    description: `${name} description`,
    type: "custom",
    source: "manual",
    body: "# body",
    enabled: true,
    version: 1,
    ...over,
  };
}

const SKILLS: Skill[] = [
  skill("s1", "zeta-rule"),
  skill("s2", "alpha-rule"),
  skill("s3", "secrets-gate", { enabled: false, type: "security" }),
  skill("s4", "beta-rule"),
];
// Linked: secrets-gate (checked, but globally disabled) then zeta-rule (checked).
const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "s1", order: 1, enabled: true },
  { agent_id: "ag1", skill_id: "s3", order: 0, enabled: true },
];

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

const rowNames = () =>
  screen.getAllByTestId(/^skill-row-/).map((el) => el.getAttribute("data-testid")?.replace("skill-row-", ""));

beforeEach(() => {
  h.mutate.mockReset();
  h.skills = SKILLS;
  h.links = LINKS;
});
afterEach(cleanup);

describe("SkillsTab", () => {
  it("lists linked skills in link order, then the rest by name, with the active counter", () => {
    renderTab();
    expect(rowNames()).toEqual(["secrets-gate", "zeta-rule", "alpha-rule", "beta-rule"]);
    // 2 checked, but secrets-gate is disabled globally → only 1 is actually sent.
    expect(screen.getByText("1 of 4 enabled")).toBeInTheDocument();

    const disabledRow = screen.getByTestId("skill-row-secrets-gate");
    expect(within(disabledRow).getByText("disabled globally")).toBeInTheDocument();
    expect(within(screen.getByTestId("skill-row-zeta-rule")).queryByText("disabled globally")).not.toBeInTheDocument();
  });

  it("toggling a checkbox saves the full ordered list with the flipped flag", () => {
    renderTab();
    const box = within(screen.getByTestId("skill-row-alpha-rule")).getByRole("checkbox");
    expect(box).toHaveAttribute("aria-checked", "false");
    fireEvent.click(box);

    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate).toHaveBeenCalledWith({
      agentId: "ag1",
      links: [
        { skill_id: "s3", enabled: true },
        { skill_id: "s1", enabled: true },
        { skill_id: "s2", enabled: true },
        { skill_id: "s4", enabled: false },
      ],
    });
  });

  it("Alt+ArrowDown on a focused row saves the reordered list; edge moves do nothing", () => {
    renderTab();
    const first = screen.getByTestId("skill-row-secrets-gate");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });

    expect(h.mutate).toHaveBeenCalledWith({
      agentId: "ag1",
      links: [
        { skill_id: "s1", enabled: true },
        { skill_id: "s3", enabled: true },
        { skill_id: "s2", enabled: false },
        { skill_id: "s4", enabled: false },
      ],
    });

    h.mutate.mockReset();
    // Without Alt, or past the top edge: no save.
    fireEvent.keyDown(first, { key: "ArrowDown" });
    fireEvent.keyDown(first, { key: "ArrowUp", altKey: true });
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("does not reorder while the filter has text", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "rule" } });
    expect(rowNames()).toEqual(["zeta-rule", "alpha-rule", "beta-rule"]);

    const row = screen.getByTestId("skill-row-zeta-rule");
    fireEvent.keyDown(row, { key: "ArrowDown", altKey: true });
    fireEvent.keyDown(row, { key: "ArrowUp", altKey: true });
    expect(h.mutate).not.toHaveBeenCalled();
  });
});
