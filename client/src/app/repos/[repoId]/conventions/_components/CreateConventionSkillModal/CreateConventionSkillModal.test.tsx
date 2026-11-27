import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@/lib/types";
import conventionsMessages from "@messages/en/conventions.json";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => ({ saveAsync: vi.fn() }));

vi.mock("@/lib/hooks/conventions", () => ({
  useSaveConventionSkill: () => ({ mutateAsync: h.saveAsync, isPending: false }),
}));

import { CreateConventionSkillModal } from "./CreateConventionSkillModal";

const ACCEPTED: ConventionCandidate[] = [
  {
    id: "c1",
    rule: "Always use async/await instead of .then() chains.",
    evidence_path: "src/api/users.ts",
    evidence_snippet: "const user = await db.users.find(id);",
    evidence_start_line: 23,
    evidence_end_line: 31,
    confidence: 0.91,
    accepted: true,
    status: "accepted",
    created_at: "2026-11-25T10:00:00.000Z",
  },
];

function renderModal(onSaved = vi.fn(), onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: conventionsMessages }}>
      <CreateConventionSkillModal
        repoId="r1"
        repoName="payments-api"
        accepted={ACCEPTED}
        onClose={onClose}
        onSaved={onSaved}
      />
    </NextIntlClientProvider>,
  );
  return { onSaved, onClose };
}

const nameBox = () => screen.getByLabelText("Name") as HTMLInputElement;
const descBox = () => screen.getByLabelText("Description") as HTMLInputElement;
const bodyBox = () => screen.getByLabelText("Skill body") as HTMLTextAreaElement;

beforeEach(() => {
  h.saveAsync.mockReset().mockImplementation(async (input) => ({
    id: "sk1",
    type: "convention",
    source: "extracted",
    version: 1,
    ...input,
  }));
});
afterEach(cleanup);

describe("CreateConventionSkillModal", () => {
  it("prefills name, description and a body built from the accepted conventions", () => {
    renderModal();
    expect(nameBox().value).toBe("payments-api-conventions");
    expect(descBox().value).toBe("1 house convention extracted from payments-api");
    expect(bodyBox().value).toContain("# payments-api-conventions");
    expect(bodyBox().value).toContain("Detected in `src/api/users.ts:23-31`:");
    expect(screen.getByText("payments-api-conventions.md")).toBeTruthy();
  });

  it("sends the edited values (trimmed) with the enabled flag", async () => {
    const { onSaved } = renderModal();
    fireEvent.change(nameBox(), { target: { value: " house-rules " } });
    fireEvent.change(descBox(), { target: { value: "Payments rules" } });
    fireEvent.change(bodyBox(), { target: { value: "# house-rules\nUse await.\n" } });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(h.saveAsync).toHaveBeenCalledWith({
      name: "house-rules",
      description: "Payments rules",
      body: "# house-rules\nUse await.",
      enabled: false,
    });
  });

  it("shows a taken name (409) inline and does not close", async () => {
    h.saveAsync.mockRejectedValueOnce(new ApiError("exists", 409, "conflict"));
    const { onSaved } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("disables saving while a required field is blank", () => {
    renderModal();
    fireEvent.change(bodyBox(), { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Create skill" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
