import { describe, it, expect } from "vitest";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import {
  compileComposerPrompt,
  shouldSendPromptToAgent,
} from "@/components/modules/chat/inline-composer/compile-composer-prompt";

describe("compileComposerPrompt selectedExpertIds", () => {
  it("collects all @expert mentions in order", async () => {
    const parts: ComposerPart[] = [
      { type: "text", text: "Help with " },
      {
        type: "mention",
        mentionType: "expert",
        id: "m1",
        label: "Citation Auditor",
        expertId: "citation-auditor",
      },
      { type: "text", text: " and " },
      {
        type: "mention",
        mentionType: "expert",
        id: "m2",
        label: "Literature Scout",
        expertId: "literature-scout",
      },
    ];

    const compiled = await compileComposerPrompt(parts, async () => "");
    expect(compiled.selectedExpertIds).toEqual([
      "citation-auditor",
      "literature-scout",
    ]);
    expect(shouldSendPromptToAgent(compiled, parts, 0)).toBe(true);
  });

  it("routes @-mentioned Office files to promptFiles instead of UTF-8 inline", async () => {
    const parts: ComposerPart[] = [
      { type: "text", text: "这个文件你看看" },
      {
        type: "mention",
        mentionType: "file",
        id: "m-docx",
        label: "详细流程.docx",
        filePath: "/tmp/prism-fixture/详细流程.docx",
        fileId: "file-docx",
      },
    ];
    const compiled = await compileComposerPrompt(parts, async () => "");
    expect(compiled.promptFiles).toHaveLength(1);
    expect(compiled.promptFiles[0]?.name).toBe("详细流程.docx");
    expect(compiled.promptFiles[0]?.uri).toContain("详细流程.docx");
    expect(compiled.promptText).not.toContain("## Referenced files");
    expect(compiled.promptText).toContain("## Composer attachments");
    expect(compiled.promptText).toContain("详细流程.docx");
    expect(compiled.promptText).toContain("Do not invent the document");
  });
});
