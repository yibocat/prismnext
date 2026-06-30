import { describe, it, expect } from "vitest";
import {
  normalizeDoi,
  normalizeArxivId,
  extractDoisFromText,
  extractArxivFromText,
  arxivIdFromDoi,
} from "../../src/shared/doi-utils";

describe("doi-utils", () => {
  it("normalizes URL-prefixed DOI", () => {
    expect(normalizeDoi("https://doi.org/10.1145/3292500.3330701")).toBe("10.1145/3292500.3330701");
    expect(normalizeDoi("https://dx.doi.org/10.1000/test")).toBe("10.1000/test");
  });

  it("strips trailing punctuation from PDF-extracted DOI", () => {
    expect(normalizeDoi("10.1145/3292500.3330701.")).toBe("10.1145/3292500.3330701");
    expect(normalizeDoi("10.1145/3292500.3330701,")).toBe("10.1145/3292500.3330701");
    expect(normalizeDoi("10.1145/3292500.3330701.pdf")).toBe("10.1145/3292500.3330701");
  });

  it("strips PNAS supplementary path junk", () => {
    expect(normalizeDoi("10.1073/pnas.2311805121/-/DCSupplemental")).toBe("10.1073/pnas.2311805121");
    expect(
      normalizeDoi("https://doi.org/10.1073/pnas.2311805121/-/DCSupplemental"),
    ).toBe("10.1073/pnas.2311805121");
    const text = "See https://doi.org/10.1073/pnas.2311805121/-/DCSupplemental for data.";
    expect(extractDoisFromText(text)).toEqual(["10.1073/pnas.2311805121"]);
  });

  it("rejects invalid DOI", () => {
    expect(normalizeDoi("not-a-doi")).toBeNull();
    expect(normalizeDoi("10.1234/")).toBeNull();
  });

  it("extracts first DOI from noisy text", () => {
    const text = "Published at DOI: 10.1145/3292500.3330701. See also references.";
    const dois = extractDoisFromText(text);
    expect(dois).toEqual(["10.1145/3292500.3330701"]);
  });

  it("normalizes arXiv ID", () => {
    expect(normalizeArxivId("arxiv:2301.12345v2")).toBe("2301.12345v2");
    expect(normalizeArxivId("2301.12345")).toBe("2301.12345");
  });

  it("extracts arXiv from text", () => {
    expect(extractArxivFromText("arXiv:2301.12345v2")).toBe("2301.12345v2");
    expect(extractArxivFromText("https://arxiv.org/abs/2301.12345")).toBe("2301.12345");
  });

  it("extracts arXiv ID from arXiv-assigned DOI", () => {
    expect(arxivIdFromDoi("10.48550/arXiv.2401.12345")).toBe("2401.12345");
    expect(arxivIdFromDoi("10.48550/arXiv.2401.12345v2")).toBe("2401.12345v2");
    expect(arxivIdFromDoi("10.1145/3292500.3330701")).toBeNull();
  });
});
