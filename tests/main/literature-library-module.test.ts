import { describe, it, expect } from "vitest";
import { LITERATURE_LIBRARY_PROMPT } from "../../src/main/prompts/modules/literature-library";
import { TOOL_NAMES } from "../../src/shared/tool-names";

describe("LITERATURE_LIBRARY_PROMPT", () => {
  it("is library-citation workflow only — not external staging or tool catalog", () => {
    expect(LITERATURE_LIBRARY_PROMPT).toContain(".prismnext/library/");
    expect(LITERATURE_LIBRARY_PROMPT).toContain("Chat paper citations");
    expect(LITERATURE_LIBRARY_PROMPT).toContain("[@bibkey]");
    expect(LITERATURE_LIBRARY_PROMPT).toContain(TOOL_NAMES.literatureSearch);
    expect(LITERATURE_LIBRARY_PROMPT).toContain(TOOL_NAMES.literatureRead);
    expect(LITERATURE_LIBRARY_PROMPT).not.toContain(TOOL_NAMES.literatureStage);
    expect(LITERATURE_LIBRARY_PROMPT).not.toContain("tag=");
    expect(LITERATURE_LIBRARY_PROMPT).toContain("Task handoff");
    expect(LITERATURE_LIBRARY_PROMPT).toContain("Library papers (this Task)");

    expect(LITERATURE_LIBRARY_PROMPT).not.toContain("| bibkey | Title | Year |");
    expect(LITERATURE_LIBRARY_PROMPT).not.toContain("| What you used | Tool |");
    expect(LITERATURE_LIBRARY_PROMPT).not.toContain("websearch");
    expect(LITERATURE_LIBRARY_PROMPT).not.toContain("prismnext Tools Guide");
    expect(LITERATURE_LIBRARY_PROMPT).not.toContain("BINDING");
  });
});
