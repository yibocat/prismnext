import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { suggestBibkey } from "../../shared/literature/bibkey-utils";
import { coerceStoredDoi, normalizeArxivId, normalizeDoi } from "../../shared/literature/doi-utils";
import {
  checkPdfMatchesEntry,
  normalizeLiteratureIdentifiers,
} from "../../shared/literature/pdf-identity";
import { extractIdsFromPdfFile } from "../lib/extract-pdf-identifiers";
import { recordDownloadProvenance } from "../experiment/provenance-service";
import { findExistingPaper, newId, openLibraryDb, syncFtsForPaper, uniqueBibkey } from "./db";
import { applyIdentifiers, getPaper } from "./papers";
import { getLibraryPaths, libraryDisplayRel } from "./paths";
import type { PaperRow } from "./types";
import { materializeZoteroPaperIfLinked } from "./zotero";

/** Unified PDF storage — writes bytes to attachments/<sha16>.pdf, returns relative path + sha. */
function storePdfBytes(projectRoot: string, buf: Buffer): { relativePath: string; sha: string } {
  const paths = getLibraryPaths(projectRoot);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const rel = path.join("attachments", `${sha.slice(0, 16)}.pdf`);
  const dest = path.join(paths.libraryDir, rel);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(paths.attachmentsDir, { recursive: true });
    fs.writeFileSync(dest, buf);
  }
  return { relativePath: rel.replace(/\\/g, "/"), sha };
}

/** Copy a PDF file from disk into attachments/ (used by ingestPdf). */
export function storePdfAttachment(projectRoot: string, sourcePath: string): { relativePath: string; sha: string } {
  const buf = fs.readFileSync(sourcePath);
  return storePdfBytes(projectRoot, buf);
}


/** Attach downloaded or in-memory PDF bytes to a library entry (skip if already has PDF). */
export function attachPdfBufferToPaper(projectRoot: string, paperId: string, buf: Buffer): PaperRow {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) throw new Error("Paper not found");
  if (paper.pdf_path) return paper;

  const { relativePath, sha } = storePdfBytes(projectRoot, buf);
  const db = openLibraryDb(projectRoot);
  const now = Date.now();
  db.prepare("UPDATE papers SET pdf_path = ?, pdf_sha = ?, updated_at = ? WHERE id = ?").run(
    relativePath,
    sha,
    now,
    paperId,
  );
  materializeZoteroPaperIfLinked(projectRoot, paperId);
  return getPaper(projectRoot, paperId)!;
}

/**
 * Record a `download_recorded` provenance event for a library PDF (Phase 1.1).
 * `paper.pdf_path` is library-relative; provenance stores the `library/` display path.
 */
export function recordPdfDownload(
  projectRoot: string,
  paper: PaperRow,
  source: "paper-search-mcp" | "literature-ingest" | "manual",
  sourceUrl: string | null,
  bytes: number | null,
): void {
  if (!paper?.pdf_path) return;
  recordDownloadProvenance(projectRoot, {
    artifactPath: libraryDisplayRel(paper.pdf_path),
    source,
    identifier: paper.doi ?? paper.arxiv_id ?? null,
    sourceUrl,
    bytes,
  });
}

/** Replace an entry's PDF (new sha) — triggers extract invalidation in caller. */
export function replacePdfFromFile(
  projectRoot: string,
  paperId: string,
  sourcePath: string,
): { paper: PaperRow; replaced: boolean } {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) throw new Error("Paper not found");

  const buf = fs.readFileSync(sourcePath);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (paper.pdf_sha === sha) {
    return { paper, replaced: false };
  }

  const { relativePath, sha: storedSha } = storePdfBytes(projectRoot, buf);
  const db = openLibraryDb(projectRoot);
  const now = Date.now();
  db.prepare("UPDATE papers SET pdf_path = ?, pdf_sha = ?, updated_at = ? WHERE id = ?").run(
    relativePath,
    storedSha,
    now,
    paperId,
  );
  return { paper: getPaper(projectRoot, paperId)!, replaced: true };
}

export type AttachLocalPdfConflict =
  | {
      kind: "sha_duplicate";
      otherPaper: PaperRow;
    }
  | {
      kind: "identifier_duplicate";
      otherPaper: PaperRow;
      doi: string | null;
      arxivId: string | null;
    }
  | {
      kind: "target_mismatch";
      entryDoi: string | null;
      entryArxivId: string | null;
      pdfDoi: string | null;
      pdfArxivId: string | null;
    }
  | {
      kind: "target_unverified";
      entryDoi: string | null;
      entryArxivId: string | null;
    };

export interface AttachLocalPdfResult {
  paper: PaperRow;
  attached: boolean;
  replaced: boolean;
  conflict?: AttachLocalPdfConflict;
  attachError?: string;
}

function assertPdfBuffer(buf: Buffer): void {
  if (buf.length < 5 || buf.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw new Error("File is not a PDF");
  }
}

/** Attach or replace a local PDF file on a specific library entry. */
export function attachLocalPdfToPaper(
  projectRoot: string,
  paperId: string,
  sourcePath: string,
  opts?: { ignoreIdentifierConflict?: boolean },
): AttachLocalPdfResult {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) throw new Error("Paper not found");

  let buf: Buffer;
  try {
    buf = fs.readFileSync(sourcePath);
    assertPdfBuffer(buf);
  } catch (err) {
    return {
      paper,
      attached: false,
      replaced: false,
      attachError: err instanceof Error ? err.message : String(err),
    };
  }

  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const db = openLibraryDb(projectRoot);
  const extracted = extractIdsFromPdfFile(sourcePath);
  const normDoi = extracted.doi ? normalizeDoi(extracted.doi) : null;
  const normArxiv = extracted.arxivId ? normalizeArxivId(extracted.arxivId) : null;
  const entryIds = normalizeLiteratureIdentifiers(paper);

  if (!opts?.ignoreIdentifierConflict) {
    const identity = checkPdfMatchesEntry(paper, { doi: normDoi, arxivId: normArxiv });
    if (identity === "mismatch") {
      return {
        paper,
        attached: false,
        replaced: false,
        conflict: {
          kind: "target_mismatch",
          entryDoi: entryIds.doi,
          entryArxivId: entryIds.arxivId,
          pdfDoi: normDoi,
          pdfArxivId: normArxiv,
        },
      };
    }
    if (identity === "unverified") {
      return {
        paper,
        attached: false,
        replaced: false,
        conflict: {
          kind: "target_unverified",
          entryDoi: entryIds.doi,
          entryArxivId: entryIds.arxivId,
        },
      };
    }
  }

  const shaDup = findExistingPaper(db, { pdfSha: sha, excludeId: paperId });
  if (shaDup) {
    return { paper, attached: false, replaced: false, conflict: { kind: "sha_duplicate", otherPaper: shaDup } };
  }

  if (!opts?.ignoreIdentifierConflict && (normDoi || normArxiv)) {
    const idDup = findExistingPaper(db, { doi: normDoi, arxivId: normArxiv, excludeId: paperId });
    if (idDup) {
      return {
        paper,
        attached: false,
        replaced: false,
        conflict: {
          kind: "identifier_duplicate",
          otherPaper: idDup,
          doi: normDoi,
          arxivId: normArxiv,
        },
      };
    }
  }

  const hadPdf = Boolean(paper.pdf_path);
  let resultPaper: PaperRow;
  let attached = false;
  let replaced = false;

  try {
    if (hadPdf) {
      const replaceResult = replacePdfFromFile(projectRoot, paperId, sourcePath);
      resultPaper = replaceResult.paper;
      replaced = replaceResult.replaced;
      attached = replaceResult.replaced;
    } else {
      resultPaper = attachPdfBufferToPaper(projectRoot, paperId, buf);
      attached = Boolean(resultPaper.pdf_path && !hadPdf);
    }
  } catch (err) {
    return {
      paper,
      attached: false,
      replaced: false,
      attachError: err instanceof Error ? err.message : String(err),
    };
  }

  if (attached && !resultPaper.doi && !resultPaper.arxiv_id && (normDoi || normArxiv)) {
    const applied = applyIdentifiers(projectRoot, paperId, { doi: normDoi, arxivId: normArxiv });
    if (applied.paper) resultPaper = applied.paper;
  }

  return {
    paper: getPaper(projectRoot, paperId) ?? resultPaper,
    attached,
    replaced,
  };
}

export interface IngestPdfResult {
  paper: PaperRow;
  created: boolean;
  duplicateReason?: "pdf";
}

export function ingestPdf(projectRoot: string, pdfPath: string, opts?: { title?: string; doi?: string }): IngestPdfResult {
  const paths = getLibraryPaths(projectRoot);
  const db = openLibraryDb(projectRoot);
  const buf = fs.readFileSync(pdfPath);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const existing = db.prepare("SELECT * FROM papers WHERE pdf_sha = ?").get(sha) as unknown as PaperRow | undefined;
  if (existing) return { paper: existing, created: false, duplicateReason: "pdf" };

  const { relativePath, sha: storedSha } = storePdfAttachment(projectRoot, pdfPath);
  // Do not store crude buffer DOI — renderer will extract via pdfjs and fetch metadata
  const doi = opts?.doi ? coerceStoredDoi(opts.doi) : null;
  const baseTitle = opts?.title ?? path.basename(pdfPath, path.extname(pdfPath));
  const now = Date.now();
  const id = newId();
  const bibkey = uniqueBibkey(db, suggestBibkey(baseTitle));
  db.prepare(
    `INSERT INTO papers (id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type, pdf_path, pdf_sha, origin, raw_bibtex, created_at, updated_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, 'article', ?, ?, 'manual', NULL, ?, ?)`,
  ).run(id, bibkey, baseTitle, doi, relativePath, storedSha, now, now);
  const rowid = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(id) as { rowid: number };
  syncFtsForPaper(db, rowid.rowid, { title: baseTitle, abstract: null, authors: null, tags: null, ai_summary: null });
  const paper = getPaper(projectRoot, id)!;
  recordPdfDownload(projectRoot, paper, "literature-ingest", null, buf.length);
  return { paper, created: true };
}

export function resolvePaperPdfPath(projectRoot: string, paper: PaperRow): string | null {
  if (!paper.pdf_path) return null;
  return path.join(getLibraryPaths(projectRoot).libraryDir, paper.pdf_path);
}

export function readPaperPdfBytes(projectRoot: string, paperId: string): Buffer | null {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) return null;
  const abs = resolvePaperPdfPath(projectRoot, paper);
  if (!abs || !fs.existsSync(abs)) return null;
  return fs.readFileSync(abs);
}
