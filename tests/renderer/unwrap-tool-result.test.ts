import { describe, expect, it } from "vitest";
import { toolResultPlainText } from "../../src/renderer/lib/chat/unwrap-tool-result";

describe("toolResultPlainText", () => {
  it("keeps a plain string", () => {
    expect(toolResultPlainText("manuscript/main.tex")).toBe("manuscript/main.tex");
  });

  it("unwraps Pi primitive { content: [{ type: text, text }] }", () => {
    expect(toolResultPlainText({
      content: [{ type: "text", text: "manuscript/main.tex\nnotes/draft.tex" }],
    })).toBe("manuscript/main.tex\nnotes/draft.tex");
  });

  it("joins a text-part array", () => {
    expect(toolResultPlainText([
      { type: "text", text: "a.tex" },
      { type: "text", text: "b.tex" },
    ])).toBe("a.tex\nb.tex");
  });

  it("does not invent text from an empty object", () => {
    expect(toolResultPlainText({})).toBe("");
  });
});
