import { describe, it, expect } from "vitest";
import { CHAT_CITATION_STAGING_PROMPT } from "../../src/main/prompts/modules/chat-citation-staging";
import { TOOL_NAMES } from "../../src/shared/tool-names";

describe("CHAT_CITATION_STAGING_PROMPT", () => {
  it("is behavioral rules only — not a full tool catalog", () => {
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("## Chat paper citations");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("binding");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain(TOOL_NAMES.literatureStage);
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("[n]");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("Task tool");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("websearch");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("Prism Tools Guide");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain(TOOL_NAMES.literatureRead);
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("Reference & literature");
  });
});
