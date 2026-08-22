import * as fs from "node:fs";
import * as path from "node:path";
import { openLibraryDb, getLibraryPaths } from "../facade";

export interface PaperPdfCacheState {
  cached: boolean;
  stale: boolean;
}

export interface PaperPdfCacheProbe {
  id: string;
  pdf_path?: string | null;
  origin?: string | null;
}

/**
 * Unified cache status — all PDFs live in attachments/ (pdf_path).
 * "stale" = has a zotero_mirror with a version that doesn't match the
 * paper's current state (Zotero item was updated since last download).
 */
export function getPdfCacheStatesForPapers(
  projectRoot: string,
  papers: PaperPdfCacheProbe[],
): Record<string, PaperPdfCacheState> {
  const paths = getLibraryPaths(projectRoot);
  if (!fs.existsSync(paths.dbPath)) return {};
  const db = openLibraryDb(projectRoot);
  const result: Record<string, PaperPdfCacheState> = {};

  for (const paper of papers) {
    const hasLocalPdf = paper.pdf_path
      ? fs.existsSync(path.join(paths.libraryDir, paper.pdf_path))
      : false;

    // Check if there's a zotero_mirror entry (could fetch from Zotero)
    const mirror = db
      .prepare("SELECT zotero_key FROM zotero_mirror WHERE paper_id = ?")
      .get(paper.id) as { zotero_key: string } | undefined;

    if (hasLocalPdf) {
      result[paper.id] = { cached: true, stale: false };
    } else if (mirror) {
      // Has Zotero association but no local PDF yet — can fetch
      result[paper.id] = { cached: false, stale: false };
    } else {
      result[paper.id] = { cached: false, stale: false };
    }
  }
  return result;
}

/** Whether the paper's PDF is available locally. */
export function isPaperPdfCachedLocally(
  projectRoot: string,
  paper: Omit<PaperPdfCacheProbe, "id">,
): boolean {
  if (!paper.pdf_path) return false;
  const paths = getLibraryPaths(projectRoot);
  return fs.existsSync(path.join(paths.libraryDir, paper.pdf_path));
}

/** @deprecated Use getPdfCacheStatesForPapers — cached flag only. */
export function getPdfCacheStatusForPapers(
  projectRoot: string,
  papers: PaperPdfCacheProbe[],
): Record<string, boolean> {
  const states = getPdfCacheStatesForPapers(projectRoot, papers);
  const result: Record<string, boolean> = {};
  for (const [id, state] of Object.entries(states)) {
    result[id] = state.cached;
  }
  return result;
}

// Legacy pdf-cache/ directory helpers — kept for migration of existing cached files.
// New downloads go to attachments/ via literature-pdf-resolve.ts.

export function getPdfCacheDir(projectRoot: string): string {
  return path.join(getLibraryPaths(projectRoot).libraryDir, "pdf-cache");
}

export interface LiteratureStorageStats {
  attachmentCount: number;
  attachmentBytes: number;
  referencedCount: number;
  orphanCount: number;
  orphanBytes: number;
  legacyPdfCacheBytes: number;
}

export interface PruneOrphanAttachmentsResult {
  deletedFiles: number;
  freedBytes: number;
}

function normalizeAttachmentRel(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function collectReferencedAttachmentPaths(projectRoot: string): Set<string> {
  const db = openLibraryDb(projectRoot);
  const rows = db
    .prepare("SELECT pdf_path FROM papers WHERE pdf_path IS NOT NULL")
    .all() as Array<{ pdf_path: string }>;
  return new Set(rows.map((row) => normalizeAttachmentRel(row.pdf_path)));
}

function listAttachmentPdfFiles(attachmentsDir: string): Array<{ rel: string; full: string; size: number }> {
  if (!fs.existsSync(attachmentsDir)) return [];
  const files: Array<{ rel: string; full: string; size: number }> = [];
  for (const name of fs.readdirSync(attachmentsDir)) {
    if (!name.toLowerCase().endsWith(".pdf")) continue;
    const full = path.join(attachmentsDir, name);
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    files.push({
      rel: normalizeAttachmentRel(path.join("attachments", name)),
      full,
      size: stat.size,
    });
  }
  return files;
}

export function getLiteratureStorageStats(projectRoot: string): LiteratureStorageStats {
  const paths = getLibraryPaths(projectRoot);
  const referenced = collectReferencedAttachmentPaths(projectRoot);
  const files = listAttachmentPdfFiles(paths.attachmentsDir);

  let orphanCount = 0;
  let orphanBytes = 0;
  for (const file of files) {
    if (referenced.has(file.rel)) continue;
    orphanCount++;
    orphanBytes += file.size;
  }

  let legacyPdfCacheBytes = 0;
  const legacyDir = getPdfCacheDir(projectRoot);
  if (fs.existsSync(legacyDir)) {
    for (const name of fs.readdirSync(legacyDir)) {
      const full = path.join(legacyDir, name);
      const stat = fs.statSync(full);
      if (stat.isFile()) legacyPdfCacheBytes += stat.size;
    }
  }

  return {
    attachmentCount: files.length,
    attachmentBytes: files.reduce((sum, file) => sum + file.size, 0),
    referencedCount: referenced.size,
    orphanCount,
    orphanBytes,
    legacyPdfCacheBytes,
  };
}

/** Remove PDF files under attachments/ (and legacy pdf-cache/) not referenced by any paper row. */
export function pruneOrphanPdfAttachments(projectRoot: string): PruneOrphanAttachmentsResult {
  const paths = getLibraryPaths(projectRoot);
  const referenced = collectReferencedAttachmentPaths(projectRoot);
  let deletedFiles = 0;
  let freedBytes = 0;

  for (const file of listAttachmentPdfFiles(paths.attachmentsDir)) {
    if (referenced.has(file.rel)) continue;
    fs.unlinkSync(file.full);
    deletedFiles++;
    freedBytes += file.size;
  }

  const legacyDir = getPdfCacheDir(projectRoot);
  if (fs.existsSync(legacyDir)) {
    for (const name of fs.readdirSync(legacyDir)) {
      const full = path.join(legacyDir, name);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile()) continue;
        fs.unlinkSync(full);
        deletedFiles++;
        freedBytes += stat.size;
      } catch {
        // ignore per-file errors
      }
    }
    try {
      if (fs.readdirSync(legacyDir).length === 0) fs.rmdirSync(legacyDir);
    } catch {
      // ignore
    }
  }

  return { deletedFiles, freedBytes };
}
