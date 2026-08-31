import { describe, expect, it } from "vitest";
import { CHAT_CITATION_STAGING_PROMPT } from "../../src/main/prompts/modules/chat-citation-staging";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";

describe("CHAT_CITATION_STAGING_PROMPT", () => {
  it("keeps boundary + library handoff; defers staging rules to literature-stage tool", () => {
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("**outside** the project library");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("Literature library");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("[@bibkey]");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain(TOOL_NAMES.literatureStage);
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("[n]");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("on that tool");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain(TOOL_NAMES.literatureDiscover);
    expect(CHAT_CITATION_STAGING_PROMPT).toContain(TOOL_NAMES.literatureSearch);
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("websearch");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("Ask in order");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("Soft workflow");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("Route the request");

    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("Paper Search MCP");

    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("BINDING");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("search_arxiv");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("tool-output");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("discoveredFrom");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("MCP search ≠ session citation");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("prismnext Tools Guide");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain(TOOL_NAMES.literatureRead);
  });
});
