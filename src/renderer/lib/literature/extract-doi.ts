import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  extractArxivFromText,
  extractDoisFromText,
  normalizeArxivId,
  normalizeDoi,
} from "../../../shared/doi-utils";

GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface ExtractedIds {
  doi: string | null;
  arxivId: string | null;
}

/**
 * Renderer-only: pdfjs page-1 + metadata extraction (browser APIs available).
 * Used when main-process byte scan finds nothing.
 */
export async function extractIdsFromPdf(bytes: Uint8Array, fileNameHint?: string): Promise<ExtractedIds> {
  try {
    const doc = await getDocument({ data: bytes.slice() }).promise;

    let metaBlob = "";
    try {
      const meta = await doc.getMetadata();
      if (meta?.info) {
        metaBlob += Object.values(meta.info).filter(Boolean).join(" ");
      }
      if (meta?.metadata) metaBlob += ` ${meta.metadata}`;
    } catch {
      // optional
    }

    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const page1Text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");

    const doi =
      extractDoisFromText(page1Text)[0] ??
      extractDoisFromText(metaBlob)[0] ??
      (fileNameHint ? extractDoisFromText(fileNameHint)[0] : null) ??
      null;

    const arxivId =
      extractArxivFromText(page1Text) ??
      extractArxivFromText(metaBlob) ??
      (fileNameHint ? extractArxivFromText(fileNameHint) : null) ??
      null;

    return {
      doi: doi ? normalizeDoi(doi) : null,
      arxivId: arxivId ? normalizeArxivId(arxivId) : null,
    };
  } catch (err) {
    console.error("[literature] extractIdsFromPdf failed:", err);
    return { doi: null, arxivId: null };
  }
}

export { normalizeDoi, normalizeArxivId } from "../../../shared/doi-utils";
