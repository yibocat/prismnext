import { describe, expect, it } from "vitest";
import { CHAT_CITATION_STAGING_PROMPT } from "../../src/main/prompts/modules/chat-citation-staging";
import { TOOL_NAMES } from "../../src/shared/tool-names";

describe("CHAT_CITATION_STAGING_PROMPT", () => {
  it("keeps boundary + Task handoff; defers BINDING to literature-stage tool", () => {
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("external papers only");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("Project literature library");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("[@bibkey]");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain(TOOL_NAMES.literatureStage);
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("[n]");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("Task handoff (external papers)");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("Session citations (this chat)");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("Orchestrator after such Tasks");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("See that tool for BINDING");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("Paper Search MCP");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("websearch");

    // No duplicate MCP tool laundry list / spill-file essay (those live on the tool).
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("search_arxiv");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("tool-output");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("discoveredFrom");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("MCP search ≠ session citation");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("prismnext Tools Guide");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain(TOOL_NAMES.literatureRead);
  });
});
