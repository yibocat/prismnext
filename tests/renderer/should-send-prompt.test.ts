import { describe, it, expect } from "vitest";
import {
  shouldSendPromptToAgent,
} from "../../src/renderer/components/modules/chat/inline-composer/compile-composer-prompt";
import type { ComposerPart } from "../../src/renderer/components/modules/chat/inline-composer/tokens";

describe("shouldSendPromptToAgent", () => {
  const base = {
    promptText: "/compile",
    aiCommandNames: [] as string[],
    actionCommands: [{ commandName: "compile", action: "compile-document", source: "builtin" }],
  };

  it("skips model call for action-only messages", () => {
    const parts: ComposerPart[] = [
      { type: "command", id: "c1", label: "compile", commandName: "compile", action: "compile-document", source: "builtin" },
    ];
    expect(shouldSendPromptToAgent(base, parts, 0)).toBe(false);
  });

  it("sends when user typed text alongside action command", () => {
    const parts: ComposerPart[] = [
      { type: "text", text: "please compile" },
      { type: "command", id: "c1", label: "compile", commandName: "compile", action: "compile-document", source: "builtin" },
    ];
    expect(shouldSendPromptToAgent(base, parts, 0)).toBe(true);
  });

  it("sends for AI slash commands", () => {
    const parts: ComposerPart[] = [
      { type: "command", id: "c1", label: "review", commandName: "review", source: "builtin" },
    ];
    expect(
      shouldSendPromptToAgent(
        { ...base, promptText: "x", aiCommandNames: ["review"], actionCommands: [] },
        parts,
        0,
      ),
    ).toBe(true);
  });
});
