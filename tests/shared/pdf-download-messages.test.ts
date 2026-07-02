import { describe, expect, it } from "vitest";
import {
  formatPdfDownloadFailure,
  joinPdfAttachAttempts,
  PDF_ATTACH_NO_OA_URL,
  PDF_ATTACH_PAYWALL_FALLBACK,
} from "../../src/shared/pdf-download-messages";

describe("formatPdfDownloadFailure", () => {
  it("maps paywall fallback without losing manual-import guidance", () => {
    const out = formatPdfDownloadFailure(PDF_ATTACH_PAYWALL_FALLBACK);
    expect(out.title).toBe("No open-access PDF found");
    expect(out.description).toContain("subscription-only");
    expect(out.description).toContain("Import PDF");
  });

  it("maps no OA URL with catalog-specific detail", () => {
    const out = formatPdfDownloadFailure(PDF_ATTACH_NO_OA_URL);
    expect(out.title).toBe("No open-access PDF found");
    expect(out.description).toContain("no public PDF download link");
  });

  it("maps rate limit errors with service detail", () => {
    const out = formatPdfDownloadFailure(
      "[bibliographic-metadata] Semantic Scholar rate limited (429)",
    );
    expect(out.title).toBe("PDF lookup temporarily limited");
    expect(out.description).toContain("Semantic Scholar");
    expect(out.description).toContain("429");
  });

  it("preserves multi-step attempt errors in description", () => {
    const raw = joinPdfAttachAttempts([
      "arXiv: PDF download failed: HTTP 404",
      "Catalog lookup: [bibliographic-metadata] Semantic Scholar rate limited (429)",
    ])!;
    const out = formatPdfDownloadFailure(raw);
    expect(out.title).toBe("Could not download PDF");
    expect(out.description).toContain("arXiv: PDF download failed: HTTP 404");
    expect(out.description).toContain("Catalog lookup:");
  });

  it("adds HTTP hint for status codes", () => {
    const out = formatPdfDownloadFailure("PDF download failed: HTTP 403");
    expect(out.title).toBe("PDF download failed");
    expect(out.description).toContain("HTTP 403");
    expect(out.description).toContain("subscription");
  });

  it("handles empty error with fallback detail", () => {
    const out = formatPdfDownloadFailure("");
    expect(out.title).toBe("Could not download PDF");
    expect(out.description).toContain("No error details");
  });
});

describe("joinPdfAttachAttempts", () => {
  it("joins non-empty parts", () => {
    expect(
      joinPdfAttachAttempts(["arXiv: HTTP 404", undefined, "Open-access link: not a PDF"]),
    ).toBe("arXiv: HTTP 404 · Open-access link: not a PDF");
  });
});
