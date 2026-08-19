/**
 * Native Literature Tools for PrismNext Pi Agent Host.
 *
 * 10 tools covering local search, catalog discovery, paper reading,
 * PDF extraction, session citation staging, library management, and BibTeX export.
 */

import { Type } from "@earendil-works/pi-ai";
import { TOOL_NAMES } from "../../../shared/tool-names";
import {
  addPapersToCollection,
  deletePaper,
  getAnnotations,
  getPaperByBibkey,
  listCollections,
  mapPaperForAgent,
  mapPaperSearchHitForAgent,
  mergeLibraryIntoProjectBib,
  searchPapers,
} from "../../services/literature-service";
import { publicationDetailsFromPaperRow } from "../../../shared/bibliographic-metadata/helpers";
import {
  addSessionIntensiveBibkey,
  getSessionIntensiveBibkeys,
  removeSessionIntensiveBibkey,
} from "../../services/chat-session-registry";
import { normalizeArxivId, normalizeDoi } from "../../../shared/doi-utils";
import type { NativeToolDefinition } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function intensiveSessionIds(ctx: { runtimeSessionId: string; tabId: string }): string[] {
  return [...new Set([ctx.runtimeSessionId, ctx.tabId].filter(Boolean))];
}

function listIntensiveBibkeys(ctx: { runtimeSessionId: string; tabId: string }): readonly string[] {
  for (const id of intensiveSessionIds(ctx)) {
    const keys = getSessionIntensiveBibkeys(id);
    if (keys.length > 0) return keys;
  }
  return [];
}

export const literatureSearchTool: NativeToolDefinition = {
  name: TOOL_NAMES.literatureSearch,
  label: "Search Literature",
  description:
    "Search papers in the current project's local literature library (.prismnext/library/library.db). " +
    "Searches title, abstract, authors, bibkey, tags, and AI summary. " +
    "Does NOT search external catalogs (use literature-discover for external search).",
  promptGuidelines: [
    "Local library only — for topic discovery across arXiv/Crossref/OpenAlex/PubMed use literature-discover, then literature-stage the candidates you want to cite.",
    "Omit `query` (and `tag`) to list the whole library; the response always includes a `collections` roster.",
    "For exact cite keys use literature-read; for reading extracted PDF text use literature-read-pdf (after adding the paper to the intensive list).",
  ],
  parameters: Type.Object({
    query: Type.Optional(Type.String({ description: "Search keyword query across title, abstract, authors, tags" })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, description: "Max results (default 20)" })),
    tag: Type.Optional(Type.String({ description: "Optional exact tag filter" })),
    collection: Type.Optional(Type.String({ description: "Optional collection name filter" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const query = str(args.query);
    const limit = typeof args.limit === "number" ? args.limit : 20;
    const tag = str(args.tag) || null;
    const collection = str(args.collection) || null;

    const rows = searchPapers(ctx.projectRoot, query, limit, { tag, collection });
    const collections = listCollections(ctx.projectRoot).map((c) => {
      const row = c as { id?: string; name?: string; paper_count?: number };
      return { id: row.id ?? "", name: row.name ?? "", paperCount: row.paper_count ?? 0 };
    });

    return {
      query: query || null,
      tag,
      collection,
      count: rows.length,
      results: rows.map((p) => mapPaperSearchHitForAgent(p)),
      collections,
    };
  },
};

export const literatureDiscoverTool: NativeToolDefinition = {
  name: TOOL_NAMES.literatureDiscover,
  label: "Discover Literature",
  description:
    "Search external academic catalogs (arXiv, Crossref, OpenAlex, Semantic Scholar, PubMed) by topic. " +
    "Returns candidate DOI/arXiv identifiers. Call literature-stage before citing as [n].",
  promptGuidelines: [
    "This returns candidate identifiers, not final citations. Stage each hit you intend to cite with literature-stage, then reference the returned refId as [n] in your reply.",
    "Prefer literature-stage over literature-add until the user confirms the candidate is wanted.",
  ],
  parameters: Type.Object({
    query: Type.String({ minLength: 1, description: "Topic or keyword query for external catalog discovery" }),
    sources: Type.Optional(Type.Array(Type.String(), { description: "Optional source catalogs list" })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, description: "Max results" })),
    year: Type.Optional(Type.String({ description: "Optional publication year filter" })),
    author: Type.Optional(Type.String({ description: "Optional author name filter" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args) {
    const query = str(args.query);
    if (!query) return { ok: false, error: "missing_query" };

    const { getSettings } = await import("../../services/settings");
    const { discoverLiterature } = await import("../../services/literature-discovery");
    const settings = getSettings();
    return discoverLiterature({
      query,
      sources: Array.isArray(args.sources) ? args.sources.filter((s): s is string => typeof s === "string") : undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
      year: str(args.year) || undefined,
      author: str(args.author) || undefined,
      semanticScholarApiKey: settings.semanticScholarApiKey,
      pubmedApiKey: settings.pubmedApiKey,
    });
  },
};

export const literatureReadTool: NativeToolDefinition = {
  name: TOOL_NAMES.literatureRead,
  label: "Read Paper",
  description:
    "Read library metadata, abstract, highlights, and PDF path for a paper in the project library by exact bibkey.",
  promptGuidelines: [
    "Bibkeys are case-sensitive — copy the exact cite key from the Literature panel or from a literature-search result; do not guess.",
    "For the paper body text (not metadata), use literature-read-pdf after adding the paper to the intensive reading list.",
  ],
  parameters: Type.Object({
    bibkey: Type.String({ minLength: 1, description: "Exact bibkey from the project Literature library" }),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const bibkey = str(args.bibkey);
    if (!bibkey) return { error: "Missing bibkey parameter." };

    const paper = getPaperByBibkey(ctx.projectRoot, bibkey);
    if (!paper) {
      return {
        error: `Paper not found in library: ${bibkey}`,
        bibkey,
        hint: "Copy the exact Cite key from Literature panel (case-sensitive).",
      };
    }
    const highlights = getAnnotations(ctx.projectRoot, paper.id).map((a) => ({
      page: a.page,
      quoted_text: a.quoted_text,
      note: a.note,
      color: a.color,
    }));
    const pdfRel = paper.pdf_path ? `.prismnext/library/${paper.pdf_path.replace(/\\/g, "/")}` : null;
    return {
      paper: {
        ...mapPaperForAgent(paper),
        publication_details: publicationDetailsFromPaperRow(paper),
        pdf_library_path: pdfRel,
        pdf_content_included: false,
      },
      highlights,
    };
  },
};

export const literatureReadPdfTool: NativeToolDefinition = {
  name: TOOL_NAMES.literatureReadPdf,
  label: "Read Paper PDF",
  description:
    "Read extracted PDF body text from the library cache for a paper on the intensive reading list. " +
    "Supports page ranges and keyword search.",
  promptGuidelines: [
    "Prerequisite: the paper must already be on the intensive reading list — call literature-intensive-reading (action: add) first.",
    "Use `pages` for a targeted range and `query` to filter within the extracted text; do not dump the whole PDF.",
    "When the body text is not cached yet, `force: true` queues an extraction that can take minutes; prefer reading what is already available unless the user needs the full text now.",
  ],
  parameters: Type.Object({
    bibkey: Type.String({ minLength: 1, description: "Exact bibkey of the intensive reading paper" }),
    pages: Type.Optional(Type.String({ description: 'Optional page range, e.g. "1-5"' })),
    query: Type.Optional(Type.String({ description: "Optional keyword filter in extracted text" })),
    source: Type.Optional(Type.String({ description: "Extract engine preference: auto, mineru, pdfjs, html" })),
    force: Type.Optional(Type.Boolean({ description: "If true, queue extraction if not already cached" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const bibkey = str(args.bibkey);
    if (!bibkey) return { error: "Missing bibkey parameter." };

    const { getSettings } = await import("../../services/settings");
    const { readPaperPdfContent } = await import("../../services/paper-extract-read");
    const settings = getSettings();
    const token = settings.mineruApiToken;
    const tokenPresent = typeof token === "string" && token.trim().length > 0;
    const source = args.source;

    return readPaperPdfContent(
      {
        projectRoot: ctx.projectRoot,
        bibkey,
        pages: str(args.pages) || undefined,
        query: str(args.query) || undefined,
        source: source === "mineru" || source === "pdfjs" || source === "html" || source === "auto" ? source : undefined,
        force: args.force === true,
        initiatedBy: "agent",
        waitTimeoutMs: 5 * 60_000,
      },
      tokenPresent,
    );
  },
};

export const literatureIntensiveReadingTool: NativeToolDefinition = {
  name: TOOL_NAMES.literatureIntensiveReading,
  label: "Intensive Reading",
  description: "Add, remove, or list papers on this session's intensive reading list (required before literature-read-pdf).",
  promptGuidelines: [
    "This list is per-session: adding a paper here is what unlocks literature-read-pdf for it.",
    "Always resolve the exact bibkey first (literature-search / literature-read); the tool refuses unknown keys with a hint.",
  ],
  parameters: Type.Object({
    action: Type.Optional(Type.String({ description: "Operation: add | remove | list (default: add)" })),
    bibkey: Type.Optional(Type.String({ description: "Exact bibkey from library (required for add/remove)" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const rawAction = str(args.action).toLowerCase();
    const action = rawAction === "remove" || rawAction === "list" || rawAction === "add" ? rawAction : "add";

    if (action === "list") {
      const bibkeys = listIntensiveBibkeys(ctx);
      return { ok: true, action: "list", bibkeys, count: bibkeys.length };
    }

    const bibkey = str(args.bibkey);
    if (!bibkey) return { error: "Missing bibkey parameter for add/remove." };

    const paper = getPaperByBibkey(ctx.projectRoot, bibkey);
    if (!paper) {
      return {
        error: `No library paper with bibkey "${bibkey}".`,
        hint: "Use literature-search / literature-read to confirm the exact cite key first.",
      };
    }

    if (action === "remove") {
      let bibkeys: readonly string[] = [];
      for (const id of intensiveSessionIds(ctx)) {
        bibkeys = removeSessionIntensiveBibkey(id, paper.bibkey);
      }
      return {
        ok: true,
        action: "remove",
        bibkey: paper.bibkey,
        paperId: paper.id,
        title: paper.title,
        bibkeys,
      };
    }

    let bibkeys: readonly string[] = [];
    for (const id of intensiveSessionIds(ctx)) {
      bibkeys = addSessionIntensiveBibkey(id, paper.bibkey);
    }
    return {
      ok: true,
      action: "add",
      bibkey: paper.bibkey,
      paperId: paper.id,
      title: paper.title,
      bibkeys,
    };
  },
};

export const literatureStageTool: NativeToolDefinition = {
  name: TOOL_NAMES.literatureStage,
  label: "Stage Citation",
  description:
    "Verify a DOI or arXiv ID against external catalogs and stage as a session citation without writing to library.db. " +
    "Reference the returned refId as [n] in your reply.",
  promptGuidelines: [
    "This is the intended bridge between discovering a paper and citing it — reference the returned `refId` as [n] in your reply text.",
    "Staging does not persist to the library; use literature-add only when the user wants the paper saved into the project library.",
    "Pass `discoveredFrom` honestly (literature-discover / websearch / user / agent) so provenance is recorded.",
  ],
  parameters: Type.Object({
    doi: Type.Optional(Type.String({ description: "Exact DOI" })),
    arxivId: Type.Optional(Type.String({ description: "Exact arXiv ID" })),
    sourceUrl: Type.Optional(Type.String({ description: "Optional origin URL for provenance" })),
    discoveredFrom: Type.Optional(Type.String({ description: "Discovery origin: literature-discover, websearch, user, agent" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const doi = str(args.doi);
    const arxivId = str(args.arxivId);
    if (!doi && !arxivId) {
      return {
        staged: false,
        verified: false,
        error: "Provide exactly one of doi or arxivId.",
      };
    }
    if (doi && arxivId) {
      return { staged: false, verified: false, error: "Provide only one of doi or arxivId, not both." };
    }
    const allowed = ["literature-discover", "websearch", "webfetch", "user", "agent"] as const;
    const rawOrigin = str(args.discoveredFrom) || "agent";
    const discoveredFrom = (allowed as readonly string[]).includes(rawOrigin as any)
      ? (rawOrigin as (typeof allowed)[number])
      : "agent";

    const { stageLiteratureCitation } = await import("../../services/literature-bridge");
    return stageLiteratureCitation(ctx.projectRoot, ctx.tabId || ctx.runtimeSessionId, {
      doi: doi || undefined,
      arxivId: arxivId || undefined,
      sourceUrl: str(args.sourceUrl) || undefined,
      discoveredFrom,
    });
  },
};

export const literatureAddTool: NativeToolDefinition = {
  name: TOOL_NAMES.literatureAdd,
  label: "Add Paper",
  description: "Add a verified paper to the project literature library by DOI or arXiv ID.",
  promptGuidelines: [
    "Only add papers the user explicitly wants in the project library; for in-flight citations prefer literature-stage.",
    "Provide exactly one of `doi` / `arxivId`; the tool normalizes both and rejects ambiguous calls.",
  ],
  parameters: Type.Object({
    doi: Type.Optional(Type.String({ description: "Exact verified DOI" })),
    arxivId: Type.Optional(Type.String({ description: "Exact verified arXiv ID" })),
    collection: Type.Optional(Type.String({ description: "Optional collection name to add the paper into" })),
  }),
  permission: {
    category: "safe_write",
    extractPath: () => ".prismnext/library/library.db",
  },
  async execute(args, ctx) {
    const normDoi = str(args.doi) ? normalizeDoi(str(args.doi)) : null;
    const normArxiv = str(args.arxivId) ? normalizeArxivId(str(args.arxivId)) : null;

    if (!normDoi && !normArxiv) {
      return { error: "Provide exactly one of doi or arxivId.", verified: false };
    }
    if (normDoi && normArxiv) {
      return { error: "Provide only one of doi or arxivId, not both.", verified: false };
    }

    try {
      const { createPaperFromCatalog } = await import("../../services/literature-enrich");
      const result = await createPaperFromCatalog(ctx.projectRoot, {
        doi: normDoi ?? undefined,
        arxivId: normArxiv ?? undefined,
      });
      const paper = result.paper;
      if (!paper.title?.trim()) {
        return { error: "Catalog returned no verifiable title; paper not added.", verified: false };
      }

      const collectionName = str(args.collection);
      let collectionAdded: { name: string; added: boolean; error?: string } | null = null;
      if (collectionName) {
        const cols = listCollections(ctx.projectRoot);
        const col = cols.find((c) => (c as { name?: string }).name?.toLowerCase() === collectionName.toLowerCase());
        if (!col) {
          collectionAdded = { name: collectionName, added: false, error: "Collection not found in library." };
        } else {
          try {
            const n = addPapersToCollection(ctx.projectRoot, (col as { id: string }).id, [paper.id]);
            collectionAdded = { name: (col as { name: string }).name, added: n > 0 };
          } catch (err) {
            collectionAdded = { name: collectionName, added: false, error: err instanceof Error ? err.message : String(err) };
          }
        }
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
        collectionAdded,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message, verified: false };
    }
  },
};

export const literatureDeleteTool: NativeToolDefinition = {
  name: TOOL_NAMES.literatureDelete,
  label: "Delete Paper",
  description: "Delete a paper and its annotations from the project literature library by exact bibkey.",
  promptGuidelines: [
    "Destructive and permanent — confirm the exact bibkey and the user's intent before deleting; this also removes annotations.",
  ],
  parameters: Type.Object({
    bibkey: Type.String({ minLength: 1, description: "Exact cite key of the paper to delete" }),
  }),
  permission: {
    category: "destructive",
    extractPath: () => ".prismnext/library/library.db",
  },
  async execute(args, ctx) {
    const bibkey = str(args.bibkey);
    if (!bibkey) return { error: "Missing bibkey parameter." };

    const paper = getPaperByBibkey(ctx.projectRoot, bibkey);
    if (!paper) {
      return {
        error: `Paper not found in library: ${bibkey}`,
        bibkey,
      };
    }
    deletePaper(ctx.projectRoot, paper.id);
    return {
      success: true,
      bibkey,
      paperId: paper.id,
      title: paper.title,
    };
  },
};

export const citationHealthTool: NativeToolDefinition = {
  name: TOOL_NAMES.citationHealth,
  label: "Citation Health",
  description:
    "Unified citation health audit: check \\cite keys across project .tex files, .bib files, and library.db.",
  promptGuidelines: [
    "Use this to detect missing/unresolved citations before claiming the manuscript compiles or is complete.",
    "Set `verify: false` to skip the (slower) external catalog verification of .bib fallback entries.",
  ],
  parameters: Type.Object({
    verify: Type.Optional(Type.Boolean({ description: "Verify gap entries against external catalogs (default true)" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    try {
      const { getCitationHealth } = await import("../../services/citation-health");
      const { resolveBibliographicMetadata } = await import("../../../shared/bibliographic-metadata");
      const health = getCitationHealth(ctx.projectRoot);
      const verify = args.verify !== false;
      if (verify) {
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
      return health;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message };
    }
  },
};

export const literatureExportBibTool: NativeToolDefinition = {
  name: TOOL_NAMES.literatureExportBib,
  label: "Export Library to .bib",
  description: "Append BibTeX entries from the project literature library into the manuscript references.bib file.",
  promptGuidelines: [
    "By default exports only keys cited in the manuscript .tex (`onlyCitedInTex: true`) — this is what you normally want before a compile.",
    "Use `bibkeys` for a precise subset, or `all: true` only when the user explicitly wants the entire library dumped.",
  ],
  parameters: Type.Object({
    bibkeys: Type.Optional(Type.Array(Type.String(), { description: "Optional list of specific bibkeys to export" })),
    all: Type.Optional(Type.Boolean({ description: "Export entire library (default false — only cited keys in .tex)" })),
    onlyCitedInTex: Type.Optional(Type.Boolean({ description: "Export keys cited in .tex (default true)" })),
  }),
  permission: {
    category: "safe_write",
    extractPath: () => "references.bib",
  },
  async execute(args, ctx) {
    const bibkeys = Array.isArray(args.bibkeys)
      ? args.bibkeys.filter((item): item is string => typeof item === "string")
      : undefined;

    return mergeLibraryIntoProjectBib(ctx.projectRoot, {
      bibkeys,
      all: args.all === true,
      onlyCitedInTex: args.onlyCitedInTex !== false,
    });
  },
};

export const LITERATURE_TOOLS: NativeToolDefinition[] = [
  literatureSearchTool,
  literatureDiscoverTool,
  literatureReadTool,
  literatureReadPdfTool,
  literatureIntensiveReadingTool,
  literatureStageTool,
  literatureAddTool,
  literatureDeleteTool,
  citationHealthTool,
  literatureExportBibTool,
];
