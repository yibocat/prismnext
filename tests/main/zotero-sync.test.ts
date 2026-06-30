import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/main/services/zotero-client", () => ({
  listZoteroCollections: vi.fn(),
  listCollectionItemRecords: vi.fn(),
  listCollectionTreeItemRecords: vi.fn(),
  resolveItemBibliographies: vi.fn(),
  getItemPdfAttachmentKey: vi.fn(),
  fetchZoteroCollection: vi.fn(),
  createZoteroCollection: vi.fn(),
  renameZoteroCollection: vi.fn(),
  deleteZoteroCollection: vi.fn(),
  addItemsToZoteroCollection: vi.fn(),
  removeItemFromZoteroCollection: vi.fn(),
  resolveCollectionWriteBackend: vi
    .fn()
    .mockResolvedValue({ backend: "web", creds: { userId: "12345", apiKey: "secret" } }),
}));

import {
  addPapersToZoteroCollection,
  createCollectionInZotero,
  deleteCollectionInZotero,
  getZoteroLastSync,
  removePapersFromZoteroCollection,
  renameCollectionInZotero,
  syncBoundZoteroCollection,
  syncZoteroCollections,
} from "../../src/main/services/zotero-sync";
import {
  getZoteroMirrorByPaperId,
  listCollectionPaperIds,
  listCollections,
  listPapers,
  removePapersFromCollection,
} from "../../src/main/services/literature-service";
import { writeLiteratureProjectConfig } from "../../src/main/services/workspace-config";
import {
  addItemsToZoteroCollection,
  createZoteroCollection,
  deleteZoteroCollection,
  fetchZoteroCollection,
  getItemPdfAttachmentKey,
  listCollectionItemRecords,
  listCollectionTreeItemRecords,
  listZoteroCollections,
  removeItemFromZoteroCollection,
  renameZoteroCollection,
  resolveItemBibliographies,
} from "../../src/main/services/zotero-client";

function bibEntry(citekey: string, rawBibtex?: string) {
  return {
    citekey,
    rawBibtex: rawBibtex ?? `@article{${citekey}, title={Test}}`,
  };
}

function mockZoteroItem(overrides: Partial<import("../../src/main/services/zotero-client").ZoteroItemRecord> & {
  key: string;
}): import("../../src/main/services/zotero-client").ZoteroItemRecord {
  return {
    key: overrides.key,
    version: overrides.version ?? 1,
    itemType: overrides.itemType ?? "article",
    title: overrides.title ?? "Paper",
    creators: overrides.creators ?? [],
    authorsJson: overrides.authorsJson ?? null,
    editorsJson: overrides.editorsJson ?? null,
    year: overrides.year ?? 2024,
    abstract: overrides.abstract ?? null,
    doi: overrides.doi ?? null,
    arxivId: overrides.arxivId ?? null,
    venue: overrides.venue ?? null,
    volume: overrides.volume ?? null,
    issue: overrides.issue ?? null,
    pages: overrides.pages ?? null,
    publisher: overrides.publisher ?? null,
    url: overrides.url ?? null,
    language: overrides.language ?? null,
    series: overrides.series ?? null,
    bookTitle: overrides.bookTitle ?? null,
    proceedingsTitle: overrides.proceedingsTitle ?? null,
    journalAbbreviation: overrides.journalAbbreviation ?? null,
    isbn: overrides.isbn ?? null,
  };
}

function tempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "prism-zotero-sync-"));
}

describe("zotero-sync", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.clearAllMocks();
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("throws when no collection is bound", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    await expect(syncBoundZoteroCollection(projectRoot)).rejects.toThrow(
      /No Zotero collection bound/,
    );
  });

  it("syncs bound collection items into library db", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const prismDir = path.join(projectRoot, ".prismnext");
    writeLiteratureProjectConfig(prismDir, {
      zoteroCollectionId: "COLKEY1",
      zoteroCollectionName: "Thesis",
    });

    vi.mocked(listZoteroCollections).mockResolvedValue([
      { key: "COLKEY1", name: "Thesis", parentKey: null, version: 1 },
    ]);
    vi.mocked(listCollectionTreeItemRecords).mockResolvedValue([
      mockZoteroItem({
        key: "ITEM1",
        version: 5,
        title: "Paper One",
        authorsJson: JSON.stringify([{ family: "Smith" }]),
        year: 2024,
        doi: "10.1000/test",
        venue: "Journal",
        itemType: "journalArticle",
      }),
    ]);
    vi.mocked(resolveItemBibliographies).mockResolvedValue({ ITEM1: bibEntry("smith2024") });

    const result = await syncBoundZoteroCollection(projectRoot);

    expect(result.papersUpserted).toBe(1);
    expect(result.collectionKey).toBe("COLKEY1");
    expect(result.collectionsUpserted).toBe(1);

    const papers = listPapers(projectRoot);
    expect(papers).toHaveLength(1);
    expect(papers[0].title).toBe("Paper One");
    expect(papers[0].bibkey).toBe("smith2024");
    expect(papers[0].origin).toBe("zotero");

    // zotero_mirror association
    const mirror = getZoteroMirrorByPaperId(projectRoot, papers[0].id);
    expect(mirror).not.toBeNull();
    expect(mirror!.zotero_key).toBe("ITEM1");

    const ids = listCollectionPaperIds(projectRoot, "COLKEY1");
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe(papers[0].id);

    expect(getZoteroLastSync(projectRoot)).toBeTypeOf("number");
  });

  it("writes csl_json with extended fields from BBT BibTeX on sync", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    writeLiteratureProjectConfig(path.join(projectRoot, ".prismnext"), {
      zoteroCollectionId: "COLKEY1",
      zoteroCollectionName: "Thesis",
    });

    vi.mocked(listZoteroCollections).mockResolvedValue([
      { key: "COLKEY1", name: "Thesis", parentKey: null, version: 1 },
    ]);
    vi.mocked(listCollectionTreeItemRecords).mockResolvedValue([
      mockZoteroItem({
        key: "ITEM1",
        title: "Choquet Paper",
        venue: "IEEE Transactions on Fuzzy Systems",
        itemType: "journalArticle",
        year: 2024,
        volume: "32",
        issue: "4",
        pages: "1234-1245",
      }),
    ]);
    vi.mocked(resolveItemBibliographies).mockResolvedValue({
      ITEM1: bibEntry(
        "choquet2024",
        `@article{choquet2024,
  title={Choquet Paper},
  journal={IEEE Transactions on Fuzzy Systems},
  volume={32},
  number={4},
  pages={1234--1245},
  publisher={IEEE},
  year={2024}
}`,
      ),
    });

    await syncBoundZoteroCollection(projectRoot);

    const papers = listPapers(projectRoot);
    expect(papers[0].csl_json).toBeTruthy();
    const csl = JSON.parse(papers[0].csl_json!) as Record<string, unknown>;
    expect(csl.id).toBe("choquet2024");
    expect(csl.volume).toBe("32");
    expect(csl.issue).toBe("4");
    expect(csl.page).toBe("1234--1245");
    expect(csl.publisher).toBe("IEEE");
  });

  it("updates existing zotero papers on re-sync", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const prismDir = path.join(projectRoot, ".prismnext");
    writeLiteratureProjectConfig(prismDir, {
      zoteroCollectionId: "COLKEY1",
      zoteroCollectionName: "Thesis",
    });

    vi.mocked(listZoteroCollections).mockResolvedValue([
      { key: "COLKEY1", name: "Thesis", parentKey: null, version: 1 },
    ]);
    vi.mocked(listCollectionTreeItemRecords).mockResolvedValue([
      {
        key: "ITEM1",
        version: 5,
        title: "Paper One",
        authorsJson: null,
        year: 2024,
        abstract: null,
        doi: null,
        arxivId: null,
        venue: null,
        itemType: "article",
      },
    ]);
    vi.mocked(resolveItemBibliographies).mockResolvedValue({ ITEM1: bibEntry("smith2024") });
    vi.mocked(getItemPdfAttachmentKey).mockResolvedValue(null);

    await syncBoundZoteroCollection(projectRoot);

    vi.mocked(listCollectionTreeItemRecords).mockResolvedValue([
      {
        key: "ITEM1",
        version: 6,
        title: "Paper One (revised)",
        authorsJson: null,
        year: 2025,
        abstract: "Updated abstract",
        doi: null,
        arxivId: null,
        venue: "New venue",
        itemType: "article",
      },
    ]);

    await syncBoundZoteroCollection(projectRoot);

    const papers = listPapers(projectRoot);
    expect(papers).toHaveLength(1);
    expect(papers[0].title).toBe("Paper One (revised)");
    expect(papers[0].year).toBe(2025);
    expect(papers[0].venue).toBe("New venue");
    expect(papers[0].abstract).toBe("Updated abstract");
    // zotero_version is now in zotero_mirror, not on papers table
    const mirror = getZoteroMirrorByPaperId(projectRoot, papers[0].id);
    expect(mirror?.zotero_version).toBe(6);
  });

  it("syncZoteroCollections upserts only the bound collection row", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    vi.mocked(fetchZoteroCollection).mockResolvedValue({
      key: "A",
      name: "Root",
      parentKey: null,
      version: 1,
    });

    const { upserted: count } = await syncZoteroCollections(projectRoot, "A");
    expect(count).toBe(1);

    const collections = await import("../../src/main/services/literature-service").then((m) =>
      m.listCollections(projectRoot),
    );
    expect(collections.map((c) => c.id)).toEqual(["A"]);
    expect(collections[0]?.zotero_key).toBe("A");
  });

  it("syncZoteroCollections flattens nested Zotero collections to sidebar root", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    vi.mocked(fetchZoteroCollection).mockResolvedValue({
      key: "CHILD",
      name: "Nested collection",
      parentKey: "PARENT",
      version: 1,
    });

    await syncZoteroCollections(projectRoot, "CHILD");

    const collections = listCollections(projectRoot);
    expect(collections).toHaveLength(1);
    expect(collections[0]?.id).toBe("CHILD");
    expect(collections[0]?.parent_id).toBeNull();
  });

  it("detaches zotero papers removed from bound collection (preserves row)", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const prismDir = path.join(projectRoot, ".prismnext");
    writeLiteratureProjectConfig(prismDir, {
      zoteroCollectionId: "COLKEY1",
      zoteroCollectionName: "Thesis",
    });

    vi.mocked(listZoteroCollections).mockResolvedValue([
      { key: "COLKEY1", name: "Thesis", parentKey: null, version: 1 },
    ]);
    vi.mocked(listCollectionTreeItemRecords).mockResolvedValue([
      {
        key: "ITEM1",
        version: 1,
        title: "Keep",
        authorsJson: null,
        year: 2024,
        abstract: null,
        doi: null,
        arxivId: null,
        venue: null,
        itemType: "article",
      },
      {
        key: "ITEM2",
        version: 1,
        title: "Remove me",
        authorsJson: null,
        year: 2023,
        abstract: null,
        doi: null,
        arxivId: null,
        venue: null,
        itemType: "article",
      },
    ]);
    vi.mocked(resolveItemBibliographies).mockResolvedValue({
      ITEM1: bibEntry("keep"),
      ITEM2: bibEntry("remove"),
    });
    vi.mocked(getItemPdfAttachmentKey).mockResolvedValue(null);

    await syncBoundZoteroCollection(projectRoot);
    // Both papers should exist after first sync
    expect(listPapers(projectRoot)).toHaveLength(2);

    vi.mocked(listCollectionTreeItemRecords).mockResolvedValue([
      {
        key: "ITEM1",
        version: 2,
        title: "Keep",
        authorsJson: null,
        year: 2024,
        abstract: null,
        doi: null,
        arxivId: null,
        venue: null,
        itemType: "article",
      },
    ]);

    const result = await syncBoundZoteroCollection(projectRoot);
    expect(result.papersPruned).toBe(1);
    const papers = listPapers(projectRoot);
    // ITEM2 is deleted (not imported to local, removed from Zotero collection).
    const removed = papers.find((p) => p.title === "Remove me");
    expect(removed).toBeUndefined();
    // ITEM1 still mirrored.
    const kept = papers.find((p) => p.title === "Keep");
    expect(kept).toBeDefined();
    expect(getZoteroMirrorByPaperId(projectRoot, kept!.id)?.zotero_key).toBe("ITEM1");
  });

  it("keeps bound collection when missing from collection list sync", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const prismDir = path.join(projectRoot, ".prismnext");
    writeLiteratureProjectConfig(prismDir, {
      zoteroCollectionId: "BOUNDKEY",
      zoteroCollectionName: "Bound only",
    });

    vi.mocked(listZoteroCollections).mockResolvedValue([
      { key: "OTHERCOL", name: "Other", parentKey: null, version: 1 },
    ]);
    vi.mocked(fetchZoteroCollection).mockResolvedValue({
      key: "BOUNDKEY",
      name: "Bound only",
      parentKey: null,
      version: 2,
    });
    vi.mocked(listCollectionTreeItemRecords).mockResolvedValue([
      {
        key: "ITEM1",
        version: 1,
        title: "Paper",
        authorsJson: null,
        year: 2024,
        abstract: null,
        doi: null,
        arxivId: null,
        venue: null,
        itemType: "article",
      },
    ]);
    vi.mocked(resolveItemBibliographies).mockResolvedValue({ ITEM1: bibEntry("paper2024") });
    vi.mocked(getItemPdfAttachmentKey).mockResolvedValue(null);

    const result = await syncBoundZoteroCollection(projectRoot);
    expect(result.papersUpserted).toBe(1);
    expect(listCollectionPaperIds(projectRoot, "BOUNDKEY")).toHaveLength(1);
  });

  it("createCollectionInZotero writes to Zotero and upserts cache", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    vi.mocked(fetchZoteroCollection).mockResolvedValue({
      key: "ROOT",
      name: "Root",
      parentKey: null,
      version: 1,
    });
    await syncZoteroCollections(projectRoot, "ROOT");

    vi.mocked(createZoteroCollection).mockResolvedValue({
      key: "NEWCOL",
      name: "Subfolder",
      parentKey: "ROOT",
      version: 1,
    });

    const row = await createCollectionInZotero(projectRoot, "Subfolder", "ROOT");
    expect(createZoteroCollection).toHaveBeenCalledWith("Subfolder", "ROOT");
    expect(row.id).toBe("NEWCOL");
    expect(row.name).toBe("Subfolder");
    expect(row.zotero_key).toBe("NEWCOL");
    expect(row.parent_id).toBe("ROOT");

    const collections = listCollections(projectRoot);
    expect(collections.some((c) => c.id === "NEWCOL")).toBe(true);
  });

  it("renameCollectionInZotero updates Zotero and local cache", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    vi.mocked(fetchZoteroCollection).mockResolvedValue({
      key: "COL1",
      name: "Old name",
      parentKey: null,
      version: 1,
    });
    await syncZoteroCollections(projectRoot, "COL1");

    vi.mocked(renameZoteroCollection).mockResolvedValue(undefined);
    const updated = await renameCollectionInZotero(projectRoot, "COL1", "New name");
    expect(renameZoteroCollection).toHaveBeenCalledWith("COL1", "New name");
    expect(updated.name).toBe("New name");
  });

  it("deleteCollectionInZotero removes from Zotero and local cache", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    vi.mocked(fetchZoteroCollection).mockResolvedValue({
      key: "COL1",
      name: "Gone",
      parentKey: null,
      version: 1,
    });
    await syncZoteroCollections(projectRoot, "COL1");

    vi.mocked(deleteZoteroCollection).mockResolvedValue(undefined);
    await deleteCollectionInZotero(projectRoot, "COL1");
    expect(deleteZoteroCollection).toHaveBeenCalledWith("COL1");
    expect(listCollections(projectRoot).some((c) => c.id === "COL1")).toBe(false);
  });

  it("addPapersToZoteroCollection links papers in Zotero and cache", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const prismDir = path.join(projectRoot, ".prismnext");
    writeLiteratureProjectConfig(prismDir, {
      zoteroCollectionId: "COLKEY1",
      zoteroCollectionName: "Thesis",
    });

    vi.mocked(fetchZoteroCollection).mockResolvedValue({
      key: "COLKEY1",
      name: "Thesis",
      parentKey: null,
      version: 1,
    });
    vi.mocked(listCollectionTreeItemRecords).mockResolvedValue([
      {
        key: "ITEM1",
        version: 1,
        title: "Paper",
        authorsJson: null,
        year: 2024,
        abstract: null,
        doi: null,
        arxivId: null,
        venue: null,
        itemType: "article",
      },
    ]);
    vi.mocked(resolveItemBibliographies).mockResolvedValue({ ITEM1: bibEntry("paper2024") });
    vi.mocked(getItemPdfAttachmentKey).mockResolvedValue(null);
    await syncBoundZoteroCollection(projectRoot);

    const paper = listPapers(projectRoot)[0];
    removePapersFromCollection(projectRoot, "COLKEY1", [paper.id]);
    vi.mocked(addItemsToZoteroCollection).mockResolvedValue(undefined);

    const { added } = await addPapersToZoteroCollection(projectRoot, "COLKEY1", [paper.id]);
    expect(addItemsToZoteroCollection).toHaveBeenCalledWith("COLKEY1", ["ITEM1"], expect.any(Function));
    expect(added).toBe(1);
    expect(listCollectionPaperIds(projectRoot, "COLKEY1")).toContain(paper.id);
  });

  it("removePapersFromZoteroCollection unlinks in Zotero and cache", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const prismDir = path.join(projectRoot, ".prismnext");
    writeLiteratureProjectConfig(prismDir, {
      zoteroCollectionId: "COLKEY1",
      zoteroCollectionName: "Thesis",
    });

    vi.mocked(fetchZoteroCollection).mockResolvedValue({
      key: "COLKEY1",
      name: "Thesis",
      parentKey: null,
      version: 1,
    });
    vi.mocked(listCollectionTreeItemRecords).mockResolvedValue([
      {
        key: "ITEM1",
        version: 1,
        title: "Paper",
        authorsJson: null,
        year: 2024,
        abstract: null,
        doi: null,
        arxivId: null,
        venue: null,
        itemType: "article",
      },
    ]);
    vi.mocked(resolveItemBibliographies).mockResolvedValue({ ITEM1: bibEntry("paper2024") });
    vi.mocked(getItemPdfAttachmentKey).mockResolvedValue(null);
    await syncBoundZoteroCollection(projectRoot);

    const paper = listPapers(projectRoot)[0];
    vi.mocked(removeItemFromZoteroCollection).mockResolvedValue(undefined);

    const { removed } = await removePapersFromZoteroCollection(projectRoot, "COLKEY1", [
      paper.id,
    ]);
    expect(removeItemFromZoteroCollection).toHaveBeenCalledWith("COLKEY1", "ITEM1");
    expect(removed).toBe(1);
    expect(listCollectionPaperIds(projectRoot, "COLKEY1")).toHaveLength(0);
  });
});
