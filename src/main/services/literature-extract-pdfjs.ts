import * as fs from "node:fs";
import { createRequire } from "node:module";
import { installPdfjsNodePolyfills } from "../lib/pdfjs-node-polyfills";

const require = createRequire(__filename);

export interface PdfJsExtractResult {
  markdown: string;
  pageCount: number;
}

let pdfjsModule: typeof import("pdfjs-dist/legacy/build/pdf.mjs") | null = null;

async function loadPdfJs() {
  if (!pdfjsModule) {
    installPdfjsNodePolyfills();
    pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjsModule.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
  }
  return pdfjsModule;
}

export async function extractPdfTextWithPdfJs(pdfAbsPath: string): Promise<PdfJsExtractResult> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(fs.readFileSync(pdfAbsPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pageCount = doc.numPages;
  const chunks: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    chunks.push(`<!-- page:${pageNum} -->\n\n${text}`);
  }

  await doc.destroy();
  return {
    markdown: chunks.join("\n\n"),
    pageCount,
  };
}
