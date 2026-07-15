import { describe, it, expect } from "vitest";
import { CHAT_CITATION_STAGING_PROMPT } from "../../src/main/prompts/modules/chat-citation-staging";
import { TOOL_NAMES } from "../../src/shared/tool-names";

describe("CHAT_CITATION_STAGING_PROMPT", () => {
  it("is external-citation workflow only — not a tool catalog or library module", () => {
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("external papers only");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("Project literature library");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("[@bibkey]");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain(TOOL_NAMES.literatureStage);
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("[n]");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("Task expert handoff (external papers)");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("Session citations (this chat)");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("Orchestrator after external literature Tasks");

    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("Task tool");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("Prism Tools Guide");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain(TOOL_NAMES.literatureRead);
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("| refId | Title | Year |");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("Two citation styles");

    expect(CHAT_CITATION_STAGING_PROMPT).toContain("paper-search-mcp");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("search_papers");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("discoveredFrom");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("MCP search ≠ session citation");
    // websearch allowed only as named fallback
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("websearch");
  });
});
