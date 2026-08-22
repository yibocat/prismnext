import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/main/app/settings", () => ({
  getSettings: vi.fn(() => ({ zoteroUserId: "12345", zoteroApiKey: "secret" })),
  updateSettings: vi.fn(),
}));
vi.mock("../../src/main/literature/zotero/zotero-client", () => ({
  findZoteroItemByIdentifier: vi.fn().mockResolvedValue(null),
  getItemPdfAttachmentKey: vi.fn().mockResolvedValue(null),
  resolveItemBibliographies: vi.fn().mockResolvedValue({}),
}));

import { paperNeedsCatalogEnrich } from "../../src/main/literature/enrich";
import type { PaperRow } from "../../src/main/literature/facade";

function stubPaper(overrides: Partial<PaperRow> = {}): PaperRow {
  return {
    id: "id",
    bibkey: "smith2024",
    title: "smith2024",
    authors: null,
    year: 2024,
    abstract: null,
    doi: "10.1000/test",
    arxiv_id: null,
    isbn: null,
    venue: null,
    type: "article",
    pdf_path: null,
    pdf_sha: null,
    source: "zotero",
    raw_bibtex: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("paperNeedsCatalogEnrich", () => {
  it("returns false when no identifiers", () => {
    expect(paperNeedsCatalogEnrich(stubPaper({ doi: null, arxiv_id: null }))).toBe(false);
  });

  it("returns true when doi present but abstract and venue missing", () => {
    expect(paperNeedsCatalogEnrich(stubPaper())).toBe(true);
  });

  it("returns false when bib entry already has abstract and venue", () => {
    expect(
      paperNeedsCatalogEnrich(
        stubPaper({
          title: "A Paper",
          abstract: "Full abstract.",
          venue: "Nature",
        }),
      ),
    ).toBe(false);
  });
});
