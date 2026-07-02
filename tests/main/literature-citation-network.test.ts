import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  net: {
    fetch: (url: string, init?: RequestInit) => global.fetch(url, init),
  },
}));

import {
  closeLibraryDb,
  createPaper,
  updatePaper,
} from "../../src/main/services/literature-service";
import {
  PAPER_CITATION_PAGE_SIZE,
  formatCitationFetchError,
  describePaperCitationIdentifier,
} from "../../src/shared/paper-citation-network";
import {
  __testing,
  getPaperCitationNetwork,
  getPaperCitationNetworkPage,
} from "../../src/main/services/literature-citation-network";
import { __s2Testing } from "../../src/main/services/literature-citation-s2";

const { mapOpenAlexWorkToCitationEntry, extractOpenAlexWorkId } = __testing;
const { mapS2PaperToCitationEntry } = __s2Testing;

function tempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "prism-lit-cites-"));
}

describe("paper-citation-network helpers", () => {
  it("formatCitationFetchError explains network failures", () => {
    expect(formatCitationFetchError("fetch failed")).toMatch(/无法连接文献图谱 API/);
    expect(formatCitationFetchError("Other error")).toBe("Other error");
  });

  it("describePaperCitationIdentifier prefers DOI", () => {
    expect(describePaperCitationIdentifier({ doi: "10.1234/x", arxiv_id: "2301.1" })).toBe(
      "DOI 10.1234/x",
    );
  });

  it("mapS2PaperToCitationEntry maps nested paper", () => {
    const entry = mapS2PaperToCitationEntry({
      paperId: "s2-abc",
      title: "S2 Paper",
      year: 2021,
      citationCount: 12,
      externalIds: { DOI: "10.5555/s2.test" },
      authors: [{ name: "Bob" }],
    });
    expect(entry?.openAlexId).toBe("s2-abc");
    expect(entry?.doi).toBe("10.5555/s2.test");
  });
});

describe("literature-citation-network", () => {
  const roots: string[] = [];
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const root of roots) {
      closeLibraryDb(root);
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("mapOpenAlexWorkToCitationEntry normalizes doi and arxiv", () => {
    const entry = mapOpenAlexWorkToCitationEntry({
      id: "https://openalex.org/W123",
      title: "Test Paper",
      publication_year: 2024,
      doi: "https://doi.org/10.1234/example",
      ids: { arxiv: "2301.00001" },
      cited_by_count: 42,
      authorships: [{ author: { display_name: "Ada Lovelace" } }],
      primary_location: { source: { display_name: "Nature" } },
    });
    expect(entry).toMatchObject({
      openAlexId: "W123",
      title: "Test Paper",
      year: 2024,
      doi: "10.1234/example",
      arxivId: "2301.00001",
      citedByCount: 42,
      venue: "Nature",
    });
    expect(entry?.authors).toContain("Ada Lovelace");
  });

  it("extractOpenAlexWorkId strips URL prefix", () => {
    expect(extractOpenAlexWorkId("https://openalex.org/W999")).toBe("W999");
    expect(extractOpenAlexWorkId("W999")).toBe("W999");
  });

  it("returns error when paper has no DOI or arXiv", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, { title: "No ids" });

    const result = await getPaperCitationNetwork(projectRoot, paper.id);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/DOI or arXiv/i);
  });

  it("loads references and cited-by first page via OpenAlex", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "Seed",
      doi: "10.5555/seed.2024",
    });

    const work = {
      id: "https://openalex.org/WSEED",
      referenced_works_count: 2,
      cited_by_count: 100,
      referenced_works: ["https://openalex.org/WREF1", "https://openalex.org/WREF2"],
    };

    const ref1 = {
      id: "https://openalex.org/WREF1",
      title: "Reference One",
      publication_year: 2020,
      doi: "https://doi.org/10.5555/ref1",
    };
    const ref2 = {
      id: "https://openalex.org/WREF2",
      title: "Reference Two",
      publication_year: 2019,
    };

    const citing = {
      id: "https://openalex.org/WCITE1",
      title: "Citing Paper",
      publication_year: 2023,
      cited_by_count: 5000,
      doi: "https://doi.org/10.5555/cite1",
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("10.5555/seed.2024") || url.includes("10.5555%2Fseed.2024")) {
        return new Response(JSON.stringify(work), { status: 200 });
      }
      if (url.includes("filter=openalex:") && url.includes("WREF1")) {
        return new Response(JSON.stringify({ results: [ref1, ref2] }), { status: 200 });
      }
      if (url.includes("cites:WSEED") || url.includes("cites%3AWSEED")) {
        return new Response(
          JSON.stringify({
            results: [citing],
            meta: { next_cursor: "cursor-page-2", count: 100 },
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await getPaperCitationNetwork(projectRoot, paper.id);
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toBe("openalex");
    expect(result.openAlexWorkId).toBe("WSEED");
    expect(result.references?.totalCount).toBe(2);
    expect(result.references?.items.map((i) => i.title)).toEqual([
      "Reference One",
      "Reference Two",
    ]);
    expect(result.citedBy?.totalCount).toBe(100);
    expect(result.citedBy?.items[0]?.title).toBe("Citing Paper");
    expect(result.citedBy?.hasMore).toBe(true);
  });

  it("loads citation network for arXiv-only papers via DataCite DOI", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "ArXiv seed",
      arxiv_id: "2509.24527",
    });

    const work = {
      id: "https://openalex.org/WARXIV",
      title: "Training Agents Inside of Scalable World Models",
      referenced_works_count: 0,
      cited_by_count: 0,
      referenced_works: [],
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("10.48550") && url.includes("2509.24527")) {
        return new Response(JSON.stringify(work), { status: 200 });
      }
      if (url.includes("cites") && url.includes("WARXIV")) {
        return new Response(JSON.stringify({ results: [], meta: {} }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await getPaperCitationNetwork(projectRoot, paper.id);
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toBe("openalex");
    expect(result.references?.totalCount).toBe(0);
    expect(result.citedBy?.totalCount).toBe(0);
  });

  it("falls back to Semantic Scholar when OpenAlex network fails", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "Fallback",
      doi: "10.5555/fallback.2024",
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("openalex.org")) {
        throw new TypeError("fetch failed");
      }
      if (url.includes("semanticscholar.org/graph/v1/paper/DOI") && !url.includes("/references") && !url.includes("/citations")) {
        return new Response(
          JSON.stringify({
            paperId: "s2-fallback-id",
            referenceCount: 1,
            citationCount: 2,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/references")) {
        return new Response(
          JSON.stringify({
            offset: 0,
            next: 1,
            data: [{ citedPaper: { paperId: "s2-ref", title: "S2 Reference", year: 2018 } }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/citations")) {
        return new Response(
          JSON.stringify({
            offset: 0,
            next: 1,
            data: [{ citingPaper: { paperId: "s2-cite", title: "S2 Citing", citationCount: 99 } }],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await getPaperCitationNetwork(projectRoot, paper.id);
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toBe("semantic-scholar");
    expect(result.sourceNote).toMatch(/Semantic Scholar/);
    expect(result.references?.items[0]?.title).toBe("S2 Reference");
    expect(result.citedBy?.items[0]?.title).toBe("S2 Citing");
  });

  it("paginates references using numeric cursor offset", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "Paginated",
      doi: "10.5555/page.2024",
    });

    const referencedIds = Array.from({ length: 30 }, (_, i) => `https://openalex.org/WREF${i}`);
    const work = {
      id: "https://openalex.org/WPAGE",
      referenced_works_count: 30,
      cited_by_count: 0,
      referenced_works: referencedIds,
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("10.5555/page.2024") || url.includes("10.5555%2Fpage.2024")) {
        return new Response(JSON.stringify(work), { status: 200 });
      }
      if (url.includes("filter=openalex:")) {
        const match = url.match(/filter=openalex:([^&]+)/);
        const ids = decodeURIComponent(match?.[1] ?? "").split("|");
        const results = ids.map((id, idx) => ({
          id: `https://openalex.org/${id}`,
          title: `Ref ${id}`,
          publication_year: 2000 + idx,
        }));
        return new Response(JSON.stringify({ results }), { status: 200 });
      }
      if (url.includes("cites:WPAGE") || url.includes("cites%3AWPAGE")) {
        return new Response(JSON.stringify({ results: [], meta: {} }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const first = await getPaperCitationNetwork(projectRoot, paper.id);
    expect(first.references?.items).toHaveLength(25);
    expect(first.references?.hasMore).toBe(true);
    expect(first.references?.nextCursor).toBe("25");

    const second = await getPaperCitationNetworkPage(
      projectRoot,
      paper.id,
      "references",
      first.references!.nextCursor!,
    );
    expect(second.references?.items).toHaveLength(5);
    expect(second.references?.hasMore).toBe(false);
  });

  it("uses cache on second request without refresh", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "Cached",
      doi: "10.5555/cache.2024",
    });
    updatePaper(projectRoot, paper.id, { doi: "10.5555/cache.2024" });

    let lookupCalls = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("10.5555/cache.2024") || url.includes("10.5555%2Fcache.2024")) {
        lookupCalls += 1;
        return new Response(
          JSON.stringify({
            id: "https://openalex.org/WCACHE",
            referenced_works_count: 0,
            cited_by_count: 0,
            referenced_works: [],
          }),
          { status: 200 },
        );
      }
      if (url.includes("cites:WCACHE") || url.includes("cites%3AWCACHE")) {
        return new Response(JSON.stringify({ results: [], meta: {} }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as typeof fetch;

    await getPaperCitationNetwork(projectRoot, paper.id);
    await getPaperCitationNetwork(projectRoot, paper.id);
    expect(lookupCalls).toBe(1);

    await getPaperCitationNetwork(projectRoot, paper.id, { refresh: true });
    expect(lookupCalls).toBe(2);
  });
});
