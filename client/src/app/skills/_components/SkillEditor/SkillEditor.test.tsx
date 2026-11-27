import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@/lib/types";
import skillsMessages from "@messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const SKILL: Skill = {
  id: "sk1",
  name: "secrets-scan",
  description: "Flag hard-coded credentials.",
  type: "security",
  source: "manual",
  body: "# Secrets",
  enabled: true,
  version: 1,
};

const h = vi.hoisted(() => ({
  createAsync: vi.fn(),
  updateAsync: vi.fn(),
  updateMutate: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: h.createAsync, isPending: false }),
  useUpdateSkill: () => ({ mutateAsync: h.updateAsync, mutate: h.updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace, push: h.push }) }));

import { SkillEditor } from "./SkillEditor";

function renderEditor(skill?: Skill) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      <ToastProvider>
        <SkillEditor skill={skill} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const bodyBox = () => screen.getByPlaceholderText(/What to flag/);

beforeEach(() => {
  h.createAsync.mockReset().mockImplementation(async (input) => ({ ...SKILL, id: "new", ...input }));
  h.updateAsync.mockReset().mockImplementation(async ({ patch }) => ({ ...SKILL, ...patch, version: 2 }));
  h.updateMutate.mockReset();
  h.replace.mockReset();
  h.push.mockReset();
});
afterEach(cleanup);

describe("SkillEditor (inline)", () => {
  it("create: the button stays disabled until all required fields are filled, then saves trimmed input", async () => {
    renderEditor();
    const submit = screen.getByRole("button", { name: "Create skill" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("Name, description and body are required.")).toBeInTheDocument();

    type(screen.getByPlaceholderText("test-branch-coverage"), "  branch-coverage ");
    expect(submit).toBeDisabled();
    type(screen.getByPlaceholderText(/Use when a PR changes tests/), " Flag uncovered branches. ");
    expect(submit).toBeDisabled();
    type(bodyBox(), "   ");
    expect(submit).toBeDisabled(); // whitespace-only body is still blank
    type(bodyBox(), "\n# Branches\n");
    expect(submit).toBeEnabled();

    fireEvent.click(submit);

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/skills/new"));
    expect(h.createAsync).toHaveBeenCalledWith({
      name: "branch-coverage",
      description: "Flag uncovered branches.",
      type: "custom",
      body: "# Branches",
      source: "manual",
    });
    expect(h.updateAsync).not.toHaveBeenCalled();
  });

  it("edit: a changed body shows the new-version hint and saves a patch without source", async () => {
    renderEditor(SKILL);
    expect(screen.getByDisplayValue("secrets-scan")).toBeInTheDocument();
    expect(screen.queryByText(/creates a new version/)).not.toBeInTheDocument();

    type(bodyBox(), "# Secrets\nAlso flag .env files.");
    expect(screen.getByText("Saving a changed body creates a new version (v2).")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));

    await waitFor(() => expect(h.updateAsync).toHaveBeenCalledTimes(1));
    const arg = h.updateAsync.mock.calls[0]?.[0];
    expect(arg).toEqual({
      id: "sk1",
      patch: {
        name: "secrets-scan",
        description: "Flag hard-coded credentials.",
        type: "security",
        body: "# Secrets\nAlso flag .env files.",
      },
    });
    expect(arg.patch).not.toHaveProperty("source");
    expect(h.createAsync).not.toHaveBeenCalled();
  });

  it("edit: the Enabled toggle and Cancel work inline, without any dialog", () => {
    renderEditor(SKILL);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(h.updateMutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });

    type(bodyBox(), "changed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByDisplayValue("# Secrets")).toBeInTheDocument();
  });
});
