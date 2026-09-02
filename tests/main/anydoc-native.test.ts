import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { convertFileToMarkdown } from "../../src/main/lib/anydoc/client";

const FIXTURES = join(__dirname, "../fixtures/documents");

const SAMPLES: Array<{ file: string; token: string }> = [
  { file: "sample.docx", token: "UNIQUE_DOCX_TOKEN" },
  { file: "sample.pptx", token: "UNIQUE_PPTX_TOKEN" },
  { file: "sample.xlsx", token: "UNIQUE_XLSX_TOKEN" },
  { file: "sample.odt", token: "UNIQUE_DOCX_TOKEN" },
  { file: "sample.ods", token: "UNIQUE_ODS_TOKEN" },
  { file: "sample.odp", token: "UNIQUE_ODP_TOKEN" },
  { file: "sample.rtf", token: "UNIQUE_DOCX_TOKEN" },
  { file: "sample.epub", token: "UNIQUE_EPUB_TOKEN" },
  { file: "sample.csv", token: "UNIQUE_CSV_TOKEN" },
  { file: "sample.pdf", token: "UNIQUE_PDF_TOKEN" },
];

describe("anydoc native fixtures", () => {
  it("converts each committed sample to markdown containing its token", async () => {
    for (const sample of SAMPLES) {
      const absPath = join(FIXTURES, sample.file);
      expect(existsSync(absPath), sample.file).toBe(true);
      const result = await convertFileToMarkdown(absPath);
      expect(result.ok, `${sample.file} ${JSON.stringify(result)}`).toBe(true);
      if (!result.ok) continue;
      expect(result.markdown, sample.file).toContain(sample.token);
    }
  });
});
