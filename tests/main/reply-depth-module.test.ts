import { describe, expect, it } from "vitest";
import { REPLY_DEPTH_PROMPT } from "../../src/main/prompts";

describe("REPLY_DEPTH_PROMPT", () => {
  it("calibrates reply length and chat rendering only", () => {
    expect(REPLY_DEPTH_PROMPT).toContain("thorough chat answer");
    expect(REPLY_DEPTH_PROMPT).toContain("Orchestrator");
    expect(REPLY_DEPTH_PROMPT).toContain("Experts / subagents");
    expect(REPLY_DEPTH_PROMPT).toContain("KaTeX");
    expect(REPLY_DEPTH_PROMPT).toContain("$...$");
    expect(REPLY_DEPTH_PROMPT).not.toContain("suggest-plan");
    expect(REPLY_DEPTH_PROMPT).not.toContain("artifact");
    expect(REPLY_DEPTH_PROMPT).not.toContain("Read before you change");
    expect(REPLY_DEPTH_PROMPT).not.toContain("BINDING");
  });
});
