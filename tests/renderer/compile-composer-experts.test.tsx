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
});
