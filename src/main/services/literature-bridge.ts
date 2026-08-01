/**
 * Polls the literature file bridge for OpenCode literature tool requests.
 * Executes via literature-service in Electron main (Node sqlite) — not OpenCode Bun.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createLogger } from "./logger";
import { getLiteratureBridgeRoot } from "./prism-bridge-paths";
import {
  addSessionIntensiveBibkey,
  getSessionIntensiveBibkeys,
  getSessionProjectRoot,
  isSessionIntensiveBibkey,
  removeSessionIntensiveBibkey,
  resolveChatTabId,
} from "./chat-session-registry";
import { AcpService } from "../acp/service";
import { emitChatStream } from "./chat-stream-notify";
import { normalizeArxivId, normalizeDoi } from "../../shared/doi-utils";
import { createPaperFromCatalog } from "./literature-enrich";
import { getCitationHealth } from "./citation-health";
import { recordCiteAuditHealth } from "./session-cite-audit-context";
import {
  addPapersToCollection,
  citeCheckLiterature,
  deletePaper,
  findExistingByIdentifier,
  getAnnotations,
  getPaperByBibkey,
  listCollections,
  mapPaperForAgent,
  mapPaperSearchHitForAgent,
  mergeLibraryIntoProjectBib,
  searchPapers,
  resolveLibraryProjectRoot,
  bibTeXEntryFromPaperRow,
} from "./literature-service";
import { publicationDetailsFromPaperRow, bibliographicToPaperPatch } from "../../shared/bibliographic-metadata/helpers";
import { resolveBibliographicMetadata } from "../../shared/bibliographic-metadata";
import { readPaperPdfContent } from "./paper-extract-read";
import { getSettings } from "./settings";
import { PAPER_EXTRACT_AGENT_UI_HINT } from "../../shared/paper-extract";
import { discoverLiterature } from "./literature-discovery";
import type { StagedCitationPayload, StageResult } from "../../shared/citation-staging";
import {
  hitsFromLiteratureReadResult,
  hitsFromLiteratureSearchResult,
  recordLibraryTaskHitsFromToolSession,
} from "./library-task-context";

const log = createLogger("literature-bridge", "agent");

function bridgeRoot(): string {
  return getLiteratureBridgeRoot();
}

function libraryPdfRelativePath(pdfPath: string | null): string | null {
  if (!pdfPath?.trim()) return null;
  return `.prismnext/library/${pdfPath.replace(/\\/g, "/")}`;
}

interface LiteratureBridgeRequest {
  action:
    | "read"
    | "read-pdf"
    | "search"
    | "discover"
    | "add"
    | "stage"
    | "delete"
    | "citation-health"
    | "export-bib"
    | "intensive-reading";
  sessionId?: string;
  projectRoot?: string;
  verify?: boolean;
  bibkey?: string;
  bibkeys?: string[];
  paperIds?: string[];
  all?: boolean;
  onlyCitedInTex?: boolean;
  query?: string;
  sources?: string[];
  year?: string;
  author?: string;
  limit?: number;
  tag?: string;
  collection?: string;
  doi?: string;
  arxivId?: string;
  sourceUrl?: string;
  discoveredFrom?: StagedCitationPayload["discoveredFrom"];
  pages?: string;
  source?: "auto" | "mineru" | "pdfjs" | "html";
  force?: boolean;
  /** intensive-reading: add | remove | list */
  intensiveAction?: string;
}

interface SessionStageRecord {
  refId: number;
  doi: string | null;
  arxivId: string | null;
  title?: string;
  year?: number | null;
  summary?: string | null;
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
  const raw = fromSession || req.projectRoot?.trim() || "";
  return raw ? resolveLibraryProjectRoot(raw) : "";
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
  return {
    paper: {
      ...mapPaperForAgent(paper),
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

function handleSearch(
  projectRoot: string,
  query: string,
  limit?: number,
  tag?: string,
  collection?: string,
): Record<string, unknown> {
  const rows = searchPapers(projectRoot, query, limit ?? 20, {
    tag: tag?.trim() || null,
    collection: collection?.trim() || null,
  });
  const collections = listCollections(projectRoot).map((c) => {
    const row = c as { id?: string; name?: string; paper_count?: number };
    return { id: row.id ?? "", name: row.name ?? "", paperCount: row.paper_count ?? 0 };
  });
  return {
    query: query.trim() || null,
    tag: tag?.trim() || null,
    collection: collection?.trim() || null,
    results: rows.map((p) => mapPaperSearchHitForAgent(p)),
    count: rows.length,
    collections,
    hint:
      query.trim()
        ? "Project tags and AI summaries are included. Use tag= for exact tag filter, collection= to filter by collection name; query searches title, abstract, authors, tags, and ai_summary."
        : "Listed all papers in the project library (empty query). Cite library papers in chat as [@bibkey]. Use collection= to filter by collection; see `collections` below for the roster.",
  };
}

async function handleCitationHealth(
  projectRoot: string,
  verify: boolean,
): Promise<Record<string, unknown>> {
  try {
    const health = getCitationHealth(projectRoot);
    if (verify) {
      // Verify each .bib-only gap entry's DOI/arXiv against external catalogs
      // so the agent can flag fabricated/untraceable references. Library papers
      // are already verified at import time; only .bib-only gaps need this.
      await Promise.all(
        health.bibFallback.map(async (entry) => {
          if (!entry.doi && !entry.arxivId) {
            entry.verified = false;
            entry.verifyError = "No DOI/arXiv in .bib — cannot verify against catalogs.";
            return;
          }
          try {
            const { metadata } = await resolveBibliographicMetadata(
              { doi: entry.doi ?? undefined, arxivId: entry.arxivId ?? undefined },
              { fast: true },
            );
            entry.verified = Boolean(metadata.title?.trim());
            entry.verifyError = entry.verified
              ? undefined
              : "Identifier did not resolve to a verifiable title in catalogs.";
          } catch (err) {
            entry.verified = false;
            entry.verifyError = err instanceof Error ? err.message : String(err);
          }
        }),
      );
    }
    return {
      ...health,
      hint:
        "Unified citation health: .tex ↔ .bib ↔ library.db. bibCheck covers .tex vs .bib (+ library by default); " +
        "libraryCheck covers .tex vs library.db; bibFallback lists missing keys with metadata parsed from references.bib " +
        "(verified=true means DOI/arXiv resolved in catalogs = traceable; verified=false = unverifiable/fabricated); " +
        "bibKeysNotInLibrary lists .bib keys not in the library (library-first policy). " +
        "Use literature-export-bib to sync library→.bib, or import missing keys into library from .bib via UI/IPC.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

function handleDelete(projectRoot: string, bibkey: string): Record<string, unknown> {
  try {
    const paper = getPaperByBibkey(projectRoot, bibkey);
    if (!paper) {
      return {
        error: `Paper not found in library: ${bibkey}`,
        bibkey,
        hint: "Copy the exact Cite key from the Literature panel (case-sensitive).",
      };
    }
    deletePaper(projectRoot, paper.id);
    return {
      success: true,
      bibkey,
      paperId: paper.id,
      title: paper.title,
      hint: "Paper removed from library.db. PDF cache cleaned up if no other paper shares it.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message, bibkey };
  }
}

function handleExportBib(
  projectRoot: string,
  req: LiteratureBridgeRequest,
): Record<string, unknown> {
  try {
    const result = mergeLibraryIntoProjectBib(projectRoot, {
      bibkeys: req.bibkeys,
      paperIds: req.paperIds,
      all: req.all,
      onlyCitedInTex: req.onlyCitedInTex !== false,
    });
    return {
      ...result,
      hint:
        result.appended.length > 0
          ? "Run citation-health to verify .tex ↔ .bib ↔ library alignment."
          : "No new entries appended — keys may already exist in the project .bib.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

function notifyRendererCitationStaged(stagingSessionId: string, result: StageResult): void {
  if (!result.staged || !result.verified || !result.citation) return;
  const tabId = resolveChatTabId(stagingSessionId);
  if (!tabId) return;
  emitChatStream(tabId, "citation.staged", { sessionId: stagingSessionId, result });
}

/** Stage a citation with session-scoped refId (shared by bridge + IPC). */
export async function stageLiteratureCitation(
  projectRoot: string,
  sessionId: string,
  payload: {
    doi?: string;
    arxivId?: string;
    sourceUrl?: string;
    discoveredFrom?: StagedCitationPayload["discoveredFrom"];
  },
): Promise<StageResult> {
  const stagingSessionId = AcpService.getInstance().resolveCitationStagingSessionId(sessionId);
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
  const records = readSessionStaging(stagingSessionId);
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
      records.push({
        refId,
        doi: normDoi,
        arxivId: normArxiv,
        title: citationPayload.title,
        year: citationPayload.year,
        summary: citationPayload.abstract?.slice(0, 240) ?? null,
      });
      writeSessionStaging(stagingSessionId, records);
    } else if (matched && citationPayload.title) {
      matched.title = citationPayload.title;
      matched.year = citationPayload.year;
      matched.summary = citationPayload.abstract?.slice(0, 240) ?? matched.summary ?? null;
      writeSessionStaging(stagingSessionId, records);
    }

    const stageResult: StageResult = {
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
    notifyRendererCitationStaged(stagingSessionId, stageResult);
    return stageResult;
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
  collection?: string,
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

    // Optional: add the new (or existing) paper to a named collection.
    // Collections must already exist — the agent does not create them.
    let collectionAdded: { name: string; added: boolean; error?: string } | null = null;
    const collectionName = collection?.trim();
    if (collectionName) {
      const cols = listCollections(projectRoot);
      const col = cols.find(
        (c) => (c as { name?: string }).name?.toLowerCase() === collectionName.toLowerCase(),
      );
      if (!col) {
        collectionAdded = {
          name: collectionName,
          added: false,
          error: "Collection not found — create it in the Literature panel first.",
        };
      } else {
        try {
          const n = addPapersToCollection(projectRoot, (col as { id: string }).id, [paper.id]);
          collectionAdded = { name: (col as { name: string }).name, added: n > 0 };
        } catch (err) {
          collectionAdded = {
            name: collectionName,
            added: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }

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
      collectionAdded,
      hint: collectionAdded?.error
        ? `Paper added to library, but collection "${collectionAdded.name}" was not found. Create it in the Literature panel first.`
        : result.created
          ? collectionAdded?.added
            ? `Paper added to library and to collection "${collectionAdded.name}".`
            : "Paper added to library. Use @ mention or literature-read for context."
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

function isStrictIntensivePdfGate(): boolean {
  return getSettings().literatureStrictIntensivePdf !== false;
}

function intensiveReadPdfBlocked(
  sessionId: string | undefined,
  bibkey: string,
): Record<string, unknown> | null {
  if (!isStrictIntensivePdfGate()) return null;
  if (isSessionIntensiveBibkey(sessionId, bibkey)) return null;
  return {
    error: `Paper "${bibkey}" is not in the intensive reading list for this chat session.`,
    bibkey,
    intensiveReadingRequired: true,
    hint:
      `Call literature-intensive-reading with action=add and bibkey="${bibkey}" to enable intensive reading for this chat, ` +
      `then retry literature-read-pdf. Or ask the user to toggle Intensive reading via @ paper menu. ` +
      `If extract is missing, run ${PAPER_EXTRACT_AGENT_UI_HINT}.`,
  };
}

function handleIntensiveReading(req: LiteratureBridgeRequest): Record<string, unknown> {
  const sessionId = (req.sessionId ?? "").trim();
  if (!sessionId || sessionId === "unknown") {
    return { error: "Missing sessionId for intensive reading." };
  }
  const projectRoot = resolveProjectRoot(req);
  if (!projectRoot) {
    return { error: "Project root unknown for this chat session." };
  }

  const intensiveAction = (req.intensiveAction ?? "add").trim().toLowerCase();
  if (intensiveAction === "list") {
    const bibkeys = getSessionIntensiveBibkeys(sessionId);
    return { ok: true, action: "list", bibkeys, count: bibkeys.length };
  }

  const bibkey = req.bibkey?.trim() ?? "";
  if (!bibkey) return { error: "Missing bibkey parameter." };
  const paper = getPaperByBibkey(projectRoot, bibkey);
  if (!paper) {
    return {
      error: `No library paper with bibkey "${bibkey}".`,
      hint: "Use literature-search / literature-read to confirm the exact cite key first.",
    };
  }

  const tabId = resolveChatTabId(sessionId);
  if (intensiveAction === "remove") {
    const bibkeys = removeSessionIntensiveBibkey(sessionId, paper.bibkey);
    if (tabId) {
      emitChatStream(tabId, "literature.intensive", {
        action: "remove",
        sessionId,
        paperId: paper.id,
        bibkey: paper.bibkey,
        bibkeys,
      });
    }
    return {
      ok: true,
      action: "remove",
      bibkey: paper.bibkey,
      paperId: paper.id,
      title: paper.title,
      bibkeys,
      hint: "Paper removed from intensive reading for this chat.",
    };
  }

  // default: add
  const bibkeys = addSessionIntensiveBibkey(sessionId, paper.bibkey);
  if (tabId) {
    emitChatStream(tabId, "literature.intensive", {
      action: "add",
      sessionId,
      paperId: paper.id,
      bibkey: paper.bibkey,
      bibkeys,
    });
  }
  return {
    ok: true,
    action: "add",
    bibkey: paper.bibkey,
    paperId: paper.id,
    title: paper.title,
    bibkeys,
    hint: "Intensive reading enabled for this chat. You may now call literature-read-pdf on this bibkey.",
  };
}

async function handleDiscover(req: LiteratureBridgeRequest): Promise<Record<string, unknown>> {
  const query = req.query?.trim() ?? "";
  if (!query) {
    return {
      error: "Missing query parameter.",
      hint: "Provide a focused topic or keyword query for external literature discovery.",
    };
  }
  const settings = getSettings();
  const result = await discoverLiterature({
    query,
    sources: req.sources,
    limit: req.limit,
    year: req.year,
    author: req.author,
    semanticScholarApiKey: settings.semanticScholarApiKey,
    pubmedApiKey: settings.pubmedApiKey,
  });
  return {
    ...result,
    hint:
      "External discovery hits only — call literature-stage with each DOI/arXiv before citing as [n]. " +
      "Does not search or modify the project library.",
  };
}

function dispatch(req: LiteratureBridgeRequest): unknown | Promise<unknown> {
  const projectRoot = resolveProjectRoot(req);
  if (!projectRoot) {
    return {
      error: "Project root unknown for this chat session.",
      hint: "Open a project in prismnext and start a new chat tab from that project.",
    };
  }

  switch (req.action) {
    case "read": {
      const bibkey = req.bibkey?.trim() ?? "";
      if (!bibkey) return { error: "Missing bibkey parameter." };
      return handleRead(projectRoot, bibkey);
    }
    case "read-pdf": {
      const bibkey = req.bibkey?.trim() ?? "";
      if (!bibkey) return { error: "Missing bibkey parameter." };
      const blocked = intensiveReadPdfBlocked(req.sessionId, bibkey);
      if (blocked) return blocked;
      const settings = getSettings();
      const token = settings.mineruApiToken;
      const tokenPresent = typeof token === "string" && token.trim().length > 0;
      return readPaperPdfContent(
        {
          projectRoot,
          bibkey,
          pages: req.pages,
          query: req.query,
          source: req.source,
          force: req.force,
          initiatedBy: "agent",
          waitTimeoutMs: 5 * 60_000,
        },
        tokenPresent,
      );
    }
    case "search": {
      const query = req.query?.trim() ?? "";
      const tag = req.tag?.trim() ?? "";
      const collection = req.collection?.trim() ?? "";
      return handleSearch(projectRoot, query, req.limit, tag, collection);
    }
    case "discover":
      return handleDiscover(req);
    case "citation-health":
      return handleCitationHealth(projectRoot, req.verify !== false);
    case "delete": {
      const bibkey = req.bibkey?.trim() ?? "";
      if (!bibkey) return { error: "Missing bibkey parameter." };
      return handleDelete(projectRoot, bibkey);
    }
    case "export-bib":
      return handleExportBib(projectRoot, req);
    case "add": {
      const doi = req.doi?.trim();
      const arxivId = req.arxivId?.trim();
      if (!doi && !arxivId) return { error: "Missing doi or arxivId parameter." };
      return handleAdd(projectRoot, doi, arxivId, req.collection?.trim() || undefined);
    }
    case "intensive-reading":
      return handleIntensiveReading(req);
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
      return stageLiteratureCitation(projectRoot, sessionId, {
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

function recordLibraryTaskHitsFromBridgeResult(
  sessionId: string | undefined,
  action: LiteratureBridgeRequest["action"],
  result: Record<string, unknown>,
): void {
  if (!sessionId?.trim() || result.error) return;
  if (action === "citation-health") {
    recordCiteAuditHealth(sessionId, result);
  } else if (action === "search") {
    recordLibraryTaskHitsFromToolSession(
      sessionId,
      hitsFromLiteratureSearchResult(result),
    );
  } else if (action === "read") {
    recordLibraryTaskHitsFromToolSession(
      sessionId,
      hitsFromLiteratureReadResult(result),
    );
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
      const result = await Promise.resolve(dispatch(req)) as Record<string, unknown>;
      recordLibraryTaskHitsFromBridgeResult(req.sessionId, req.action, result);
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
