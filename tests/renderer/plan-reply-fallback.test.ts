import { describe, it, expect } from "vitest";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";
import {
  buildPlanReplyFallbackMarkdown,
  hasTrailingProseInBlocks,
} from "../../src/renderer/lib/chat/plan-reply-fallback";

describe("plan-reply-fallback", () => {
  it("detects trailing prose after activity blocks", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "1", name: "write" },
      { type: "text", text: "Plan draft is ready — please Approve & Build." },
    ];
    expect(hasTrailingProseInBlocks(blocks)).toBe(true);
  });

  it("returns no fallback when trailing prose exists", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "1", name: "write" },
      { type: "text", text: "Summary from model." },
    ];
    expect(buildPlanReplyFallbackMarkdown(blocks, "Frontmatter description")).toBe("");
  });

  it("returns frontmatter summary when activity ends without prose", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "Planning…" },
      { type: "tool_use", id: "1", name: "write" },
    ];
    expect(buildPlanReplyFallbackMarkdown(blocks, "Compare three baselines.")).toBe(
      "Compare three baselines.",
    );
  });

  it("returns empty when summary missing", () => {
    const blocks: ContentBlock[] = [{ type: "tool_use", id: "1", name: "write" }];
    expect(buildPlanReplyFallbackMarkdown(blocks, null)).toBe("");
  });
});
