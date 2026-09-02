import { describe, expect, it } from "vitest";
import {
  DOCUMENT_READ_EXTENSIONS,
  documentReadFormatId,
  documentReadFormatLabel,
  isDocumentReadExtension,
} from "../../src/shared/document/formats";

describe("document-read format whitelist", () => {
  it("accepts Office, OpenDocument, RTF, EPUB, CSV, and PDF", () => {
    const yes = [
      "notes.docx",
      "legacy.doc",
      "deck.pptx",
      "sheet.xlsx",
      "brief.odt",
      "table.ods",
      "slides.odp",
      "memo.rtf",
      "book.epub",
      "data.csv",
      "draft.pdf",
      "/abs/path/Q3.PPTX",
      "win\\\\folder\\\\a.docm",
    ];
    for (const path of yes) {
      expect(isDocumentReadExtension(path), path).toBe(true);
    }
  });

  it("rejects markdown, TeX, archives, and Hangul", () => {
    const no = ["readme.md", "main.tex", "archive.zip", "hangul.hwp", "notes.txt", "photo.png"];
    for (const path of no) {
      expect(isDocumentReadExtension(path), path).toBe(false);
    }
  });

  it("lists dotted lowercase extensions", () => {
    expect(DOCUMENT_READ_EXTENSIONS).toContain(".docx");
    expect(DOCUMENT_READ_EXTENSIONS).toContain(".pdf");
    expect(DOCUMENT_READ_EXTENSIONS).toContain(".csv");
    for (const ext of DOCUMENT_READ_EXTENSIONS) {
      expect(ext.startsWith(".")).toBe(true);
      expect(ext).toBe(ext.toLowerCase());
    }
  });

  it("labels and ids come from the extension", () => {
    expect(documentReadFormatLabel("a/b/c.Pptx")).toBe("PPTX");
    expect(documentReadFormatId("a/b/c.Pptx")).toBe("pptx");
    expect(documentReadFormatLabel("noext")).toBe("DOCUMENT");
    expect(documentReadFormatId("noext")).toBe("unknown");
  });
});
