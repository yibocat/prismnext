import * as fs from "node:fs";
import * as path from "node:path";
import {
  enrichBlocksWithLayoutJson,
  finalizeExtractBlocks,
} from "./mineru-blocks";
import type {
  PaperExtractSource,
  PaperExtractState,
  PaperExtractStatus,
  PaperExtractStatesByPaper,
} from "../../shared/paper-extract";
import type { PaperExtractBlock } from "../../shared/paper-extract-block";
import { getLibraryPaths, openLibraryDb, getZoteroMirrorByPaperId, type PaperRow } from "./literature-service";

const ALL_EXTRACT_SOURCES: PaperExtractSource[] = ["mineru", "pdfjs", "html"];

interface ExtractRow {
  paper_id: string;
  source: string;
  status: string;
  md_path: string | null;
  pages: number | null;
  remote_job_id: string | null;
  error: string | null;
  retry_count: number | null;
  next_retry_at: number | null;
  queued_at: number | null;
  started_at: number | null;
  finished_at: number | null;
}

function rowToState(row: ExtractRow): PaperExtractState {
  return {
    paperId: row.paper_id,
    source: row.source as PaperExtractSource,
    status: row.status as PaperExtractStatus,
    mdPath: row.md_path ?? undefined,
    pages: row.pages ?? undefined,
    remoteJobId: row.remote_job_id ?? undefined,
    error: row.error ?? undefined,
    retryCount: row.retry_count ?? undefined,
    nextRetryAt: row.next_retry_at ?? undefined,
    queuedAt: row.queued_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
  };
}

export function getPaperExtractDir(projectRoot: string, paperId: string): string {
  return path.join(getLibraryPaths(projectRoot).extractDir, paperId);
}

export function getPaperExtractAbsPath(
  projectRoot: string,
  relativeMdPath: string,
): string {
  return path.join(getLibraryPaths(projectRoot).extractDir, relativeMdPath);
}

export function listPaperExtractStates(
  projectRoot: string,
  paperIds: string[],
): PaperExtractStatesByPaper {
  if (paperIds.length === 0) return {};
  const db = openLibraryDb(projectRoot);
  const placeholders = paperIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT * FROM paper_extracts WHERE paper_id IN (${placeholders})`,
    )
    .all(...paperIds) as ExtractRow[];

  const out: PaperExtractStatesByPaper = {};
  for (const row of rows) {
    if (!out[row.paper_id]) out[row.paper_id] = {};
    out[row.paper_id]![row.source as PaperExtractSource] = rowToState(row);
  }
  return out;
}

export function getPaperExtractState(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
): PaperExtractState | null {
  const db = openLibraryDb(projectRoot);
  const row = db
    .prepare("SELECT * FROM paper_extracts WHERE paper_id = ? AND source = ?")
    .get(paperId, source) as ExtractRow | undefined;
  return row ? rowToState(row) : null;
}

export function upsertPaperExtractState(
  projectRoot: string,
  state: PaperExtractState,
): PaperExtractState {
  const db = openLibraryDb(projectRoot);
  db.prepare(
    `INSERT INTO paper_extracts (
      paper_id, source, status, md_path, pages, remote_job_id, error,
      retry_count, next_retry_at,
      queued_at, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(paper_id, source) DO UPDATE SET
      status = excluded.status,
      md_path = excluded.md_path,
      pages = excluded.pages,
      remote_job_id = excluded.remote_job_id,
      error = excluded.error,
      retry_count = excluded.retry_count,
      next_retry_at = excluded.next_retry_at,
      queued_at = excluded.queued_at,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at`,
  ).run(
    state.paperId,
    state.source,
    state.status,
    state.mdPath ?? null,
    state.pages ?? null,
    state.remoteJobId ?? null,
    state.error ?? null,
    state.retryCount ?? 0,
    state.nextRetryAt ?? null,
    state.queuedAt ?? null,
    state.startedAt ?? null,
    state.finishedAt ?? null,
  );
  return state;
}

export function listQueuedOrExtracting(
  projectRoot: string,
): PaperExtractState[] {
  const db = openLibraryDb(projectRoot);
  const rows = db
    .prepare(
      `SELECT * FROM paper_extracts WHERE status IN ('queued', 'extracting') ORDER BY queued_at ASC`,
    )
    .all() as ExtractRow[];
  return rows.map(rowToState);
}

export function readExtractMarkdown(
  projectRoot: string,
  state: PaperExtractState,
): string | null {
  if (!state.mdPath || state.status !== "ready") return null;
  const abs = getPaperExtractAbsPath(projectRoot, state.mdPath);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf-8");
}

export function getExtractBlocksRelPath(paperId: string, source: PaperExtractSource): string {
  return `${paperId}/${source}.blocks.json`;
}

export function getExtractMiddleRelPath(paperId: string, source: PaperExtractSource): string {
  return `${paperId}/${source}.middle.json`;
}

export function readExtractBlocks(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
): PaperExtractBlock[] | null {
  const rel = getExtractBlocksRelPath(paperId, source);
  const abs = path.join(getLibraryPaths(projectRoot).extractDir, rel);
  if (!fs.existsSync(abs)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(abs, "utf-8")) as PaperExtractBlock[];
    if (!Array.isArray(parsed)) return null;
    const middleRel = getExtractMiddleRelPath(paperId, source);
    const middleAbs = path.join(getLibraryPaths(projectRoot).extractDir, middleRel);
    if (fs.existsSync(middleAbs)) {
      try {
        const middle = JSON.parse(fs.readFileSync(middleAbs, "utf-8"));
        return finalizeExtractBlocks(enrichBlocksWithLayoutJson(parsed, { middle }));
      } catch {
        /* fall through */
      }
    }
    return finalizeExtractBlocks(parsed);
  } catch {
    return null;
  }
}

export function writeExtractArtifacts(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
  markdown: string,
  meta: Record<string, unknown>,
  pages?: number,
  opts?: {
    images?: Array<{ relPath: string; data: Buffer }>;
    blocks?: PaperExtractBlock[];
    layout?: { middle?: unknown; model?: unknown };
  },
): { mdPath: string; pages: number; blocksPath?: string } {
  const dir = getPaperExtractDir(projectRoot, paperId);
  fs.mkdirSync(dir, { recursive: true });

  if (source === "mineru" && opts?.images?.length) {
    const imagesDir = path.join(dir, "images");
    if (fs.existsSync(imagesDir)) {
      fs.rmSync(imagesDir, { recursive: true, force: true });
    }
    fs.mkdirSync(imagesDir, { recursive: true });
    for (const img of opts.images) {
      const rel = img.relPath.replace(/^images\//, "");
      const abs = path.join(imagesDir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, img.data);
    }
  }

  const mdRel = `${paperId}/${source}.md`;
  const metaRel = `${paperId}/${source}.meta.json`;
  const blocksRel = getExtractBlocksRelPath(paperId, source);
  const absMd = path.join(getLibraryPaths(projectRoot).extractDir, mdRel);
  const absMeta = path.join(getLibraryPaths(projectRoot).extractDir, metaRel);
  const absBlocks = path.join(getLibraryPaths(projectRoot).extractDir, blocksRel);
  fs.writeFileSync(absMd, markdown, "utf-8");

  let blocksPath: string | undefined;
  if (source === "mineru" && opts?.blocks?.length) {
    fs.writeFileSync(absBlocks, JSON.stringify(opts.blocks, null, 2), "utf-8");
    blocksPath = blocksRel;
    if (opts.layout?.middle) {
      const middleAbs = path.join(dir, `${source}.middle.json`);
      fs.writeFileSync(middleAbs, JSON.stringify(opts.layout.middle, null, 2), "utf-8");
    }
  } else if (source === "mineru" && fs.existsSync(absBlocks)) {
    fs.unlinkSync(absBlocks);
    const middleAbs = path.join(dir, `${source}.middle.json`);
    if (fs.existsSync(middleAbs)) fs.unlinkSync(middleAbs);
  }

  fs.writeFileSync(
    absMeta,
    JSON.stringify(
      {
        ...meta,
        imageCount: opts?.images?.length ?? 0,
        blockCount: opts?.blocks?.length ?? 0,
        blocksPath,
        blocksVersion: 4,
      },
      null,
      2,
    ),
    "utf-8",
  );
  const pageCount = pages ?? (typeof meta.pageCount === "number" ? meta.pageCount : 0);
  return { mdPath: mdRel, pages: pageCount, blocksPath };
}

export function paperHasExtractablePdf(paper: PaperRow): boolean {
  return Boolean(paper.pdf_path?.trim());
}

/** Local PDF or Zotero mirror (PDF fetched + cached on first extract/read). */
export function paperCanExtractPdf(projectRoot: string, paper: PaperRow): boolean {
  if (paperHasExtractablePdf(paper)) return true;
  return Boolean(getZoteroMirrorByPaperId(projectRoot, paper.id));
}

export function resolvePublisherPageUrl(paper: PaperRow): string | null {
  if (paper.arxiv_id) {
    return `https://arxiv.org/abs/${paper.arxiv_id}`;
  }
  if (paper.doi) {
    return `https://doi.org/${paper.doi}`;
  }
  return null;
}

export function deleteExtractArtifacts(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
): void {
  const extractRoot = getLibraryPaths(projectRoot).extractDir;
  for (const suffix of [".md", ".meta.json", ".blocks.json"]) {
    const abs = path.join(extractRoot, paperId, `${source}${suffix}`);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  if (source === "mineru") {
    const imagesDir = path.join(extractRoot, paperId, "images");
    if (fs.existsSync(imagesDir)) {
      fs.rmSync(imagesDir, { recursive: true, force: true });
    }
  }
}

export function invalidatePaperExtracts(
  projectRoot: string,
  paperId: string,
  sources: PaperExtractSource[] = ALL_EXTRACT_SOURCES,
): void {
  for (const source of sources) {
    const existing = getPaperExtractState(projectRoot, paperId, source);
    if (!existing || existing.status === "idle") continue;
    deleteExtractArtifacts(projectRoot, paperId, source);
    upsertPaperExtractState(projectRoot, {
      paperId,
      source,
      status: "idle",
      retryCount: 0,
      nextRetryAt: undefined,
    });
  }
}

export function listExtractsDueForRetry(projectRoot: string): PaperExtractState[] {
  const db = openLibraryDb(projectRoot);
  const now = Date.now();
  const rows = db
    .prepare(
      `SELECT * FROM paper_extracts
       WHERE status = 'failed'
         AND next_retry_at IS NOT NULL
         AND next_retry_at <= ?
       ORDER BY next_retry_at ASC`,
    )
    .all(now) as ExtractRow[];
  return rows.map(rowToState);
}

export function listFailedWithScheduledRetry(projectRoot: string): PaperExtractState[] {
  const db = openLibraryDb(projectRoot);
  const rows = db
    .prepare(
      `SELECT * FROM paper_extracts
       WHERE status = 'failed'
         AND next_retry_at IS NOT NULL
       ORDER BY next_retry_at ASC`,
    )
    .all() as ExtractRow[];
  return rows.map(rowToState);
}
