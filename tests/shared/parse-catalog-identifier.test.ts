import { describe, expect, it } from "vitest";
import { parseCatalogIdentifier } from "../../src/shared/parse-catalog-identifier";

describe("parseCatalogIdentifier", () => {
  it("parses bare DOI", () => {
    const r = parseCatalogIdentifier("10.1145/3292500.3330701");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doi).toBe("10.1145/3292500.3330701");
  });

  it("parses doi.org URL", () => {
    const r = parseCatalogIdentifier("https://doi.org/10.1038/nature12373");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doi).toBe("10.1038/nature12373");
  });

  it("parses arXiv URL", () => {
    const r = parseCatalogIdentifier("https://arxiv.org/abs/2401.12345");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.arxivId).toBe("2401.12345");
  });

  it("parses bare arXiv id", () => {
    const r = parseCatalogIdentifier("2401.12345");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.arxivId).toBe("2401.12345");
  });

  it("parses arXiv DOI alias", () => {
    const r = parseCatalogIdentifier("10.48550/arXiv.2312.16097");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doi).toBe("10.48550/arXiv.2312.16097");
      expect(r.arxivId).toBe("2312.16097");
    }
  });

  it("parses ISBN with hyphens", () => {
    const r = parseCatalogIdentifier("978-0-13-468599-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.isbn).toBe("9780134685991");
  });

  it("parses PMID URL", () => {
    const r = parseCatalogIdentifier("https://pubmed.ncbi.nlm.nih.gov/12345678/");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pmid).toBe("12345678");
  });

  it("parses bare PMID", () => {
    const r = parseCatalogIdentifier("pmid:9876543");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pmid).toBe("9876543");
  });

  it("parses ADS bibcode URL", () => {
    const r = parseCatalogIdentifier(
      "https://ui.adsabs.harvard.edu/abs/2024ApJ...123L/abstract",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.adsBibcode).toBe("2024ApJ...123L");
  });

  it("parses bare ADS bibcode", () => {
    const r = parseCatalogIdentifier("2023MNRAS.518.1234A");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.adsBibcode).toBe("2023MNRAS.518.1234A");
  });

  it("rejects empty and unknown", () => {
    expect(parseCatalogIdentifier("").ok).toBe(false);
    expect(parseCatalogIdentifier("not-an-id").ok).toBe(false);
  });
});
