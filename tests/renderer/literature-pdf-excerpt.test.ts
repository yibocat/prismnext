import { describe, expect, it } from "vitest";
import { mergeExcerptMarkdown } from "@/modes/literature-mode/literature-pdf-excerpt";

describe("literature-pdf-excerpt", () => {
  it("joins queued excerpts with a divider", () => {
    const merged = mergeExcerptMarkdown([
      { markdown: "First paragraph." },
      { markdown: "Second paragraph." },
    ]);
    expect(merged).toBe("First paragraph.\n\n---\n\nSecond paragraph.");
  });
});
