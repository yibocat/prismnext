import {
  attachPdfBufferToPaper,
  openLibraryDb,
  replaceCollectionPaperLinks,
  upsertZoteroCollectionRow,
  upsertZoteroPaperRow,
} from "./facade";
import {
  pruneOrphanZoteroCollections,
  pruneOrphanZoteroPapers,
  type ZoteroSyncResult,
} from "./zotero/zotero-sync";

export interface LiteratureImportPaper {
  zoteroKey: string;
  zoteroVersion: number;
  zoteroAttachKey?: string | null;
  bibkey: string;
  rawBibtex?: string | null;
  cslJson?: string | null;
  title: string;
  authors: string | null;
  year: number | null;
  abstract: string | null;
  doi: string | null;
  arxivId: string | null;
  venue: string | null;
  type: string | null;
  pdfBase64?: string;
}

export interface LiteratureImportBatchInput {
  projectRoot: string;
  collectionKey: string;
  collectionName?: string | null;
  papers?: LiteratureImportPaper[];
  finalize?: boolean;
  zoteroKeys?: string[];
}

function paperIdsForZoteroKeys(projectRoot: string, keys: string[]): string[] {
  const db = openLibraryDb(projectRoot);
  const ids: string[] = [];
  for (const key of keys) {
    const row = db
      .prepare("SELECT paper_id FROM zotero_mirror WHERE zotero_key = ?")
      .get(key) as { paper_id: string } | undefined;
    if (row?.paper_id) ids.push(row.paper_id);
  }
  return ids;
}

function writeLastSync(projectRoot: string): void {
  const db = openLibraryDb(projectRoot);
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('zotero_last_sync', ?)").run(
    String(Date.now()),
  );
}

function asPaper(value: unknown): LiteratureImportPaper | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.zoteroKey !== "string" || !rec.zoteroKey.trim()) return null;
  if (typeof rec.bibkey !== "string" || !rec.bibkey.trim()) return null;
  return {
    zoteroKey: rec.zoteroKey,
    zoteroVersion: typeof rec.zoteroVersion === "number" ? rec.zoteroVersion : 0,
    zoteroAttachKey: typeof rec.zoteroAttachKey === "string" ? rec.zoteroAttachKey : null,
    bibkey: rec.bibkey,
    rawBibtex: typeof rec.rawBibtex === "string" ? rec.rawBibtex : null,
    cslJson: typeof rec.cslJson === "string" ? rec.cslJson : null,
    title: typeof rec.title === "string" ? rec.title : rec.bibkey,
    authors: typeof rec.authors === "string" ? rec.authors : null,
    year: typeof rec.year === "number" ? rec.year : null,
    abstract: typeof rec.abstract === "string" ? rec.abstract : null,
    doi: typeof rec.doi === "string" ? rec.doi : null,
    arxivId: typeof rec.arxivId === "string" ? rec.arxivId : null,
    venue: typeof rec.venue === "string" ? rec.venue : null,
    type: typeof rec.type === "string" ? rec.type : null,
    pdfBase64: typeof rec.pdfBase64 === "string" ? rec.pdfBase64 : undefined,
  };
}

export function parseLiteratureImportBatch(
  projectRoot: string,
  params: Record<string, unknown>,
): LiteratureImportBatchInput {
  const papers = Array.isArray(params.papers)
    ? params.papers.map(asPaper).filter((item): item is LiteratureImportPaper => Boolean(item))
    : [];
  const zoteroKeys = Array.isArray(params.zoteroKeys)
    ? params.zoteroKeys.filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    projectRoot,
    collectionKey: typeof params.collectionKey === "string" ? params.collectionKey : "",
    collectionName: typeof params.collectionName === "string" ? params.collectionName : null,
    papers,
    finalize: params.finalize === true,
    zoteroKeys,
  };
}

export function importZoteroBatchForRenderer(
  projectRoot: string,
  input: LiteratureImportBatchInput,
): ZoteroSyncResult {
  const collectionKey = input.collectionKey.trim();
  if (!collectionKey) throw new Error("Missing Zotero collection key.");

  const collection = upsertZoteroCollectionRow(projectRoot, {
    key: collectionKey,
    name: input.collectionName?.trim() || collectionKey,
    parentKey: null,
    version: 0,
    sortOrder: 0,
  });

  let papersUpserted = 0;
  for (const item of input.papers ?? []) {
    const paper = upsertZoteroPaperRow(projectRoot, {
      zoteroKey: item.zoteroKey,
      zoteroVersion: item.zoteroVersion,
      zoteroAttachKey: item.zoteroAttachKey ?? null,
      bibkey: item.bibkey,
      rawBibtex: item.rawBibtex,
      cslJson: item.cslJson,
      title: item.title,
      authors: item.authors,
      year: item.year,
      abstract: item.abstract,
      doi: item.doi,
      arxivId: item.arxivId,
      venue: item.venue,
      type: item.type,
    });
    if (item.pdfBase64) {
      attachPdfBufferToPaper(projectRoot, paper.id, Buffer.from(item.pdfBase64, "base64"));
    }
    papersUpserted += 1;
  }

  let collectionsPruned = 0;
  let papersPruned = 0;
  if (input.finalize) {
    if (input.zoteroKeys) {
      replaceCollectionPaperLinks(
        projectRoot,
        collection.id,
        paperIdsForZoteroKeys(projectRoot, input.zoteroKeys),
      );
      papersPruned = pruneOrphanZoteroPapers(projectRoot, input.zoteroKeys);
    }
    collectionsPruned = pruneOrphanZoteroCollections(projectRoot, [collectionKey]);
    writeLastSync(projectRoot);
  }

  return {
    collectionsUpserted: 1,
    papersUpserted,
    collectionKey,
    collectionsPruned,
    papersPruned,
  };
}
