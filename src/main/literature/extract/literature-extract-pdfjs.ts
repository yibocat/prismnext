import * as fs from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXTRACT_PARSER_UNAVAILABLE,
  ExtractParserUnavailableError,
  type PaperExtractSource,
  type PaperExtractSourcePreference,
} from "../../../shared/literature/paper-extract";
import { installPdfjsNodePolyfills } from "../../lib/pdfjs-node-polyfills";

const require = createRequire(__filename);

let availabilityOverride: boolean | null = null;

export function setPdfJsParserAvailableForTest(available: boolean | null): void {
  availabilityOverride = available;
}

function bundledPdfJsWorkerPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "pdf.worker.mjs");
}

export function resolvePdfJsWorkerPath(): string | null {
  try {
    return require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  } catch {
    const bundled = bundledPdfJsWorkerPath();
    return fs.existsSync(bundled) ? bundled : null;
  }
}

export function isPdfJsParserAvailable(): boolean {
  if (availabilityOverride != null) return availabilityOverride;
  return resolvePdfJsWorkerPath() != null;
}

export function resolveExtractParser(
  source: PaperExtractSource | PaperExtractSourcePreference,
  mineruTokenPresent: boolean,
): { ok: true; source: PaperExtractSource } | { ok: false; error: typeof EXTRACT_PARSER_UNAVAILABLE } {
  const resolved: PaperExtractSource =
    source === "auto" ? (mineruTokenPresent ? "mineru" : "pdfjs") : source;
  if (resolved === "html") return { ok: true, source: "html" };
  if (resolved === "mineru") {
    return mineruTokenPresent
      ? { ok: true, source: "mineru" }
      : { ok: false, error: EXTRACT_PARSER_UNAVAILABLE };
  }
  return isPdfJsParserAvailable()
    ? { ok: true, source: "pdfjs" }
    : { ok: false, error: EXTRACT_PARSER_UNAVAILABLE };
}

export function assertExtractParserAvailable(
  source: PaperExtractSource | PaperExtractSourcePreference,
  mineruTokenPresent: boolean,
): PaperExtractSource {
  const decision = resolveExtractParser(source, mineruTokenPresent);
  if (!decision.ok) throw new ExtractParserUnavailableError();
  return decision.source;
}

export interface PdfJsExtractResult {
  markdown: string;
  pageCount: number;
}

let pdfjsModule: typeof import("pdfjs-dist/legacy/build/pdf.mjs") | null = null;

async function loadPdfJs() {
  if (!pdfjsModule) {
    const workerPath = resolvePdfJsWorkerPath();
    if (!workerPath) throw new ExtractParserUnavailableError();
    installPdfjsNodePolyfills();
    pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
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
