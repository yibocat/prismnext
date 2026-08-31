import { afterEach, describe, expect, it, vi } from "vitest";

const listCollectionTreeItemRecords = vi.fn();
const resolveItemBibliographies = vi.fn();
const getItemPdfAttachmentKey = vi.fn();
const fetchItemPdfBytes = vi.fn();
const fetchZoteroCollection = vi.fn();

vi.mock("../../src/main/literature/zotero/zotero-client", () => ({
  listCollectionTreeItemRecords: (...args: unknown[]) => listCollectionTreeItemRecords(...args),
  resolveItemBibliographies: (...args: unknown[]) => resolveItemBibliographies(...args),
  getItemPdfAttachmentKey: (...args: unknown[]) => getItemPdfAttachmentKey(...args),
  fetchItemPdfBytes: (...args: unknown[]) => fetchItemPdfBytes(...args),
  fetchZoteroCollection: (...args: unknown[]) => fetchZoteroCollection(...args),
}));

import {
  cancelRemoteZoteroPull,
  pullRemoteZoteroCollection,
  resetRemoteZoteroPullForTests,
} from "../../src/main/remote/zotero-bridge";

const pdfBytes = Buffer.from("%PDF-1.4 tiny", "utf8");

afterEach(() => {
  resetRemoteZoteroPullForTests();
  vi.clearAllMocks();
});

describe("remote Zotero desktop proxy (RW-3.3)", () => {
  it("pulls items on the laptop and sends papers + PDF bytes to Host", async () => {
    listCollectionTreeItemRecords.mockResolvedValue([
      {
        key: "ITEM1",
        version: 3,
        itemType: "journalArticle",
        title: "Attention",
        creators: [],
        authorsJson: "Vaswani",
        editorsJson: null,
        year: 2017,
        abstract: null,
        doi: "10.1/att",
        arxivId: null,
        venue: "NeurIPS",
      },
      {
        key: "ITEM2",
        version: 1,
        itemType: "journalArticle",
        title: "BERT",
        creators: [],
        authorsJson: "Devlin",
        editorsJson: null,
        year: 2019,
        abstract: null,
        doi: null,
        arxivId: null,
        venue: "NAACL",
      },
    ]);
    resolveItemBibliographies.mockResolvedValue({
      ITEM1: { citekey: "vaswani2017", rawBibtex: "@article{vaswani2017,}" },
      ITEM2: { citekey: "devlin2019", rawBibtex: "@article{devlin2019,}" },
    });
    getItemPdfAttachmentKey.mockResolvedValue("ATT1");
    fetchItemPdfBytes.mockResolvedValue(new Uint8Array(pdfBytes));

    const invokes: Array<{ method: string; params: Record<string, unknown> }> = [];
    const progress: Array<{ current: number; total: number; title: string }> = [];

    const result = await pullRemoteZoteroCollection({
      projectRoot: "remote://lab/home/ubuntu/paper",
      invoke: async (method, params) => {
        invokes.push({ method, params: params as Record<string, unknown> });
        if (method === "literature:getZoteroBinding") {
          return { zoteroCollectionId: "COLL1", zoteroCollectionName: "ML" };
        }
        const papers = (params as { papers?: unknown[] }).papers ?? [];
        return {
          collectionsUpserted: 1,
          papersUpserted: papers.length,
          collectionKey: "COLL1",
          collectionsPruned: 0,
          papersPruned: 0,
        };
      },
      onProgress: (item) => progress.push(item),
    });

    expect(listCollectionTreeItemRecords).toHaveBeenCalledWith("COLL1");
    expect(invokes[0]).toMatchObject({
      method: "literature:getZoteroBinding",
      params: { projectRoot: "/home/ubuntu/paper" },
    });
    const paperFrames = invokes.filter((row) => {
      const papers = row.params.papers as unknown[] | undefined;
      return row.method === "literature:importBatch" && Array.isArray(papers) && papers.length > 0;
    });
    expect(paperFrames).toHaveLength(2);
    expect(paperFrames[0]?.params.papers).toEqual([
      expect.objectContaining({
        zoteroKey: "ITEM1",
        title: "Attention",
        bibkey: "vaswani2017",
        pdfBase64: pdfBytes.toString("base64"),
      }),
    ]);
    expect(paperFrames[1]?.params.papers).toEqual([
      expect.objectContaining({
        zoteroKey: "ITEM2",
        title: "BERT",
        pdfBase64: pdfBytes.toString("base64"),
      }),
    ]);
    expect(invokes.at(-1)).toMatchObject({
      method: "literature:importBatch",
      params: {
        projectRoot: "/home/ubuntu/paper",
        collectionKey: "COLL1",
        finalize: true,
        zoteroKeys: ["ITEM1", "ITEM2"],
      },
    });
    expect(progress).toEqual([
      { current: 1, total: 2, title: "Attention" },
      { current: 2, total: 2, title: "BERT" },
    ]);
    expect(result.papersUpserted).toBe(2);
    expect(result.collectionKey).toBe("COLL1");
  });

  it("stops sending after remote:zoteroCancel", async () => {
    listCollectionTreeItemRecords.mockResolvedValue([
      {
        key: "A",
        version: 1,
        itemType: "article",
        title: "First",
        creators: [],
        authorsJson: null,
        editorsJson: null,
        year: 2024,
        abstract: null,
        doi: null,
        arxivId: null,
        venue: null,
      },
      {
        key: "B",
        version: 1,
        itemType: "article",
        title: "Second",
        creators: [],
        authorsJson: null,
        editorsJson: null,
        year: 2024,
        abstract: null,
        doi: null,
        arxivId: null,
        venue: null,
      },
    ]);
    resolveItemBibliographies.mockResolvedValue({
      A: { citekey: "a2024", rawBibtex: null },
      B: { citekey: "b2024", rawBibtex: null },
    });
    getItemPdfAttachmentKey.mockResolvedValue(null);

    let sent = 0;
    await expect(pullRemoteZoteroCollection({
      projectRoot: "remote://lab/home/ubuntu/paper",
      invoke: async (method) => {
        if (method === "literature:getZoteroBinding") {
          return { zoteroCollectionId: "COLL1" };
        }
        sent += 1;
        cancelRemoteZoteroPull();
        return { papersUpserted: 1, collectionsUpserted: 0, collectionKey: "COLL1", collectionsPruned: 0, papersPruned: 0 };
      },
    })).rejects.toThrow(/cancelled/i);
    expect(sent).toBe(1);
  });
});
