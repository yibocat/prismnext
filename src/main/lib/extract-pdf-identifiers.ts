import * as fs from "node:fs";
import * as path from "node:path";
import {
  extractArxivFromText,
  extractDoisFromText,
  normalizeArxivId,
  normalizeDoi,
} from "../../shared/doi-utils";

export interface ExtractedPdfIdentifiers {
  doi: string | null;
  arxivId: string | null;
}

/** Scan decoded PDF bytes for DOI/arXiv (no pdfjs — safe in Electron main). */
function extractIdsFromDecodedPdfText(text: string, fileNameHint?: string): ExtractedPdfIdentifiers {
  const head = text.slice(0, 120_000);

  const doi =
    extractDoisFromText(head)[0] ??
    extractDoisFromText(text)[0] ??
    (fileNameHint ? extractDoisFromText(fileNameHint)[0] : null) ??
    null;

  const arxivId =
    extractArxivFromText(head) ??
    extractArxivFromText(text) ??
    (fileNameHint ? extractArxivFromText(fileNameHint) : null) ??
    null;

  return {
    doi: doi ? normalizeDoi(doi) : null,
    arxivId: arxivId ? normalizeArxivId(arxivId) : null,
  };
}

/**
 * Extract DOI / arXiv from PDF file via byte-stream scan (main-process safe).
 * Many publisher PDFs embed identifiers as plain text in the stream.
 */
export function extractIdsFromPdfFile(filePath: string): ExtractedPdfIdentifiers {
  const bytes = fs.readFileSync(filePath);
  const hint = path.basename(filePath);
  const latin1 = bytes.toString("latin1");
  const fromLatin = extractIdsFromDecodedPdfText(latin1, hint);
  if (fromLatin.doi || fromLatin.arxivId) return fromLatin;

  try {
    const utf8 = bytes.toString("utf8");
    return extractIdsFromDecodedPdfText(utf8, hint);
  } catch {
    return fromLatin;
  }
}

export async function extractIdsFromPdfBytes(
  bytes: Uint8Array,
  fileNameHint?: string,
): Promise<ExtractedPdfIdentifiers> {
  const latin1 = Buffer.from(bytes).toString("latin1");
  const fromLatin = extractIdsFromDecodedPdfText(latin1, fileNameHint);
  if (fromLatin.doi || fromLatin.arxivId) return fromLatin;
  try {
    return extractIdsFromDecodedPdfText(Buffer.from(bytes).toString("utf8"), fileNameHint);
  } catch {
    return fromLatin;
  }
}
