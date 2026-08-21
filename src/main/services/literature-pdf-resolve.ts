import { readFile } from "node:fs/promises";
import {
  fetchItemPdfBytes,
  getItemPdfAttachmentKey,
  type PdfDownloadProgressCallback,
} from "./zotero-client";
import {
  getPaper,
  getZoteroMirrorByPaperId,
  openLibraryDb,
  readPaperPdfBytes,
  attachPdfBufferToPaper,
  resolvePaperPdfPath,
  type PaperRow,
} from "./literature-service";

export type PaperPdfSource = "zotero" | "local" | "none";

export type PdfResolveProgress = {
  phase: "resolving" | "downloading" | "caching" | "reading";
  receivedBytes?: number;
  totalBytes?: number | null;
};

export function derivePaperPdfSource(paper: PaperRow): PaperPdfSource {
  // After refactor, pdf_path is the single source of truth for "has local PDF".
  // origin='zotero' means it came from Zotero (but the file is still in attachments/).
  if (paper.pdf_path) return paper.origin === "zotero" ? "zotero" : "local";
  // No pdf_path but has zotero_mirror → could fetch from Zotero
  return "none";
}

interface ResolvedPdfResource {
  bytes: Buffer | null;
  absPath: string | null;
  source: PaperPdfSource;
}

function mapDownloadProgress(
  onProgress?: (info: PdfResolveProgress) => void,
): PdfDownloadProgressCallback | undefined {
  if (!onProgress) return undefined;
  return (info) => {
    onProgress({
      phase: "downloading",
      receivedBytes: info.receivedBytes,
      totalBytes: info.totalBytes,
    });
  };
}

/** Store downloaded PDF bytes as a local attachment (unified storage). */
function storeDownloadedPdf(
  projectRoot: string,
  paperId: string,
  bytes: Buffer,
): string {
  const paper = attachPdfBufferToPaper(projectRoot, paperId, bytes);
  if (!paper.pdf_path) throw new Error("Failed to store PDF");
  const abs = resolvePaperPdfPath(projectRoot, paper);
  if (!abs) throw new Error("Failed to store PDF");
  return abs;
}

/**
 * Unified PDF resolver — all PDFs live in attachments/.
 * Flow: pdf_path (local or previously downloaded) → Zotero fetch → none.
 */
async function resolvePdfResource(
  projectRoot: string,
  paperId: string,
  onProgress?: (info: PdfResolveProgress) => void,
): Promise<ResolvedPdfResource> {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) return { bytes: null, absPath: null, source: "none" };

  // 1. Already has a local PDF (unified path — covers both local imports and previously-downloaded Zotero PDFs)
  if (paper.pdf_path) {
    const abs = resolvePaperPdfPath(projectRoot, paper);
    if (!abs) return { bytes: null, absPath: null, source: "none" };
    onProgress?.({ phase: "reading" });
    return { bytes: null, absPath: abs, source: paper.origin === "zotero" ? "zotero" : "local" };
  }

  // 2. Has Zotero mirror → fetch from Zotero and store as local attachment
  const mirror = getZoteroMirrorByPaperId(projectRoot, paperId);
  if (!mirror) return { bytes: null, absPath: null, source: "none" };

  let attachKey = mirror.zotero_attach_key;
  if (!attachKey) {
    onProgress?.({ phase: "resolving" });
    attachKey = await getItemPdfAttachmentKey(mirror.zotero_key);
    if (attachKey) {
      const db = openLibraryDb(projectRoot);
      db.prepare(
        "UPDATE zotero_mirror SET zotero_attach_key = ? WHERE paper_id = ?",
      ).run(attachKey, paperId);
    }
  }
  if (!attachKey) return { bytes: null, absPath: null, source: "zotero" };

  const bytes = await fetchItemPdfBytes(attachKey, undefined, mapDownloadProgress(onProgress));
  if (!bytes) return { bytes: null, absPath: null, source: "zotero" };

  const buf = Buffer.from(bytes);
  onProgress?.({ phase: "caching" });
  const absPath = storeDownloadedPdf(projectRoot, paperId, buf);
  onProgress?.({ phase: "reading" });
  return { bytes: null, absPath, source: "zotero" };
}

export async function resolvePaperPdfBytes(
  projectRoot: string,
  paperId: string,
  onProgress?: (info: PdfResolveProgress) => void,
): Promise<Buffer | null> {
  const resource = await resolvePdfResource(projectRoot, paperId, onProgress);
  if (resource.bytes) return resource.bytes;
  if (!resource.absPath) return null;
  onProgress?.({ phase: "reading" });
  return await readFile(resource.absPath);
}

/** Ensure PDF is on disk and return absolute path. */
export async function ensurePaperPdfAbsPath(
  projectRoot: string,
  paperId: string,
  onProgress?: (info: PdfResolveProgress) => void,
): Promise<string | null> {
  const resource = await resolvePdfResource(projectRoot, paperId, onProgress);
  return resource.absPath;
}
