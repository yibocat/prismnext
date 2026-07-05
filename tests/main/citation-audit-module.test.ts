import { describe, it, expect } from "vitest";
import { CITATION_AUDIT_PROMPT } from "../../src/main/prompts/modules/citation-audit";
import { TOOL_NAMES } from "../../src/shared/tool-names";

describe("CITATION_AUDIT_PROMPT", () => {
  it("binds compliance audit to structured tools — not read/glob or Task scans", () => {
    expect(CITATION_AUDIT_PROMPT).toContain("### Workflow (binding)");
    expect(CITATION_AUDIT_PROMPT).toContain(TOOL_NAMES.latexBibCheck);
    expect(CITATION_AUDIT_PROMPT).toContain(TOOL_NAMES.literatureCiteCheck);
    expect(CITATION_AUDIT_PROMPT).toContain("do **not** substitute read/glob/grep");
    expect(CITATION_AUDIT_PROMPT).toContain("never wrap them in Task");
    expect(CITATION_AUDIT_PROMPT).toContain("Session citation audit (this chat)");
  });
});
