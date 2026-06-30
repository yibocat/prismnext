/**
 * Polls ~/.prism-literature-bridge for OpenCode literature tool requests.
 * Executes via literature-service in Electron main (Node sqlite) — not OpenCode Bun.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "./logger";
import { getSessionProjectRoot } from "./chat-session-registry";
import { normalizeArxivId, normalizeDoi } from "../../shared/doi-utils";
import { createPaperFromCatalog } from "./literature-enrich";
import {
  citePaperInProject,
  findExistingByIdentifier,
  getAnnotations,
  getPaperByBibkey,
  searchPapers,
  bibTeXEntryFromPaperRow,
} from "./literature-service";
import { publicationDetailsFromPaperRow, bibliographicToPaperPatch } from "../../shared/bibliographic-metadata/helpers";
import { resolveBibliographicMetadata } from "../../shared/bibliographic-metadata";
import type { StagedCitationPayload, StageResult } from "../../shared/citation-staging";

const log = createLogger("literature-bridge", "agent");

function bridgeRoot(): string {
  return process.env.PRISM_LITERATURE_BRIDGE_ROOT || join(homedir(), ".prism-literature-bridge");
}

function libraryPdfRelativePath(pdfPath: string | null): string | null {
  if (!pdfPath?.trim()) return null;
  return `.prismnext/library/${pdfPath.replace(/\\/g, "/")}`;
}

interface LiteratureBridgeRequest {
  action: "read" | "search" | "cite" | "add" | "stage";
  sessionId?: string;
  projectRoot?: string;
  bibkey?: string;
  query?: string;
  limit?: number;
  doi?: string;
  arxivId?: string;
  sourceUrl?: string;
  discoveredFrom?: StagedCitationPayload["discoveredFrom"];
}

interface SessionStageRecord {
  refId: number;
  doi: string | null;
  arxivId: string | null;
}

function sessionStagingPath(sessionId: string): string {
  return join(bridgeRoot(), sessionId, "staging.json");
}

function readSessionStaging(sessionId: string): SessionStageRecord[] {
  try {
    const p = sessionStagingPath(sessionId);
    if (!existsSync(p)) return [];
    return JSON.parse(readFileSync(p, "utf-8")) as SessionStageRecord[];
  } catch {
    return [];
  }
}

function writeSessionStaging(sessionId: string, records: SessionStageRecord[]): void {
  try {
    const dir = join(bridgeRoot(), sessionId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(sessionStagingPath(sessionId), JSON.stringify(records), "utf-8");
  } catch (err) {
    log.warn("failed to persist session staging", { session: sessionId, error: err instanceof Error ? err.message : String(err) });
  }
}

function resolveProjectRoot(req: LiteratureBridgeRequest): string {
  const fromSession = req.sessionId ? getSessionProjectRoot(req.sessionId) : undefined;
  return fromSession || req.projectRoot?.trim() || "";
}

function handleRead(projectRoot: string, bibkey: string): Record<string, unknown> {
  const paper = getPaperByBibkey(projectRoot, bibkey);
  if (!paper) {
    return {
      error: `Paper not found in library: ${bibkey}`,
      bibkey,
      projectRoot,
      hint: "Copy the exact Cite key from Literature panel (case-sensitive).",
    };
  }
  const highlights = getAnnotations(projectRoot, paper.id).map((a) => ({
    page: a.page,
    quoted_text: a.quoted_text,
    note: a.note,
    color: a.color,
  }));
  const pdfRel = libraryPdfRelativePath(paper.pdf_path);
  const { csl_json: _csl, ...paperFields } = paper;
  return {
    paper: {
      ...paperFields,
      publication_details: publicationDetailsFromPaperRow(paper),
      pdf_library_path: pdfRel,
      pdf_content_included: false,
    },
    highlights,
    hint: pdfRel
      ? "PDF path only — use read tool on pdf_library_path if user asks to inspect the file."
      : "No PDF cached in library for this entry.",
  };
}

function handleSearch(projectRoot: string, query: string, limit?: number): Record<string, unknown> {
  const rows = searchPapers(projectRoot, query, limit ?? 20);
  return {
    results: rows.map((p) => ({
      bibkey: p.bibkey,
      title: p.title,
      year: p.year,
      authors: p.authors,
      doi: p.doi,
      abstract: p.abstract,
      venue: p.venue,
    })),
    count: rows.length,
  };
}

function handleCite(projectRoot: string, bibkey: string): Record<string, unknown> {
  try {
    return citePaperInProject(projectRoot, bibkey);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message, bibkey };
  }
}

async function handleStage(
  projectRoot: string,
  sessionId: string,
  payload: {
    doi?: string;
    arxivId?: string;
    sourceUrl?: string;
    discoveredFrom?: StagedCitationPayload["discoveredFrom"];
  },
): Promise<StageResult> {
  const normDoi = payload.doi?.trim() ? normalizeDoi(payload.doi.trim()) : null;
  const normArxiv = payload.arxivId?.trim() ? normalizeArxivId(payload.arxivId.trim()) : null;

  if (!normDoi && !normArxiv) {
    return {
      staged: false,
      verified: false,
      error: "Invalid or missing DOI/arXiv ID.",
      hint: "Use an exact DOI or arXiv ID from websearch or the user. Do not invent identifiers.",
    };
  }
  if (normDoi && normArxiv) {
    return { staged: false, verified: false, error: "Provide only one of doi or arxivId." };
  }

  // Reuse existing refId if this session already staged the same identifier.
  const records = readSessionStaging(sessionId);
  const matched = records.find(
    (r) =>
      (normDoi && r.doi?.toLowerCase() === normDoi.toLowerCase()) ||
      (normArxiv && r.arxivId?.toLowerCase() === normArxiv.toLowerCase()),
  );

  try {
    const { metadata } = await resolveBibliographicMetadata(
      {
        doi: normDoi ?? undefined,
        arxivId: normArxiv ?? undefined,
      },
      { fast: true },
    );
    if (!metadata.title?.trim()) {
      return {
        staged: false,
        verified: false,
        error: "Catalog returned no verifiable title.",
        hint: "Confirm the identifier with websearch or the user.",
      };
    }
    const patch = bibliographicToPaperPatch(metadata);
    const existing = findExistingByIdentifier(projectRoot, { doi: normDoi, arxivId: normArxiv });
    const citationPayload: StagedCitationPayload = {
      title: (patch.title as string) ?? metadata.title,
      authors: (patch.authors as string | null) ?? null,
      year: (patch.year as number | null) ?? null,
      venue: (patch.venue as string | null) ?? null,
      type: (patch.type as string | null) ?? null,
      doi: (patch.doi as string | null) ?? null,
      arxivId: (patch.arxiv_id as string | null) ?? null,
      abstract: (patch.abstract as string | null) ?? null,
      cslJson: null,
      sourceUrl: payload.sourceUrl ?? null,
      catalogSource: metadata.source ?? null,
      catalogVerified: true,
      verifyError: null,
      discoveredFrom: payload.discoveredFrom ?? "agent",
      libraryPaperId: existing?.paperId ?? null,
      libraryBibkey: existing?.bibkey ?? null,
    };

    let refId = matched?.refId ?? 0;
    if (!matched) {
      refId = records.reduce((max, r) => (r.refId > max ? r.refId : max), 0) + 1;
      records.push({ refId, doi: normDoi, arxivId: normArxiv });
      writeSessionStaging(sessionId, records);
    }

    return {
      staged: true,
      verified: true,
      refId,
      citation: citationPayload,
      alreadyInLibrary: Boolean(existing),
      libraryBibkey: existing?.bibkey ?? null,
      hint: existing
        ? "Already in library. Cite as [n]."
        : "Cite as [n] in your reply. User will confirm before adding to library.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("literature stage failed", { doi: normDoi, arxivId: normArxiv, error: message });
    return {
      staged: false,
      verified: false,
      error: message,
      hint: "Identifier not found in external catalogs. Confirm with websearch or ask the user — do not guess.",
    };
  }
}

async function handleAdd(
  projectRoot: string,
  doi?: string,
  arxivId?: string,
): Promise<Record<string, unknown>> {
  const normDoi = doi?.trim() ? normalizeDoi(doi.trim()) : null;
  const normArxiv = arxivId?.trim() ? normalizeArxivId(arxivId.trim()) : null;

  if (!normDoi && !normArxiv) {
    return {
      error: "Invalid or missing DOI/arXiv ID.",
      verified: false,
      hint: "Use an exact DOI or arXiv ID from websearch or the user. Do not invent identifiers.",
      received: { doi: doi?.trim() || null, arxivId: arxivId?.trim() || null },
    };
  }
  if (normDoi && normArxiv) {
    return { error: "Provide only one of doi or arxivId.", verified: false };
  }

  try {
    const result = await createPaperFromCatalog(projectRoot, {
      doi: normDoi ?? undefined,
      arxivId: normArxiv ?? undefined,
    });
    const paper = result.paper;
    if (!paper.title?.trim()) {
      return {
        error: "Catalog returned no verifiable title; paper not added.",
        verified: false,
      };
    }

    const { csl_json: _csl, ...paperFields } = paper;
    return {
      success: true,
      verified: true,
      created: result.created,
      duplicateReason: result.duplicateReason ?? null,
      catalogSource: paper.metadata_source,
      paper: {
        ...paperFields,
        publication_details: publicationDetailsFromPaperRow(paper),
      },
      pdfAttached: result.pdfAttached ?? false,
      pdfAttachError: result.pdfAttachError ?? null,
      hint: result.created
        ? "Paper added to library. Use @ mention or literature-read for context."
        : "Paper already in library (same DOI/arXiv). Metadata refreshed.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("literature add failed", { doi: normDoi, arxivId: normArxiv, error: message });
    return {
      error: message,
      verified: false,
      hint: "Identifier not found in external catalogs. Confirm with websearch or ask the user — do not guess.",
    };
  }
}

function dispatch(req: LiteratureBridgeRequest): Record<string, unknown> | Promise<Record<string, unknown>> {
  const projectRoot = resolveProjectRoot(req);
  if (!projectRoot) {
    return {
      error: "Project root unknown for this chat session.",
      hint: "Open a project in Prism and start a new chat tab from that project.",
    };
  }

  switch (req.action) {
    case "read": {
      const bibkey = req.bibkey?.trim() ?? "";
      if (!bibkey) return { error: "Missing bibkey parameter." };
      return handleRead(projectRoot, bibkey);
    }
    case "search": {
      const query = req.query?.trim() ?? "";
      if (!query) return { error: "Missing query parameter." };
      return handleSearch(projectRoot, query, req.limit);
    }
    case "cite": {
      const bibkey = req.bibkey?.trim() ?? "";
      if (!bibkey) return { error: "Missing bibkey parameter." };
      return handleCite(projectRoot, bibkey);
    }
    case "add": {
      const doi = req.doi?.trim();
      const arxivId = req.arxivId?.trim();
      if (!doi && !arxivId) return { error: "Missing doi or arxivId parameter." };
      return handleAdd(projectRoot, doi, arxivId);
    }
    case "stage": {
      const sessionId = req.sessionId?.trim() ?? "";
      if (!sessionId) {
        return {
          staged: false,
          verified: false,
          error: "Missing sessionId for stage action.",
        };
      }
      const doi = req.doi?.trim();
      const arxivId = req.arxivId?.trim();
      if (!doi && !arxivId) {
        return {
          staged: false,
          verified: false,
          error: "Missing doi or arxivId parameter.",
        };
      }
      return handleStage(projectRoot, sessionId, {
        doi,
        arxivId,
        sourceUrl: req.sourceUrl,
        discoveredFrom: req.discoveredFrom,
      });
    }
    default:
      return { error: `Unknown literature bridge action: ${String((req as { action?: string }).action)}` };
  }
}

async function processSessionDir(sessionDir: string): Promise<void> {
  if (!existsSync(sessionDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(sessionDir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (!name.endsWith(".request.json")) continue;
    const reqPath = join(sessionDir, name);
    const requestId = name.replace(".request.json", "");
    const resPath = join(sessionDir, `${requestId}.result.json`);
    if (existsSync(resPath)) continue;
    if (processingRequests.has(reqPath)) continue;

    processingRequests.add(reqPath);
    try {
      const raw = readFileSync(reqPath, "utf-8");
      const req = JSON.parse(raw) as LiteratureBridgeRequest;
      const result = await Promise.resolve(dispatch(req));
      writeFileSync(resPath, JSON.stringify(result), "utf-8");
      try { unlinkSync(reqPath); } catch {}
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("literature bridge request failed", { session: basename(sessionDir), error: message });
      writeFileSync(resPath, JSON.stringify({ error: message }), "utf-8");
      try { unlinkSync(reqPath); } catch {}
    } finally {
      processingRequests.delete(reqPath);
    }
  }
}

const processingRequests = new Set<string>();
let pollInFlight = false;

async function pollBridge(): Promise<void> {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    mkdirSync(bridgeRoot(), { recursive: true });
    let sessions: string[];
    try {
      sessions = readdirSync(bridgeRoot());
    } catch {
      return;
    }
    for (const s of sessions) {
      await processSessionDir(join(bridgeRoot(), s));
    }
  } finally {
    pollInFlight = false;
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startLiteratureBridge(): void {
  if (pollTimer) return;
  mkdirSync(bridgeRoot(), { recursive: true });
  pollTimer = setInterval(() => {
    void pollBridge();
  }, 50);
  log.info("Literature bridge started");
}

export function stopLiteratureBridge(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** @internal */
export async function processLiteratureBridgeOnceForTests(): Promise<void> {
  await pollBridge();
}
