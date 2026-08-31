import { describe, expect, it } from "vitest";
import { CITATION_AUDIT_PROMPT } from "../../src/main/prompts";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";

describe("CITATION_AUDIT_PROMPT", () => {
  it("points at citation-health for when-to-call (how-to lives on the tool)", () => {
    expect(CITATION_AUDIT_PROMPT).toContain(TOOL_NAMES.citationHealth);
    expect(CITATION_AUDIT_PROMPT).toContain("When this applies");
    expect(CITATION_AUDIT_PROMPT).toContain("Session citation audit (this chat)");
    expect(CITATION_AUDIT_PROMPT).toContain("Compliance model");
    expect(CITATION_AUDIT_PROMPT).toContain("LaTeX and Typst");
    expect(CITATION_AUDIT_PROMPT).toContain("Not symmetric");
    expect(CITATION_AUDIT_PROMPT).not.toContain("peer-reviewer");
    expect(CITATION_AUDIT_PROMPT).not.toContain("Ask in order");
    expect(CITATION_AUDIT_PROMPT).not.toContain("binding rules");
    expect(CITATION_AUDIT_PROMPT).not.toContain("### Workflow (binding)");
    expect(CITATION_AUDIT_PROMPT).not.toContain("latex-bib-check");
    expect(CITATION_AUDIT_PROMPT).not.toContain("literature-cite-check");
  });
});
