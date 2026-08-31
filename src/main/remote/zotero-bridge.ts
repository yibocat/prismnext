import { MAX_REMOTE_FRAME_BYTES, parseRemoteAbs } from "../../shared/remote";
import { buildZoteroPaperCslJson } from "../literature/zotero/zotero-csl";
import {
  fetchItemPdfBytes,
  fetchZoteroCollection,
  getItemPdfAttachmentKey,
  listCollectionTreeItemRecords,
  resolveItemBibliographies,
  type ZoteroItemRecord,
} from "../literature/zotero/zotero-client";
import type { LiteratureImportPaper } from "../literature/zotero-import-batch";
import type { ZoteroSyncResult } from "../literature/zotero/zotero-sync";

export const REMOTE_ZOTERO_PROGRESS_CHANNEL = "remote:zoteroProgress";

export interface RemoteZoteroProgress {
  current: number;
  total: number;
  title: string;
}

const MAX_PDF_BYTES = Math.floor(MAX_REMOTE_FRAME_BYTES * 0.6);

let pullCancelled = false;

export function cancelRemoteZoteroPull(): void {
  pullCancelled = true;
}

export function resetRemoteZoteroPullForTests(): void {
  pullCancelled = false;
}

function assertNotCancelled(): void {
  if (pullCancelled) throw new Error("Zotero pull cancelled.");
}

async function paperFromItem(item: ZoteroItemRecord): Promise<LiteratureImportPaper> {
  const bib = (await resolveItemBibliographies([item.key]))[item.key];
  const bibkey = bib?.citekey ?? item.key;
  const rawBibtex = bib?.rawBibtex ?? null;
  const attachKey = await getItemPdfAttachmentKey(item.key);
  let pdfBase64: string | undefined;
  if (attachKey) {
    const bytes = await fetchItemPdfBytes(attachKey);
    if (bytes && bytes.byteLength <= MAX_PDF_BYTES) {
      pdfBase64 = Buffer.from(bytes).toString("base64");
    }
  }
  return {
    zoteroKey: item.key,
    zoteroVersion: item.version,
    zoteroAttachKey: attachKey,
    bibkey,
    rawBibtex,
    cslJson: buildZoteroPaperCslJson(item, { bibkey, rawBibtex }),
    title: item.title,
    authors: item.authorsJson,
    year: item.year,
    abstract: item.abstract,
    doi: item.doi ?? null,
    arxivId: item.arxivId,
    venue: item.venue,
    type: item.itemType,
    pdfBase64,
  };
}

export async function pullRemoteZoteroCollection(opts: {
  projectRoot: string;
  invoke: (method: string, params: unknown) => Promise<unknown>;
  onProgress?: (progress: RemoteZoteroProgress) => void;
}): Promise<ZoteroSyncResult> {
  pullCancelled = false;
  const parsed = parseRemoteAbs(opts.projectRoot);
  if (!parsed) throw new Error("Not a remote project.");
  const abs = parsed.abs;

  const binding = await opts.invoke("literature:getZoteroBinding", { projectRoot: abs }) as {
    zoteroCollectionId?: string;
    zoteroCollectionName?: string;
  };
  const collectionKey = binding.zoteroCollectionId?.trim();
  if (!collectionKey) throw new Error("No Zotero collection bound to this project.");

  const items = await listCollectionTreeItemRecords(collectionKey);
  const zoteroKeys = items.map((item) => item.key);
  let papersUpserted = 0;

  for (let i = 0; i < items.length; i += 1) {
    assertNotCancelled();
    const item = items[i]!;
    opts.onProgress?.({ current: i + 1, total: items.length, title: item.title });
    const paper = await paperFromItem(item);
    assertNotCancelled();
    await opts.invoke("literature:importBatch", {
      projectRoot: abs,
      collectionKey,
      collectionName: binding.zoteroCollectionName ?? null,
      papers: [paper],
    });
    papersUpserted += 1;
  }

  const finalized = await opts.invoke("literature:importBatch", {
    projectRoot: abs,
    collectionKey,
    collectionName: binding.zoteroCollectionName ?? null,
    papers: [],
    finalize: true,
    zoteroKeys,
  }) as ZoteroSyncResult;

  return {
    ...finalized,
    papersUpserted,
    collectionKey,
  };
}

export async function pullRemoteZoteroCollections(opts: {
  projectRoot: string;
  invoke: (method: string, params: unknown) => Promise<unknown>;
}): Promise<{ collectionsUpserted: number; collectionsPruned: number }> {
  const parsed = parseRemoteAbs(opts.projectRoot);
  if (!parsed) throw new Error("Not a remote project.");
  const binding = await opts.invoke("literature:getZoteroBinding", {
    projectRoot: parsed.abs,
  }) as { zoteroCollectionId?: string; zoteroCollectionName?: string };
  const collectionKey = binding.zoteroCollectionId?.trim();
  if (!collectionKey) return { collectionsUpserted: 0, collectionsPruned: 0 };

  const fetched = await fetchZoteroCollection(collectionKey);
  const result = await opts.invoke("literature:importBatch", {
    projectRoot: parsed.abs,
    collectionKey,
    collectionName: fetched?.name ?? binding.zoteroCollectionName ?? collectionKey,
    papers: [],
    finalize: true,
  }) as { collectionsUpserted?: number; collectionsPruned?: number };

  return {
    collectionsUpserted: result.collectionsUpserted ?? 1,
    collectionsPruned: result.collectionsPruned ?? 0,
  };
}
