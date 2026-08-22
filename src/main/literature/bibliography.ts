import * as fs from "node:fs";
import * as path from "node:path";
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-csl";
import "@citation-js/plugin-bibtex";
import {
  authorsFromBibField,
  parseBibTeX,
  patchCslJsonBibkey,
  type BibEntry,
} from "../lib/bibtex-parse";
import {
  intendedBibliographyPath,
  resolveBibliographyFromMain,
  resolveMainTexRelativePath,
} from "../lib/bib-path-resolve";
import { cslEntryFromPaperRow } from "../../shared/bibliographic-metadata/helpers";
import { resolveIncomingBibkey, patchRawBibtexKey } from "../../shared/literature/bibkey-utils";
import { coerceStoredDoi, normalizeArxivId } from "../../shared/literature/doi-utils";
import { readWorkspaceDirs } from "../project/workspace-config";
import { addToReadingList } from "./collections";
import { findExistingPaper, newId, openLibraryDb, syncFtsForPaper, uniqueBibkey } from "./db";
import { getPaperByBibkey, listPapers } from "./papers";
import { getLibraryPaths } from "./paths";
import { storePdfAttachment } from "./pdf";
import type { AnnotationRow, PaperRow } from "./types";

export async function importBibTeX(
  projectRoot: string,
  content: string,
  pdfPathByKey?: Record<string, string>,
  opts?: { enrichAfterImport?: boolean },
): Promise<{ imported: number; skipped: number; importedPaperIds: string[]; pdfsAttached?: number }> {
  const db = openLibraryDb(projectRoot);
  const paths = getLibraryPaths(projectRoot);
  const entries = parseBibTeX(content);
  let imported = 0;
  let skipped = 0;
  const importedPaperIds: string[] = [];
  const now = Date.now();

  for (const entry of entries) {
    if (db.prepare("SELECT 1 FROM papers WHERE bibkey = ?").get(entry.citekey)) {
      skipped++;
      continue;
    }
    const normDoi = entry.fields.doi ? coerceStoredDoi(entry.fields.doi) : null;
    const normArxiv = normalizeArxivId(entry.fields.eprint ?? entry.fields.arxiv ?? undefined);
    const dup = findExistingPaper(db, { doi: normDoi, arxivId: normArxiv });
    if (dup) {
      skipped++;
      continue;
    }
    const title = entry.fields.title ?? entry.citekey;
    const year = entry.fields.year ? Number.parseInt(entry.fields.year, 10) : null;
    const id = newId();
    const authorsField = authorsFromBibField(entry.fields.author);
    const citekey = uniqueBibkey(
      db,
      resolveIncomingBibkey(entry.citekey, title, year, authorsField),
    );
    let pdfPath: string | null = null;
    let pdfSha: string | null = null;
    const attachment = pdfPathByKey?.[entry.citekey];
    if (attachment && fs.existsSync(attachment)) {
      const stored = storePdfAttachment(projectRoot, attachment);
      pdfPath = stored.relativePath;
      pdfSha = stored.sha;
    }
    const rawBibtex = patchRawBibtexKey(entry.raw, citekey) ?? entry.raw;
    const cslJson = patchCslJsonBibkey(entry.cslJson, citekey);
    db.prepare(
      `INSERT INTO papers (id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type, pdf_path, pdf_sha, origin, raw_bibtex, csl_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bibtex', ?, ?, ?, ?)`,
    ).run(
      id,
      citekey,
      title,
      authorsField,
      Number.isFinite(year) ? year : null,
      entry.fields.abstract ?? null,
      normDoi,
      normArxiv,
      entry.fields.isbn ?? null,
      entry.fields.journal ?? entry.fields.booktitle ?? null,
      entry.entryType,
      pdfPath,
      pdfSha,
      rawBibtex,
      cslJson,
      now,
      now,
    );
    const rowid = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(id) as { rowid: number };
    syncFtsForPaper(db, rowid.rowid, {
      title,
      abstract: entry.fields.abstract ?? null,
      authors: authorsFromBibField(entry.fields.author),
      tags: null,
      ai_summary: null,
    });
    importedPaperIds.push(id);
    imported++;
  }

  let pdfsAttached = 0;
  if (opts?.enrichAfterImport && importedPaperIds.length > 0) {
    const { enrichImportedPapers } = await import("./enrich");
    const summary = await enrichImportedPapers(projectRoot, importedPaperIds);
    pdfsAttached = summary.pdfsAttached;
  }

  return { imported, skipped, importedPaperIds, pdfsAttached };
}

export function exportBibTeX(projectRoot: string, paperIds?: string[]): string {
  const db = openLibraryDb(projectRoot);
  let rows: PaperRow[];
  if (paperIds?.length) {
    const placeholders = paperIds.map(() => "?").join(",");
    rows = db.prepare(`SELECT * FROM papers WHERE id IN (${placeholders})`).all(...paperIds) as unknown as PaperRow[];
  } else {
    rows = listPapers(projectRoot);
  }
  const chunks: string[] = [];
  for (const row of rows) {
    chunks.push(bibTeXEntryFromPaperRow(row));
  }
  return chunks.join("\n\n") + (chunks.length ? "\n" : "");
}

/** BibTeX for one library row — prefers `raw_bibtex`, else CSL-derived entry with volume/pages. */
export function bibTeXEntryFromPaperRow(row: PaperRow): string {
  if (row.raw_bibtex?.trim()) return row.raw_bibtex.trim();
  const entry = cslEntryFromPaperRow(row);
  const generated = new Cite(entry).format("bibtex") as string;
  return patchRawBibtexKey(generated, row.bibkey) ?? generated.replace(
    /^@([A-Za-z]+)\s*\{\s*[^,\s]+\s*,/m,
    `@$1{${row.bibkey},`,
  );
}

/** Common CSL citation styles for `formatBibliography`. */
export const CSL_STYLES = ["apa", "ieee", "chicago", "mla", "harvard1"] as const;
export type CslStyle = (typeof CSL_STYLES)[number];

/** Format selected papers as a bibliography string in a given CSL style (APA/IEEE/Chicago/MLA). */
export function formatBibliography(
  projectRoot: string,
  paperIds: string[],
  style: CslStyle = "ieee",
): string {
  const db = openLibraryDb(projectRoot);
  const placeholders = paperIds.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT bibkey, title, authors, year, doi, venue, type, abstract, csl_json FROM papers WHERE id IN (${placeholders})`,
  ).all(...paperIds) as Array<{
    bibkey: string; title: string; authors: string | null; year: number | null;
    doi: string | null; venue: string | null; type: string | null;
    abstract: string | null; csl_json: string | null;
  }>;
  if (!rows.length) return "";
  const entries = rows.map((r) => cslEntryFromPaperRow(r));
  return new Cite(entries).format("bibliography", { template: style }) as string;
}

const CITE_COMMAND_RE =
  /\\(?:cite|citep|citet|autocite|footcite|parencite|textcite|Cite|Citep|Citet)\*?(?:\[[^\]]*\])*\{([^}]+)\}/g;

const TEX_SCAN_SKIP_DIRS = new Set([
  ".prismnext",
  ".workbench",
  "node_modules",
  ".git",
  "out",
  "dist",
  "build",
  ".cursor",
]);

export interface CiteCheckResult {
  texFilesScanned: number;
  citeKeysInTex: string[];
  knownKeys: string[];
  missingKeys: string[];
  unusedKeys: string[];
}

function parseCiteKeysFromBraceContent(content: string): string[] {
  return content
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractCiteKeysFromTex(tex: string): string[] {
  const keys: string[] = [];
  for (const match of tex.matchAll(CITE_COMMAND_RE)) {
    keys.push(...parseCiteKeysFromBraceContent(match[1]));
  }
  return keys;
}

function collectTexFiles(projectRoot: string, maxFiles = 200): string[] {
  const result: string[] = [];
  function walk(dir: string): void {
    if (result.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (TEX_SCAN_SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith(".tex")) {
        result.push(path.join(dir, entry.name));
        if (result.length >= maxFiles) return;
      }
    }
  }
  walk(projectRoot);
  return result;
}

export function citeCheckLiterature(projectRoot: string, paperIds?: string[]): CiteCheckResult {
  const db = openLibraryDb(projectRoot);
  let papers: PaperRow[];
  if (paperIds?.length) {
    const placeholders = paperIds.map(() => "?").join(",");
    papers = db
      .prepare(`SELECT * FROM papers WHERE id IN (${placeholders})`)
      .all(...paperIds) as unknown as PaperRow[];
  } else {
    papers = listPapers(projectRoot);
  }

  const knownKeys = [...new Set(papers.map((p) => p.bibkey).filter(Boolean))];
  const knownSet = new Set(knownKeys);

  const citeKeysInTex: string[] = [];
  const texFiles = collectTexFiles(projectRoot);
  for (const file of texFiles) {
    try {
      citeKeysInTex.push(...extractCiteKeysFromTex(fs.readFileSync(file, "utf-8")));
    } catch {
      // skip unreadable files
    }
  }

  const uniqueInTex = [...new Set(citeKeysInTex)];
  const usedSet = new Set(uniqueInTex);
  return {
    texFilesScanned: texFiles.length,
    citeKeysInTex: uniqueInTex,
    knownKeys,
    missingKeys: uniqueInTex.filter((k) => !knownSet.has(k)),
    unusedKeys: knownKeys.filter((k) => !usedSet.has(k)),
  };
}

export function findProjectBibPath(projectRoot: string): string {
  const mainRel = resolveMainTexRelativePath(projectRoot);
  if (mainRel) {
    try {
      const texPath = path.join(projectRoot, mainRel);
      const tex = fs.readFileSync(texPath, "utf-8");
      const resolved = resolveBibliographyFromMain(projectRoot, mainRel, tex);
      if (resolved.resolvedPath) {
        return path.join(projectRoot, resolved.resolvedPath);
      }
      const declared = resolved.declaredInMain[0];
      if (declared) {
        return intendedBibliographyPath(projectRoot, mainRel, declared);
      }
    } catch {
      // fall through to legacy candidates
    }
    const manuscriptBib = path.join(projectRoot, path.dirname(mainRel), "references.bib");
    if (fs.existsSync(manuscriptBib)) return manuscriptBib;
  }

  const candidates = [
    ...readWorkspaceDirs(projectRoot)
      .filter((d) => d.function === "manuscript")
      .map((d) => path.join(projectRoot, d.name, "references.bib")),
    path.join(projectRoot, "references.bib"),
    path.join(projectRoot, "bibliography.bib"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  if (mainRel) {
    return intendedBibliographyPath(projectRoot, mainRel, "references.bib");
  }
  return path.join(projectRoot, "references.bib");
}

function bibKeyPresentInContent(bibContent: string, bibkey: string): boolean {
  return bibContent.includes(`{${bibkey},`) || bibContent.includes(`{${bibkey}}`);
}

function appendPaperEntryToBibFile(
  bibPath: string,
  bibkey: string,
  entry: string,
): { appended: boolean } {
  fs.mkdirSync(path.dirname(bibPath), { recursive: true });
  const existing = fs.existsSync(bibPath) ? fs.readFileSync(bibPath, "utf-8") : "";
  if (bibKeyPresentInContent(existing, bibkey)) {
    return { appended: false };
  }
  const prefix =
    existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
  fs.appendFileSync(bibPath, prefix + entry + "\n");
  return { appended: true };
}

export interface MergeLibraryBibResult {
  bibPath: string;
  appended: string[];
  skipped: string[];
  notFound: string[];
  papersProcessed: number;
}

/** Append library paper BibTeX entries into the project manuscript .bib. */
export function mergeLibraryIntoProjectBib(
  projectRoot: string,
  options?: {
    bibkeys?: string[];
    paperIds?: string[];
    /** Merge entire library (ignores onlyCitedInTex unless bibkeys/paperIds set). */
    all?: boolean;
    /** When no bibkeys/paperIds/all: merge library rows for keys cited in .tex. */
    onlyCitedInTex?: boolean;
  },
): MergeLibraryBibResult {
  const bibPath = findProjectBibPath(projectRoot);
  let papers: PaperRow[] = [];

  if (options?.paperIds?.length) {
    const db = openLibraryDb(projectRoot);
    const placeholders = options.paperIds.map(() => "?").join(",");
    papers = db
      .prepare(`SELECT * FROM papers WHERE id IN (${placeholders})`)
      .all(...options.paperIds) as unknown as PaperRow[];
  } else if (options?.bibkeys?.length) {
    for (const key of options.bibkeys) {
      const trimmed = key.trim();
      if (!trimmed) continue;
      const paper = getPaperByBibkey(projectRoot, trimmed);
      if (paper) papers.push(paper);
    }
  } else if (options?.all) {
    papers = listPapers(projectRoot);
  } else if (options?.onlyCitedInTex !== false) {
    const cited = citeCheckLiterature(projectRoot).citeKeysInTex;
    for (const key of cited) {
      const paper = getPaperByBibkey(projectRoot, key);
      if (paper) papers.push(paper);
    }
  }

  const notFound =
    options?.bibkeys
      ?.map((k) => k.trim())
      .filter((k) => k && !papers.some((p) => p.bibkey === k)) ?? [];

  const appended: string[] = [];
  const skipped: string[] = [];

  for (const paper of papers) {
    const entry = bibTeXEntryFromPaperRow(paper);
    const { appended: didAppend } = appendPaperEntryToBibFile(
      bibPath,
      paper.bibkey,
      entry,
    );
    if (didAppend) {
      appended.push(paper.bibkey);
      addToReadingList(projectRoot, paper.id);
    } else {
      skipped.push(paper.bibkey);
    }
  }

  return {
    bibPath,
    appended,
    skipped,
    notFound,
    papersProcessed: papers.length,
  };
}

export function citePaperInProject(projectRoot: string, bibkey: string): { bibPath: string; appended: boolean } {
  const paper = getPaperByBibkey(projectRoot, bibkey);
  if (!paper) throw new Error(`Unknown bibkey: ${bibkey}`);
  const bibPath = findProjectBibPath(projectRoot);
  const entry = bibTeXEntryFromPaperRow(paper);
  const { appended } = appendPaperEntryToBibFile(bibPath, bibkey, entry);
  if (!appended) {
    addToReadingList(projectRoot, paper.id);
    return { bibPath, appended: false };
  }
  addToReadingList(projectRoot, paper.id);
  return { bibPath, appended: true };
}

export function importFromProject(
  targetRoot: string,
  sourceRoot: string,
  paperIds: string[],
  opts?: { includeAnnotations?: boolean; includePdf?: boolean },
): { imported: number; skipped: number } {
  const sourceDb = openLibraryDb(sourceRoot);
  const targetDb = openLibraryDb(targetRoot);
  const sourcePaths = getLibraryPaths(sourceRoot);
  const targetPaths = getLibraryPaths(targetRoot);
  let imported = 0;
  let skipped = 0;
  const now = Date.now();

  for (const paperId of paperIds) {
    const row = sourceDb.prepare("SELECT * FROM papers WHERE id = ?").get(paperId) as unknown as PaperRow | undefined;
    if (!row) continue;
    if (targetDb.prepare("SELECT 1 FROM papers WHERE bibkey = ?").get(row.bibkey)) {
      skipped++;
      continue;
    }
    const targetId = newId();
    let pdfPath = row.pdf_path;
    let pdfSha = row.pdf_sha;
    if (opts?.includePdf !== false && row.pdf_path) {
      const srcAbs = path.join(sourcePaths.libraryDir, row.pdf_path);
      if (fs.existsSync(srcAbs)) {
        const stored = storePdfAttachment(targetRoot, srcAbs);
        pdfPath = stored.relativePath;
        pdfSha = stored.sha;
      }
    }
    targetDb.prepare(
      `INSERT INTO papers (id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type, pdf_path, pdf_sha, origin, metadata_source, raw_bibtex, csl_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      targetId,
      uniqueBibkey(targetDb, row.bibkey),
      row.title,
      row.authors,
      row.year,
      row.abstract,
      row.doi,
      row.arxiv_id,
      row.isbn,
      row.venue,
      row.type,
      pdfPath,
      pdfSha,
      row.origin ?? "manual",
      row.metadata_source ?? null,
      row.raw_bibtex,
      row.csl_json ?? null,
      now,
      now,
    );
    // Copy Zotero mirror association if exists
    const sourceMirror = sourceDb
      .prepare("SELECT zotero_key, zotero_version, zotero_attach_key FROM zotero_mirror WHERE paper_id = ?")
      .get(paperId) as { zotero_key: string; zotero_version: number | null; zotero_attach_key: string | null } | undefined;
    if (sourceMirror) {
      targetDb.prepare(
        "INSERT OR REPLACE INTO zotero_mirror (paper_id, zotero_key, zotero_version, zotero_attach_key) VALUES (?, ?, ?, ?)",
      ).run(targetId, sourceMirror.zotero_key, sourceMirror.zotero_version, sourceMirror.zotero_attach_key);
    }
    const rowid = targetDb.prepare("SELECT rowid FROM papers WHERE id = ?").get(targetId) as { rowid: number };
    syncFtsForPaper(targetDb, rowid.rowid, row);

    if (opts?.includeAnnotations !== false) {
      const anns = sourceDb
        .prepare("SELECT * FROM annotations WHERE paper_id = ?")
        .all(paperId) as unknown as AnnotationRow[];
      for (const ann of anns) {
        targetDb.prepare(
          `INSERT INTO annotations (id, paper_id, kind, page, rects, quoted_text, color, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(newId(), targetId, ann.kind, ann.page, ann.rects, ann.quoted_text, ann.color, ann.note, now, now);
      }
    }
    imported++;
  }
  return { imported, skipped };
}

export function parseBetterBibTeXJson(content: string): Record<string, string> {
  try {
    const data = JSON.parse(content) as Array<{ citationKey?: string; id?: string; attachments?: Array<{ path?: string }> }>;
    const map: Record<string, string> = {};
    for (const item of data) {
      const key = item.citationKey ?? item.id;
      const attachment = item.attachments?.find((a) => a.path?.toLowerCase().endsWith(".pdf"));
      if (key && attachment?.path && fs.existsSync(attachment.path)) {
        map[key] = attachment.path;
      }
    }
    return map;
  } catch {
    return {};
  }
}

/** Prefer Zotero-formatted BibTeX when every selected row is a mirror; else local export. */
export async function bibliographyExportContent(
  projectRoot: string,
  paperIds?: string[],
): Promise<string> {
  const papers = paperIds?.length
    ? listPapers(projectRoot).filter((p) => paperIds.includes(p.id))
    : listPapers(projectRoot);
  const zoteroPaperIds = papers.filter((p) => p.zotero_key).map((p) => p.id);
  if (zoteroPaperIds.length > 0) {
    try {
      const { exportZoteroBibliography } = await import("./zotero/zotero-sync");
      return await exportZoteroBibliography(projectRoot, paperIds);
    } catch {
      if (zoteroPaperIds.length === papers.length) {
        return exportBibTeX(projectRoot, paperIds);
      }
    }
  }
  return exportBibTeX(projectRoot, paperIds);
}

