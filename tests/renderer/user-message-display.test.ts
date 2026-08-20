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

  it("keeps the user line after a failed @file inline", () => {
    const raw = [
      "## Referenced files",
      "",
      "[file unavailable: figures/lstm-cell.tex]",
      "Absolute path: `figures/lstm-cell.tex`",
      "Could not read text content. Use file tools if the path is accessible.",
      "",
      "我们专门为 LSTM 画了一个图 @figures/lstm-cell.tex ，你来给我展示一下",
    ].join("\n");
    expect(stripCompiledPromptSections(raw)).toBe(
      "我们专门为 LSTM 画了一个图 @figures/lstm-cell.tex ，你来给我展示一下",
    );
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
