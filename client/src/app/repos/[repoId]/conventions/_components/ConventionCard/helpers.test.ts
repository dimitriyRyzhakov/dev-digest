import { describe, expect, it } from "vitest";
import { splitInlineCode } from "./helpers";

describe("splitInlineCode", () => {
  it("splits backtick spans into code segments", () => {
    expect(splitInlineCode("Use `now()` from `./_shared` always")).toEqual([
      { text: "Use ", code: false },
      { text: "now()", code: true },
      { text: " from ", code: false },
      { text: "./_shared", code: true },
      { text: " always", code: false },
    ]);
  });

  it("keeps plain text and unmatched backticks as text", () => {
    expect(splitInlineCode("No code here")).toEqual([{ text: "No code here", code: false }]);
    expect(splitInlineCode("Odd ` tick")).toEqual([{ text: "Odd ` tick", code: false }]);
  });
});
