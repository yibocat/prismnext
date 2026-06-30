import { describe, expect, it } from "vitest";
import {
  buildPaperAgentContextBlock,
  libraryPdfRelativePath,
} from "@/lib/literature/paper-agent-context";
import type { LiteraturePaper } from "@/types/electron.d";

function samplePaper(overrides: Partial<LiteraturePaper> = {}): LiteraturePaper {
  return {
    id: "p1",
    bibkey: "N98JPVKU",
    title: "Is Distance Matrix Enough for Geometric Deep Learning?",
    authors: JSON.stringify([
      { family: "Li", given: "Zian" },
      { family: "Zhang", given: "Muhan" },
    ]),
    year: 2023,
    venue: "NeurIPS",
    type: "inproceedings",
    abstract: "We study geometric deep learning on graphs.",
    doi: "10.5555/example",
    arxiv_id: null,
    isbn: null,
    pdf_path: "attachments/abc123def4567890.pdf",
    pdf_sha: "abc123",
    origin: "zotero",
    metadata_source: null,
    ...overrides,
  } as LiteraturePaper;
}

describe("libraryPdfRelativePath", () => {
  it("prefixes library dir", () => {
    expect(libraryPdfRelativePath(samplePaper())).toBe(
      ".prismnext/library/attachments/abc123def4567890.pdf",
    );
  });
});

describe("buildPaperAgentContextBlock", () => {
  it("includes publication details from csl_json", () => {
    const block = buildPaperAgentContextBlock(
      samplePaper({
        type: "article",
        venue: "Nature",
        csl_json: JSON.stringify({
          type: "article-journal",
          volume: "36",
          issue: "1",
          page: "1--20",
          publisher: "Nature Publishing",
        }),
      }),
      [],
    );
    expect(block).toContain("**Volume:** 36");
    expect(block).toContain("**Issue:** 1");
    expect(block).toContain("**Pages:** 1–20");
    expect(block).toContain("**Publisher:** Nature Publishing");
  });

  it("includes bibliographic fields, abstract, notes, and pdf path", () => {
    const block = buildPaperAgentContextBlock(samplePaper(), [
      {
        relativePath: "notes/N98JPVKU/2026-06-30-note.md",
        content: "---\npaper_id: p1\nbibkey: N98JPVKU\n---\n\nKey idea: k-DisGNN.",
      },
    ]);
    expect(block).toContain("### @N98JPVKU");
    expect(block).toContain("**Title:** Is Distance Matrix Enough");
    expect(block).toContain("**Authors:**");
    expect(block).toContain("**Year:** 2023");
    expect(block).toContain("**Venue:** NeurIPS");
    expect(block).toContain("We study geometric deep learning");
    expect(block).toContain("notes/N98JPVKU/2026-06-30-note.md");
    expect(block).toContain("Key idea: k-DisGNN");
    expect(block).toContain(".prismnext/library/attachments/");
    expect(block).toContain("path only");
  });
});
