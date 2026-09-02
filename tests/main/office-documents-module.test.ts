import { describe, expect, it } from "vitest";
import { ALL_MODULES, OFFICE_DOCUMENTS_PROMPT } from "../../src/main/prompts";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";

describe("OFFICE_DOCUMENTS_PROMPT", () => {
  it("is registered as a shared profile module", () => {
    const mod = ALL_MODULES.find((m) => m.key === "office-documents");
    expect(mod?.profileOnly).toBe(true);
    expect(mod?.orchestratorOnly).toBeFalsy();
    expect(mod?.expertOnly).toBeFalsy();
    expect(mod?.enabled).toBe(true);
  });

  it("routes local Office/PDF files to document-read and library PDFs to literature-read-pdf", () => {
    expect(OFFICE_DOCUMENTS_PROMPT).toContain("Local documents");
    expect(OFFICE_DOCUMENTS_PROMPT).toContain(TOOL_NAMES.documentRead);
    expect(OFFICE_DOCUMENTS_PROMPT).toContain(TOOL_NAMES.literatureReadPdf);
    expect(OFFICE_DOCUMENTS_PROMPT).toContain("Composer vs tool");
    expect(OFFICE_DOCUMENTS_PROMPT).toContain("substitute another manuscript");
    expect(OFFICE_DOCUMENTS_PROMPT).toContain("Honesty");
    expect(OFFICE_DOCUMENTS_PROMPT).toContain("say you cannot read it");
    expect(OFFICE_DOCUMENTS_PROMPT).toContain("When not to use");
    expect(OFFICE_DOCUMENTS_PROMPT).toContain("MinerU");
    expect(OFFICE_DOCUMENTS_PROMPT).not.toContain("BINDING");
    expect(OFFICE_DOCUMENTS_PROMPT).not.toContain("maxChars");
    expect(OFFICE_DOCUMENTS_PROMPT).not.toContain("toMarkdown");
  });
});
