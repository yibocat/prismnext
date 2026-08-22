import * as fs from "node:fs";
import * as path from "node:path";
import {
  createZoteroCollection,
  deleteZoteroCollection,
  listCollectionItemRecords,
  listCollectionTreeItemRecords,
  fetchZoteroCollection,
  removeItemFromZoteroCollection,
  renameZoteroCollection,
  resolveItemBibliographies,
  exportBibTeX as exportZoteroItemBibTeX,
  probeBetterBibTeX,
  type ZoteroCollection,
} from "./zotero-client";
import { buildZoteroPaperCslJson } from "./zotero-csl";
import { getZoteroWriter } from "./zotero-writer";
import {
  type CollectionRow,
  addPapersToCollection,
  deleteCollection,
  getLibraryPaths,
  openLibraryDb,
  projectHomeSlotDir,
  removePapersFromCollection,
  replaceCollectionPaperLinks,
  updateCollection,
  upsertZoteroCollectionRow,
  upsertZoteroPaperRow,
  resolveOrphanZoteroPaper,
  findProjectBibPath,
} from "../facade";
import { readLiteratureProjectConfig } from "../../project/workspace-config";
import { getZoteroStatus } from "./zotero-client";

/**
 * Whether collection mutations in this project should propagate to Zotero.
 *
 * The main-process IPC layer uses this as the single source of truth for
 * routing collection writes (Zotero vs local-only), instead of letting the
 * renderer decide. A project is considered Zotero-active when it has a bound
 * Zotero collection OR the Zotero write channel (Web API / BBT debug-bridge)
 * is reachable.
 */
export async function isProjectZoteroWriteActive(projectRoot: string): Promise<boolean> {
  const binding = readLiteratureProjectConfig(prismDir(projectRoot));
  if (binding.zoteroCollectionId) return true;
  try {
    const status = await getZoteroStatus();
    return status.webReachable || status.bbtDebugBridge;
  } catch {
    return false;
  }
}

export interface ZoteroSyncResult {
  collectionsUpserted: number;
  papersUpserted: number;
  collectionKey: string;
  collectionsPruned: number;
  papersPruned: number;
}

export function pruneOrphanZoteroCollections(
  projectRoot: string,
  activeZoteroKeys: readonly string[],
): number {
  const active = new Set(activeZoteroKeys);
  const db = openLibraryDb(projectRoot);
  const rows = db
    .prepare("SELECT id, zotero_key FROM collections WHERE zotero_key IS NOT NULL")
    .all() as Array<{ id: string; zotero_key: string }>;

  let pruned = 0;
  for (const row of rows) {
    if (active.has(row.zotero_key)) continue;
    db.prepare("DELETE FROM collections WHERE id = ?").run(row.id);
    pruned++;
  }
  return pruned;
}

export function pruneOrphanZoteroPapers(
  projectRoot: string,
  activeZoteroKeys: readonly string[],
): number {
  const active = new Set(activeZoteroKeys);
  const db = openLibraryDb(projectRoot);
  const mirrors = db.prepare(
    "SELECT paper_id, zotero_key FROM zotero_mirror",
  ).all() as Array<{ paper_id: string; zotero_key: string }>;

  let deleted = 0;
  for (const mirror of mirrors) {
    if (active.has(mirror.zotero_key)) continue;
    if (resolveOrphanZoteroPaper(projectRoot, mirror.paper_id) === "deleted") {
      deleted++;
    }
  }
  return deleted;
}

function prismDir(projectRoot: string): string {
  return projectHomeSlotDir(projectRoot);
}

export async function syncZoteroCollections(
  projectRoot: string,
  boundCollectionKey?: string | null,
): Promise<{
  upserted: number;
  pruned: number;
}> {
  if (!boundCollectionKey) {
    const pruned = pruneOrphanZoteroCollections(projectRoot, []);
    return { upserted: 0, pruned };
  }

  const fetched = await fetchZoteroCollection(boundCollectionKey);
  const col: ZoteroCollection = fetched ?? {
    key: boundCollectionKey,
    name: boundCollectionKey,
    parentKey: null,
    version: 0,
  };

  // Flatten to sidebar root — we only mirror the bound collection, not its Zotero ancestors.
  upsertZoteroCollectionRow(projectRoot, {
    key: col.key,
    name: col.name,
    parentKey: null,
    version: col.version,
    sortOrder: 0,
  });

  const pruned = pruneOrphanZoteroCollections(projectRoot, [boundCollectionKey]);
  return { upserted: 1, pruned };
}

async function ensureBoundZoteroCollectionCached(
  projectRoot: string,
  collectionKey: string,
  collectionName?: string | null,
): Promise<string> {
  const db = openLibraryDb(projectRoot);
  const existing = db
    .prepare("SELECT id FROM collections WHERE id = ? OR zotero_key = ?")
    .get(collectionKey, collectionKey) as { id: string } | undefined;
  if (existing) return existing.id;

  const fetched = await fetchZoteroCollection(collectionKey);
  if (fetched) {
    return upsertZoteroCollectionRow(projectRoot, {
      key: fetched.key,
      name: fetched.name,
      parentKey: null,
      version: fetched.version,
      sortOrder: 0,
    }).id;
  }

  return upsertZoteroCollectionRow(projectRoot, {
    key: collectionKey,
    name: collectionName ?? collectionKey,
    parentKey: null,
    version: 0,
    sortOrder: 0,
  }).id;
}

export async function syncBoundZoteroCollection(projectRoot: string): Promise<ZoteroSyncResult> {
  const binding = readLiteratureProjectConfig(prismDir(projectRoot));
  const collectionKey = binding.zoteroCollectionId;
  if (!collectionKey) {
    throw new Error("No Zotero collection bound to this project.");
  }

  const { upserted: collectionsUpserted, pruned: collectionsPruned } =
    await syncZoteroCollections(projectRoot, collectionKey);

  const items = await listCollectionTreeItemRecords(collectionKey);
  const bibliographies = await resolveItemBibliographies(items.map((item) => item.key));

  const paperIds: string[] = [];
  for (const item of items) {
    const bib = bibliographies[item.key];
    const bibkey = bib?.citekey ?? item.key;
    const rawBibtex = bib?.rawBibtex ?? null;
    const paper = upsertZoteroPaperRow(projectRoot, {
      zoteroKey: item.key,
      zoteroVersion: item.version,
      // PDF attachment key is resolved lazily when opening/downloading PDFs.
      zoteroAttachKey: null,
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
    });
    paperIds.push(paper.id);
  }

  const localCollectionId = await ensureBoundZoteroCollectionCached(
    projectRoot,
    collectionKey,
    binding.zoteroCollectionName,
  );
  replaceCollectionPaperLinks(projectRoot, localCollectionId, paperIds);

  const papersPruned = pruneOrphanZoteroPapers(projectRoot, items.map((item) => item.key));

  const db = openLibraryDb(projectRoot);
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('zotero_last_sync', ?)").run(
    String(Date.now()),
  );

  return {
    collectionsUpserted,
    papersUpserted: paperIds.length,
    collectionKey,
    collectionsPruned,
    papersPruned,
  };
}

export function getZoteroLastSync(projectRoot: string): number | null {
  const { dbPath } = getLibraryPaths(projectRoot);
  if (!fs.existsSync(dbPath)) return null;
  const db = openLibraryDb(projectRoot);
  const row = db.prepare("SELECT value FROM meta WHERE key = 'zotero_last_sync'").get() as
    | { value: string }
    | undefined;
  if (!row) return null;
  const n = Number.parseInt(row.value, 10);
  return Number.isFinite(n) ? n : null;
}

function getCollectionRow(projectRoot: string, collectionId: string): CollectionRow {
  const db = openLibraryDb(projectRoot);
  const row = db.prepare("SELECT * FROM collections WHERE id = ?").get(collectionId) as
    | CollectionRow
    | undefined;
  if (!row) throw new Error("Collection not found");
  return row;
}

function collectionZoteroKey(row: CollectionRow): string {
  if (row.zotero_key) return row.zotero_key;
  throw new Error("Collection is not linked to Zotero. Sync from Zotero first.");
}

function paperIdsWithZoteroKey(projectRoot: string, paperIds: string[]): string[] {
  const db = openLibraryDb(projectRoot);
  const linked: string[] = [];
  for (const paperId of paperIds) {
    const row = db
      .prepare("SELECT zotero_key FROM zotero_mirror WHERE paper_id = ?")
      .get(paperId) as { zotero_key: string } | undefined;
    if (row?.zotero_key) linked.push(paperId);
  }
  return linked;
}

function paperZoteroKeys(projectRoot: string, paperIds: string[]): string[] {
  const db = openLibraryDb(projectRoot);
  const keys: string[] = [];
  for (const paperId of paperIds) {
    const row = db
      .prepare("SELECT zotero_key FROM zotero_mirror WHERE paper_id = ?")
      .get(paperId) as { zotero_key: string } | undefined;
    if (row?.zotero_key) keys.push(row.zotero_key);
  }
  return keys;
}

export async function createCollectionInZotero(
  projectRoot: string,
  name: string,
  parentId?: string | null,
): Promise<CollectionRow> {
  const parentKey = parentId ? collectionZoteroKey(getCollectionRow(projectRoot, parentId)) : null;
  const col = await createZoteroCollection(name, parentKey);

  const db = openLibraryDb(projectRoot);
  let parentLocalId: string | null = null;
  if (parentId) {
    parentLocalId = getCollectionRow(projectRoot, parentId).id;
  }
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS n FROM collections WHERE parent_id IS ?")
    .get(parentLocalId) as { n: number };

  return upsertZoteroCollectionRow(projectRoot, {
    key: col.key,
    name: col.name,
    parentKey: col.parentKey,
    version: col.version,
    sortOrder: maxOrder.n + 1,
  });
}

export async function renameCollectionInZotero(
  projectRoot: string,
  collectionId: string,
  name: string,
): Promise<CollectionRow> {
  const row = getCollectionRow(projectRoot, collectionId);
  await renameZoteroCollection(collectionZoteroKey(row), name);
  return updateCollection(projectRoot, collectionId, { name });
}

export async function deleteCollectionInZotero(
  projectRoot: string,
  collectionId: string,
): Promise<void> {
  const row = getCollectionRow(projectRoot, collectionId);
  await deleteZoteroCollection(collectionZoteroKey(row));
  deleteCollection(projectRoot, collectionId);
}

export async function addPapersToZoteroCollection(
  projectRoot: string,
  collectionId: string,
  paperIds: string[],
): Promise<{ added: number; skipped: number }> {
  const collectionKey = collectionZoteroKey(getCollectionRow(projectRoot, collectionId));
  const linkableIds = paperIdsWithZoteroKey(projectRoot, paperIds);
  const itemKeys = paperZoteroKeys(projectRoot, linkableIds);
  if (itemKeys.length > 0) {
    const writer = await getZoteroWriter();
    await writer.addItems(collectionKey, itemKeys);
  }
  const added = addPapersToCollection(projectRoot, collectionId, linkableIds);
  return { added, skipped: paperIds.length - linkableIds.length };
}

export async function removePapersFromZoteroCollection(
  projectRoot: string,
  collectionId: string,
  paperIds: string[],
): Promise<{ removed: number }> {
  const collectionKey = collectionZoteroKey(getCollectionRow(projectRoot, collectionId));
  const linkableIds = paperIdsWithZoteroKey(projectRoot, paperIds);
  let removed = 0;
  for (const paperId of linkableIds) {
    const db = openLibraryDb(projectRoot);
    const mirror = db
      .prepare("SELECT zotero_key FROM zotero_mirror WHERE paper_id = ?")
      .get(paperId) as { zotero_key: string } | undefined;
    if (!mirror?.zotero_key) continue;
    await removeItemFromZoteroCollection(collectionKey, mirror.zotero_key);
    removed += removePapersFromCollection(projectRoot, collectionId, [paperId]);
  }
  return { removed };
}

export async function exportZoteroBibliography(
  projectRoot: string,
  paperIds?: string[],
): Promise<string> {
  const db = openLibraryDb(projectRoot);
  let rows: Array<{ zotero_key: string }>;
  if (paperIds?.length) {
    const placeholders = paperIds.map(() => "?").join(",");
    rows = db
      .prepare(`SELECT zotero_key FROM zotero_mirror WHERE paper_id IN (${placeholders})`)
      .all(...paperIds) as Array<{ zotero_key: string }>;
  } else {
    rows = db
      .prepare("SELECT zotero_key FROM zotero_mirror")
      .all() as Array<{ zotero_key: string }>;
  }

  const itemKeys = rows.map((r) => r.zotero_key).filter(Boolean);
  if (itemKeys.length === 0) {
    throw new Error("No Zotero-linked papers to export.");
  }

  const useBbt = await probeBetterBibTeX();
  return exportZoteroItemBibTeX(itemKeys, useBbt ? "better-bibtex" : "bibtex");
}

export async function writeZoteroBibliographyToProject(
  projectRoot: string,
  paperIds?: string[],
): Promise<{ bibPath: string; entryCount: number }> {
  const content = await exportZoteroBibliography(projectRoot, paperIds);
  const bibPath = findProjectBibPath(projectRoot);
  fs.mkdirSync(path.dirname(bibPath), { recursive: true });
  fs.writeFileSync(bibPath, content.endsWith("\n") ? content : `${content}\n`, "utf-8");
  const entryCount = (content.match(/^@\w+\{/gm) ?? []).length;
  return { bibPath, entryCount };
}
