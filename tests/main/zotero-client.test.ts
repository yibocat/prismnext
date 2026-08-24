import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("../../src/main/app/settings", () => ({
  getSettings: vi.fn(() => ({ zoteroUserId: "12345", zoteroApiKey: "secret" })),
  updateSettings: vi.fn(),
}));

import {
  ZOTERO_LOCAL_BASE,
  ZOTERO_WEB_BASE,
  createZoteroCollection,
  probeLocalZotero,
  probeBetterBibTeX,
  probeWebZotero,
  getZoteroStatus,
  listZoteroCollections,
  resolveCitekeys,
  resolveItemBibliographies,
  fetchItemPdfBytes,
  listCollectionItemRecords,
  collectDescendantCollectionKeys,
  listCollectionTreeItemRecords,
  parseZoteroItemRecordForTests,
} from "../../src/main/literature/zotero/zotero-client";
import { buildZoteroPaperCslJson } from "../../src/main/literature/zotero/zotero-csl";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
});

describe("probeLocalZotero", () => {
  it("returns true when local API responds ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    expect(await probeLocalZotero(mockFetch as typeof fetch)).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      `${ZOTERO_LOCAL_BASE}/api/users/0/items?limit=1`,
      { method: "GET" },
    );
  });

  it("returns false on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));
    expect(await probeLocalZotero(mockFetch as typeof fetch)).toBe(false);
  });
});

describe("probeBetterBibTeX", () => {
  it("returns true when BBT probe succeeds", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    expect(await probeBetterBibTeX(mockFetch as typeof fetch)).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      `${ZOTERO_LOCAL_BASE}/better-bibtex/cayw?probe=true`,
      { method: "GET" },
    );
  });
});

describe("probeWebZotero", () => {
  it("returns false without credentials", async () => {
    expect(await probeWebZotero({}, mockFetch as typeof fetch)).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns true when web API responds ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    expect(
      await probeWebZotero({ userId: "12345", apiKey: "secret" }, mockFetch as typeof fetch),
    ).toBe(true);
  });
});

describe("listZoteroCollections", () => {
  it("parses collection list from local API", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true }) // probeLocal in listZoteroCollections
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            key: "ABC123",
            version: 2,
            data: { key: "ABC123", name: "Thesis refs", parentCollection: false, version: 2 },
          },
        ],
      });

    const collections = await listZoteroCollections(mockFetch as typeof fetch);
    expect(collections).toEqual([
      { key: "ABC123", name: "Thesis refs", parentKey: null, version: 2 },
    ]);
  });
});

describe("resolveCitekeys", () => {
  it("falls back to itemKey when BBT is not installed", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false }); // probeBBT
    const keys = await resolveCitekeys(["ITEM1", "ITEM2"], mockFetch as typeof fetch);
    expect(keys).toEqual({ ITEM1: "ITEM1", ITEM2: "ITEM2" });
  });

  it("extracts citekey from BBT export when available", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true }) // probeBBT
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: "@article{smith2024test, title={Test}, author={Smith}}",
        }),
      });

    const keys = await resolveCitekeys(["ITEM1"], mockFetch as typeof fetch);
    expect(keys.ITEM1).toBe("smith2024test");
  });
});

describe("resolveItemBibliographies", () => {
  it("returns raw BibTeX from BBT export", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true }) // probeBBT
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: "@article{smith2024test, title={Test}, author={Smith}}",
        }),
      });

    const bibs = await resolveItemBibliographies(["ITEM1"], mockFetch as typeof fetch);
    expect(bibs.ITEM1.citekey).toBe("smith2024test");
    expect(bibs.ITEM1.rawBibtex).toContain("smith2024test");
  });
});

describe("fetchItemPdfBytes", () => {
  it("returns inline PDF bytes when Zotero streams the file", async () => {
    const pdf = Buffer.from("%PDF-1.4 inline");
    mockFetch
      .mockResolvedValueOnce({ ok: true }) // probeLocal
      .mockResolvedValueOnce({ ok: false }) // metadata probe — no disk path
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => "17" },
        body: {
          getReader: () => ({
            read: async () => ({
              done: true,
              value: new Uint8Array(pdf),
            }),
          }),
        },
      });

    const bytes = await fetchItemPdfBytes("ATTACH1", mockFetch as typeof fetch);
    expect(Buffer.from(bytes!).toString()).toContain("%PDF");
  });

  it("reads linked PDFs from file:// redirect without undici follow", async () => {
    const pdfPath = path.join(os.tmpdir(), `prism-zotero-pdf-${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, Buffer.from("%PDF-1.4 linked"));

    mockFetch
      .mockResolvedValueOnce({ ok: true }) // probeLocal
      .mockResolvedValueOnce({ ok: false }) // metadata probe — no disk path
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "location" ? `file://${pdfPath}` : null,
        },
        arrayBuffer: async () => new ArrayBuffer(0),
      });

    const bytes = await fetchItemPdfBytes("ATTACH2", mockFetch as typeof fetch);
    expect(Buffer.from(bytes!).toString()).toContain("%PDF-1.4 linked");
    fs.unlinkSync(pdfPath);
  });

  it("downloads PDF bytes from Zotero Web API when desktop is offline", async () => {
    const pdf = Buffer.from("%PDF-1.4 web");
    mockFetch
      .mockResolvedValueOnce({ ok: false }) // probeLocal
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => String(pdf.length) },
        body: {
          getReader: () => ({
            read: async () => ({
              done: true,
              value: new Uint8Array(pdf),
            }),
          }),
        },
      });

    const bytes = await fetchItemPdfBytes("ATTACHWEB", mockFetch as typeof fetch);
    expect(Buffer.from(bytes!).toString()).toContain("%PDF-1.4 web");
    expect(mockFetch).toHaveBeenCalledWith(
      `${ZOTERO_WEB_BASE}/users/12345/items/ATTACHWEB/file`,
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("getZoteroStatus", () => {
  it("reports local mode when desktop is reachable", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true }) // probeLocal
      .mockResolvedValueOnce({ ok: true }) // probeBBT cayw
      .mockResolvedValueOnce({ ok: true }) // probeBbtDebugBridge
      .mockResolvedValueOnce({ ok: true }); // probeWeb

    const status = await getZoteroStatus(mockFetch as typeof fetch);
    expect(status.mode).toBe("local");
    expect(status.localReachable).toBe(true);
    expect(status.bbtInstalled).toBe(true);
    expect(status.bbtDebugBridge).toBe(true);
    expect(status.webReachable).toBe(true);
  });
});

describe("createZoteroCollection", () => {
  it("creates via BBT debug-bridge when available", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("/items?limit=1")) {
        return { ok: true, status: 200 };
      }
      if (url.includes("/debug-bridge/execute")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              key: "NEWCOL12",
              name: "Subfolder",
              parentKey: "ROOT1234",
              version: 3,
            }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const col = await createZoteroCollection("Subfolder", "ROOT1234", mockFetch as typeof fetch);
    expect(col.key).toBe("NEWCOL12");
    expect(col.name).toBe("Subfolder");
    expect(col.parentKey).toBe("ROOT1234");
    expect(mockFetch).toHaveBeenCalledWith(
      `${ZOTERO_LOCAL_BASE}/debug-bridge/execute`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("creates via Web API when debug-bridge is unavailable", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true }) // probeLocal
      .mockResolvedValueOnce({ ok: false }) // probeBbtDebugBridge
      .mockResolvedValueOnce({ ok: true }) // probeWeb
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          successful: {
            "0": { key: "WEBCOL12", version: 5, data: { key: "WEBCOL12", version: 5 } },
          },
        }),
      });

    const col = await createZoteroCollection("Web folder", null, mockFetch as typeof fetch);
    expect(col.key).toBe("WEBCOL12");
    expect(col.name).toBe("Web folder");
    expect(mockFetch).toHaveBeenCalledWith(
      `${ZOTERO_WEB_BASE}/users/12345/collections`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("listCollectionItemRecords", () => {
  function mockZoteroItem(key: string) {
    return {
      key,
      version: 1,
      data: { itemType: "journalArticle", title: `Paper ${key}`, version: 1 },
    };
  }

  it("fetches every page when a collection has more than 100 items", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => mockZoteroItem(`A${String(i).padStart(7, "0")}`));
    const page2 = Array.from({ length: 25 }, (_, i) => mockZoteroItem(`B${String(i).padStart(7, "0")}`));

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("/items?") && url.includes("start=0")) {
        return { ok: true, json: async () => page1 };
      }
      if (url.includes("/items?") && url.includes("start=100")) {
        return { ok: true, json: async () => page2 };
      }
      if (url.includes("/items?limit=1")) {
        return { ok: true };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const items = await listCollectionItemRecords("COLL1234", mockFetch as typeof fetch);
    expect(items).toHaveLength(125);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("start=0"),
      expect.objectContaining({ method: "GET" }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("start=100"),
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("collectDescendantCollectionKeys", () => {
  it("includes root and all nested subcollections", () => {
    const collections = [
      { key: "ROOT1234", name: "Thesis", parentKey: null, version: 1 },
      { key: "SUB1KEY1", name: "Chapter 1", parentKey: "ROOT1234", version: 1 },
      { key: "SUB2KEY1", name: "Chapter 2", parentKey: "ROOT1234", version: 1 },
      { key: "DEEPKEY1", name: "Section", parentKey: "SUB1KEY1", version: 1 },
      { key: "OTHER123", name: "Other", parentKey: null, version: 1 },
    ];
    expect(collectDescendantCollectionKeys("ROOT1234", collections)).toEqual([
      "ROOT1234",
      "SUB1KEY1",
      "SUB2KEY1",
      "DEEPKEY1",
    ]);
  });
});

describe("listCollectionTreeItemRecords", () => {
  function mockZoteroItem(key: string) {
    return {
      key,
      version: 1,
      data: { itemType: "journalArticle", title: `Paper ${key}`, version: 1 },
    };
  }

  it("merges items from nested subcollections", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("/collections") && !url.includes("/items")) {
        return {
          ok: true,
          json: async () => [
            {
              key: "ROOT1234",
              version: 1,
              data: { name: "Thesis", parentCollection: false, version: 1 },
            },
            {
              key: "SUB1KEY1",
              version: 1,
              data: { name: "Chapter 1", parentCollection: "ROOT1234", version: 1 },
            },
          ],
        };
      }
      if (url.includes("/collections/ROOT1234/items")) {
        return {
          ok: true,
          json: async () => [mockZoteroItem("ITEMROOT")],
        };
      }
      if (url.includes("/collections/SUB1KEY1/items")) {
        return {
          ok: true,
          json: async () => [mockZoteroItem("ITEMSUB1"), mockZoteroItem("ITEMROOT")],
        };
      }
      if (url.includes("/items?limit=1")) {
        return { ok: true };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const items = await listCollectionTreeItemRecords("ROOT1234", mockFetch as typeof fetch);
    expect(items.map((item) => item.key).sort()).toEqual(["ITEMROOT", "ITEMSUB1"]);
  });
});

describe("parseZoteroItemRecordForTests", () => {
  it("reads extended publication fields and editors", () => {
    const record = parseZoteroItemRecordForTests({
      key: "ITEM1234",
      version: 3,
      data: {
        itemType: "journalArticle",
        title: "Choquet Paper",
        date: "2024-03",
        DOI: "10.1109/TFUZZ.2024.3364253",
        publicationTitle: "IEEE Transactions on Fuzzy Systems",
        journalAbbreviation: "IEEE Trans. Fuzzy Syst.",
        volume: "32",
        issue: "4",
        pages: "1234-1245",
        publisher: "IEEE",
        url: "https://doi.org/10.1109/TFUZZ.2024.3364253",
        language: "en",
        series: "Advanced Topics",
        creators: [
          { creatorType: "author", lastName: "Qin", firstName: "Hongwu" },
          { creatorType: "editor", lastName: "Smith", firstName: "Jane" },
        ],
      },
    });

    expect(record.volume).toBe("32");
    expect(record.issue).toBe("4");
    expect(record.pages).toBe("1234-1245");
    expect(record.publisher).toBe("IEEE");
    expect(record.journalAbbreviation).toBe("IEEE Trans. Fuzzy Syst.");
    expect(record.editorsJson).toContain("Smith");
    expect(record.venue).toBe("IEEE Transactions on Fuzzy Systems");
  });
});

describe("buildZoteroPaperCslJson", () => {
  const baseItem = parseZoteroItemRecordForTests({
    key: "ITEM1234",
    version: 1,
    data: {
      itemType: "journalArticle",
      title: "Fallback Title",
      publicationTitle: "Journal",
      volume: "9",
      issue: "2",
      pages: "10-20",
      publisher: "Pub Co",
    },
  });

  it("prefers BBT raw BibTeX for csl_json", () => {
    const raw = `@article{smith2024,
  title={From BibTeX},
  journal={Journal},
  volume={99},
  number={1},
  pages={1--12},
  publisher={IEEE},
  year={2024}
}`;
    const cslJson = buildZoteroPaperCslJson(baseItem, { bibkey: "smith2024", rawBibtex: raw });
    expect(cslJson).toBeTruthy();
    const csl = JSON.parse(cslJson!) as Record<string, unknown>;
    expect(csl.id).toBe("smith2024");
    expect(csl.volume).toBe("99");
    expect(csl.page).toBe("1--12");
  });

  it("builds csl_json from Zotero item fields when BibTeX is missing", () => {
    const cslJson = buildZoteroPaperCslJson(baseItem, { bibkey: "fallback_key" });
    const csl = JSON.parse(cslJson!) as Record<string, unknown>;
    expect(csl.id).toBe("fallback_key");
    expect(csl.volume).toBe("9");
    expect(csl.issue).toBe("2");
    expect(csl.page).toBe("10--20");
    expect(csl.publisher).toBe("Pub Co");
  });
});
