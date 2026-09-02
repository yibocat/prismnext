import { describe, expect, it } from "vitest";
import {
  isPatchMetadataText,
  parseComposerAttachedFileNames,
  sanitizeUserContentBlocksForDisplay,
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

  it("strips Composer attachments honesty and trailing Attached files markdown", () => {
    const raw = [
      "## Composer attachments",
      "",
      "The user attached: `详细流程.docx`.",
      "If this message does not include converted Markdown for that file (`[DOCX attachment: …]` or similar), you cannot see its contents.",
      "Say that plainly. Do not invent the document. Do not present another project file (`.typ`, `.tex`, `.md`, …) as this attachment.",
      "",
      "你给我讲讲这个文件讲解了什么",
      "",
      "## Attachment status (this turn)",
      "",
      "These are the files the user attached. They are the subject of the request.",
      "",
      "- `详细流程.docx` — converted below. Answer from that Markdown. Do not substitute another project file.",
      "",
      "## Attached files",
      "",
      "[DOCX attachment: 详细流程.docx]",
      "",
      "HotpotQA sample about Animorphs",
    ].join("\n");
    expect(stripCompiledPromptSections(raw)).toBe("你给我讲讲这个文件讲解了什么");
  });

  it("parses attached file names from the composer honesty block", () => {
    expect(
      parseComposerAttachedFileNames("The user attached: `详细流程.docx`, `slides.pptx`."),
    ).toEqual(["详细流程.docx", "slides.pptx"]);
  });

  it("promotes persisted file attachments into inline chips and keeps images on the strip", () => {
    const sanitized = sanitizeUserContentBlocksForDisplay([
      {
        type: "text",
        text: [
          "## Composer attachments",
          "",
          "The user attached: `详细流程.docx`.",
          "If this message does not include converted Markdown for that file (`[DOCX attachment: …]` or similar), you cannot see its contents.",
          "Say that plainly. Do not invent the document. Do not present another project file (`.typ`, `.tex`, `.md`, …) as this attachment.",
          "",
          "你给我讲讲这个文件讲解了什么",
          "",
          "## Attached files",
          "",
          "converted markdown dump",
        ].join("\n"),
        attachments: [
          { name: "shot.png", kind: "image", path: "/tmp/shot.png", previewUrl: "data:image/png;base64,xx" },
          { name: "详细流程.docx", kind: "file", path: "/tmp/详细流程.docx" },
        ],
      },
    ]);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0]?.text).toBe("你给我讲讲这个文件讲解了什么");
    expect(sanitized[0]?.attachments).toEqual([
      { name: "shot.png", kind: "image", path: "/tmp/shot.png", previewUrl: "data:image/png;base64,xx" },
    ]);
    const parts = sanitized[0]?.inlineParts ?? [];
    expect(parts[0]).toMatchObject({ type: "text", text: "你给我讲讲这个文件讲解了什么" });
    expect(parts[1]).toMatchObject({
      type: "mention",
      mentionType: "file",
      label: "详细流程.docx",
      filePath: "/tmp/详细流程.docx",
    });
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
