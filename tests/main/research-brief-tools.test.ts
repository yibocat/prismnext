import { describe, expect, it } from "vitest";
import { getNativeToolByName } from "../../src/main/agent/tools/index";
import { PROJECT_BRIEF_PROMPT } from "../../src/main/prompts";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";

describe("research-brief-read tool", () => {
  const read = getNativeToolByName(TOOL_NAMES.researchBriefRead);
  const update = getNativeToolByName(TOOL_NAMES.researchBriefUpdate);

  it("has promptGuidelines aligned with project-brief module (read to align, not memorize)", () => {
    expect(read?.promptGuidelines?.length).toBeGreaterThan(0);
    const text = read!.promptGuidelines!.join(" ");
    expect(text).toContain("align");
    expect(text).toContain("not to memorize");
    expect(text).toContain("Research design");
    expect(text).toContain(TOOL_NAMES.researchBriefUpdate);
    expect(text).toContain("brief wins");
    expect(text).toContain("generic `read`");
  });

  it("description matches project-brief disk spine framing", () => {
    expect(read?.description).toContain(".brief.md");
    expect(read?.description).toContain("sections");
    expect(PROJECT_BRIEF_PROMPT).toContain("intellectual spine");
    expect(PROJECT_BRIEF_PROMPT).toContain(TOOL_NAMES.researchBriefRead);
  });

  it("update tool still owns write how-to", () => {
    expect(update?.promptGuidelines?.join(" ")).toContain("ONLY sanctioned way to write");
  });
});
