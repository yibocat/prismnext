import { describe, expect, it } from "vitest";
import {
  isPatchMetadataText,
  stripCompiledPromptSections,
} from "@/lib/chat/user-message-display";

describe("user-message-display", () => {
  it("strips compiled agent sections from persisted prompts", () => {
    const raw = [
      "## Referenced files",
      "",
      "```paper/main.tex",
      "content",
      "```",
    ].join("\n")
      + "\n\n"
      + [
        "## Command instructions",
        "",
        "expanded /review",
      ].join("\n")
      + "\n\nFix the abstract";

    expect(stripCompiledPromptSections(raw)).toBe("Fix the abstract");
  });

  it("detects patch metadata JSON", () => {
    const json = JSON.stringify({
      type: "patch",
      hash: "abc123",
      files: ["/proj/.prismnext/worktrees/wt/main.tex"],
    });
    expect(isPatchMetadataText(json)).toBe(true);
    expect(isPatchMetadataText("hello")).toBe(false);
  });
});
