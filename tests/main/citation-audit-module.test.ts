import { describe, it, expect } from "vitest";
import { CITATION_AUDIT_PROMPT } from "../../src/main/prompts/modules/citation-audit";
import { TOOL_NAMES } from "../../src/shared/tool-names";

describe("CITATION_AUDIT_PROMPT", () => {
  it("binds compliance audit to the unified citation-health tool — not read/glob or Task scans", () => {
    expect(CITATION_AUDIT_PROMPT).toContain("### Workflow (binding)");
    expect(CITATION_AUDIT_PROMPT).toContain(TOOL_NAMES.citationHealth);
    expect(CITATION_AUDIT_PROMPT).toContain("do **not** substitute read/glob/grep");
    expect(CITATION_AUDIT_PROMPT).toContain("never wrap");
    expect(CITATION_AUDIT_PROMPT).toContain("Session citation audit (this chat)");
  });

  it("no longer references the removed split audit tools", () => {
    expect(CITATION_AUDIT_PROMPT).not.toContain("latex-bib-check");
    expect(CITATION_AUDIT_PROMPT).not.toContain("literature-cite-check");
  });
});
