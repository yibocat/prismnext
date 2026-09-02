import { describe, expect, it } from "vitest";
import { WEB_RESEARCH_PROMPT } from "../../src/main/prompts";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";

describe("WEB_RESEARCH_PROMPT", () => {
  it("covers general web lookup — not library papers or staging how-to", () => {
    expect(WEB_RESEARCH_PROMPT).toContain("docs, tools & data");
    expect(WEB_RESEARCH_PROMPT).toContain("Chat paper citations");
    expect(WEB_RESEARCH_PROMPT).toContain("Project literature library");
    expect(WEB_RESEARCH_PROMPT).toContain(TOOL_NAMES.websearch);
    expect(WEB_RESEARCH_PROMPT).toContain(TOOL_NAMES.webfetch);
    expect(WEB_RESEARCH_PROMPT).toContain(TOOL_NAMES.literatureDiscover);
    expect(WEB_RESEARCH_PROMPT).toContain(TOOL_NAMES.literatureSearch);
    expect(WEB_RESEARCH_PROMPT).toContain("Route the request");
    expect(WEB_RESEARCH_PROMPT).toContain("not exhaustive");
    expect(WEB_RESEARCH_PROMPT).toContain("Search judgment");
    expect(WEB_RESEARCH_PROMPT).toContain("When not to use");

    expect(WEB_RESEARCH_PROMPT).not.toContain(TOOL_NAMES.literatureStage);
    expect(WEB_RESEARCH_PROMPT).not.toContain("BINDING");
    expect(WEB_RESEARCH_PROMPT).not.toContain("maxResults");
    expect(WEB_RESEARCH_PROMPT).not.toContain("discoveredFrom");
  });
});
