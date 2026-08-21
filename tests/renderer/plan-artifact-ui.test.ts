import { describe, expect, it } from "vitest";
import {
  isPlanFileToolUse,
  planPathFromToolUse,
} from "../../src/renderer/lib/chat/plan-artifact-ui";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";

describe("plan-artifact-ui", () => {
  it("detects write/edit to current-draft.md", () => {
    const tool: ContentBlock = {
      type: "tool_use",
      name: "write",
      id: "1",
      input: { file_path: ".workbench/research/plans/current-draft.md" },
    };
    expect(isPlanFileToolUse(tool)).toBe(true);
    expect(planPathFromToolUse(tool)).toBe(".workbench/research/plans/current-draft.md");
  });

  it("ignores unrelated writes", () => {
    const tool: ContentBlock = {
      type: "tool_use",
      name: "write",
      id: "1",
      input: { path: "manuscript/main.tex" },
    };
    expect(isPlanFileToolUse(tool)).toBe(false);
    expect(planPathFromToolUse(tool)).toBeNull();
  });
});
