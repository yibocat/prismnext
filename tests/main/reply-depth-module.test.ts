import { describe, expect, it } from "vitest";
import { REPLY_DEPTH_PROMPT } from "../../src/main/prompts/modules/reply-depth";

describe("REPLY_DEPTH_PROMPT", () => {
  it("prefers thorough chat for research questions and protects expert voice", () => {
    expect(REPLY_DEPTH_PROMPT).toContain("thorough chat answer");
    expect(REPLY_DEPTH_PROMPT).toContain("Primary orchestrator");
    expect(REPLY_DEPTH_PROMPT).toContain("Expert / subagent");
    expect(REPLY_DEPTH_PROMPT).toContain("own instructions");
    expect(REPLY_DEPTH_PROMPT).toContain("When Plan");
    expect(REPLY_DEPTH_PROMPT).toContain("artifact");
    expect(REPLY_DEPTH_PROMPT).toContain("Interaction");
    expect(REPLY_DEPTH_PROMPT).not.toContain("BINDING");
  });
});
