import { describe, it, expect } from "vitest";
import { arxivPdfUrl } from "../../src/main/lib/download-pdf";

describe("arxivPdfUrl", () => {
  it("builds arxiv pdf url from id", () => {
    expect(arxivPdfUrl("2401.12345")).toBe("https://arxiv.org/pdf/2401.12345.pdf");
    expect(arxivPdfUrl("arxiv:2401.12345v2")).toBe("https://arxiv.org/pdf/2401.12345v2.pdf");
  });

  it("returns null for invalid ids", () => {
    expect(arxivPdfUrl(null)).toBeNull();
    expect(arxivPdfUrl("not-an-arxiv-id")).toBeNull();
  });
});
