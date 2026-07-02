import { describe, expect, it } from "vitest";
import {
  checkPdfMatchesEntry,
  normalizeLiteratureIdentifiers,
} from "../../src/shared/literature-pdf-identity";

describe("literature-pdf-identity", () => {
  it("matches when DOI agrees", () => {
    expect(
      checkPdfMatchesEntry(
        { doi: "10.1038/nature12345", arxiv_id: null },
        { doi: "10.1038/nature12345", arxivId: null },
      ),
    ).toBe("match");
  });

  it("detects mismatch when DOI differs", () => {
    expect(
      checkPdfMatchesEntry(
        { doi: "10.1038/nature12345", arxiv_id: null },
        { doi: "10.1145/1234567.1234567", arxivId: null },
      ),
    ).toBe("mismatch");
  });

  it("flags unverified when entry has DOI but PDF has none", () => {
    expect(
      checkPdfMatchesEntry(
        { doi: "10.1038/nature12345", arxiv_id: null },
        { doi: null, arxivId: null },
      ),
    ).toBe("unverified");
  });

  it("allows attach when entry has no identifiers", () => {
    expect(
      checkPdfMatchesEntry({ doi: null, arxiv_id: null }, { doi: "10.1038/nature12345", arxivId: null }),
    ).toBe("match");
  });

  it("normalizes arxiv from DOI form", () => {
    const ids = normalizeLiteratureIdentifiers({ doi: "10.48550/arXiv.1706.03762", arxivId: null });
    expect(ids.arxivId).toBeTruthy();
  });
});
