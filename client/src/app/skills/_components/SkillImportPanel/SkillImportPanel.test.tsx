import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillImportPreview } from "@/lib/types";
import skillsMessages from "@messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const PREVIEW: SkillImportPreview = {
  name: "api-versioning-gate",
  description: "Flag unversioned changes.",
  type: "convention",
  body: "# Gate\nBody",
  source_file: "gate.zip:gate/SKILL.md",
  ignored_files: [{ path: "gate/scripts/check.sh", reason: "executable directory — never run" }],
  warnings: [],
};

const SAVED: Skill = {
  id: "sk1",
  name: PREVIEW.name,
  description: PREVIEW.description,
  type: PREVIEW.type,
  source: "imported_file",
  body: PREVIEW.body,
  enabled: true,
  version: 1,
};

const h = vi.hoisted(() => ({
  previewAsync: vi.fn(),
  createAsync: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace, push: h.push }) }));

vi.mock("@/lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutateAsync: h.previewAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: h.createAsync, isPending: false }),
}));

import { SkillImportPanel } from "./SkillImportPanel";

function renderPanel() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      <ToastProvider>
        <SkillImportPanel />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** jsdom's File may lack arrayBuffer(); give the upload one so fileToBase64 works. */
function makeFile(name: string, text: string): File {
  const file = new File([text], name, { type: "application/zip" });
  if (typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(new TextEncoder().encode(text).buffer),
    });
  }
  return file;
}

async function uploadAndWaitForPreview() {
  const input = screen.getByLabelText("Choose a .md or .zip file");
  fireEvent.change(input, { target: { files: [makeFile("gate.zip", "hello")] } });
  await screen.findByDisplayValue("api-versioning-gate");
}

beforeEach(() => {
  h.previewAsync.mockReset().mockResolvedValue(PREVIEW);
  h.createAsync.mockReset().mockResolvedValue(SAVED);
  h.replace.mockReset();
  h.push.mockReset();
});
afterEach(cleanup);

describe("SkillImportPanel (inline)", () => {
  it("previews the parsed file and saves only on Confirm", async () => {
    renderPanel();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await uploadAndWaitForPreview();

    // The upload is sent as base64 with its filename.
    expect(h.previewAsync).toHaveBeenCalledWith({ filename: "gate.zip", content_base64: btoa("hello") });

    // Preview: editable draft, trust notice, ignored (never-run) files.
    expect(screen.getByDisplayValue("Flag unversioned changes.")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("You are importing someone else's instructions");
    expect(screen.getByText("Source: gate.zip:gate/SKILL.md")).toBeInTheDocument();
    expect(screen.getByText("gate/scripts/check.sh")).toBeInTheDocument();
    expect(screen.getByText("executable directory — never run")).toBeInTheDocument();
    expect(h.createAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/skills/sk1"));
    expect(h.createAsync).toHaveBeenCalledTimes(1);
    expect(h.createAsync).toHaveBeenCalledWith({
      name: "api-versioning-gate",
      description: "Flag unversioned changes.",
      type: "convention",
      body: "# Gate\nBody",
      source: "imported_file",
    });
  });

  it("Cancel after a preview leaves without saving", async () => {
    renderPanel();
    await uploadAndWaitForPreview();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(h.push).toHaveBeenCalledWith("/skills");
    expect(h.createAsync).not.toHaveBeenCalled();
  });
});
