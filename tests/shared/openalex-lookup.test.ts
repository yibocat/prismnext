import { describe, expect, it } from "vitest";
import { arxivDoiFromArxivId } from "../../src/shared/doi-utils";
import { openAlexWorkLookupUrl } from "../../src/shared/openalex-lookup";

describe("openAlexWorkLookupUrl", () => {
  it("uses arXiv DataCite DOI for arXiv-only lookup", () => {
    const url = openAlexWorkLookupUrl(null, "2509.24527");
    expect(url).toBe(
      "https://api.openalex.org/works/https://doi.org/10.48550%2Farxiv.2509.24527",
    );
  });

  it("strips version suffix from arXiv DOI", () => {
    expect(arxivDoiFromArxivId("2509.24527v2")).toBe("10.48550/arxiv.2509.24527");
  });

  it("prefers journal DOI over arXiv when both differ", () => {
    const url = openAlexWorkLookupUrl("10.1038/nature12345", "2509.24527");
    expect(url).toBe(
      "https://api.openalex.org/works/https://doi.org/10.1038%2Fnature12345",
    );
  });
});
