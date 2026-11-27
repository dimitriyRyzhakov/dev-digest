import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { lethalTrifectaFindings } from "./helpers";

const review = (findings: Partial<FindingRecord>[]) => ({ findings }) as unknown as ReviewRecord;

describe("lethalTrifectaFindings", () => {
  it("collects lethal_trifecta findings across every run", () => {
    const runs = [
      review([{ id: "a", kind: "lethal_trifecta" }, { id: "b", kind: "finding" }]),
      review([]),
      review([{ id: "c", kind: "lethal_trifecta" }]),
    ];
    expect(lethalTrifectaFindings(runs).map((f) => f.id)).toEqual(["a", "c"]);
  });

  it("returns [] when no run has one", () => {
    expect(lethalTrifectaFindings([review([{ id: "x", kind: "finding" }])])).toEqual([]);
  });
});
