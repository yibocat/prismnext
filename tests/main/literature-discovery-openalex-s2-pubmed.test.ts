import { afterEach, describe, expect, it } from "vitest";
import {
  resetCatalogFetchForTests,
  setCatalogFetch,
} from "../../src/main/literature/catalog/catalog-fetch";
import { openalexDiscoveryAdapter } from "../../src/main/literature/discovery/sources/openalex";
import { semanticScholarDiscoveryAdapter } from "../../src/main/literature/discovery/sources/semantic-scholar";
import { pubmedDiscoveryAdapter } from "../../src/main/literature/discovery/sources/pubmed";

afterEach(() => resetCatalogFetchForTests());

describe("openalexDiscoveryAdapter", () => {
  it("maps works search JSON", async () => {
    setCatalogFetch(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "https://openalex.org/W123",
              display_name: "OpenAlex Paper",
              publication_year: 2022,
              doi: "https://doi.org/10.1000/openalex",
              cited_by_count: 5,
              authorships: [{ author: { display_name: "Alan Turing" } }],
              primary_location: { landing_page_url: "https://example.com/paper" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const hits = await openalexDiscoveryAdapter.search("turing", {
      limit: 5,
      year: null,
      signal: new AbortController().signal,
    });
    expect(hits[0]?.doi).toBe("10.1000/openalex");
    expect(hits[0]?.citationCount).toBe(5);
    expect(hits[0]?.authors[0]).toMatch(/Turing/);
  });
});

describe("semanticScholarDiscoveryAdapter", () => {
  it("maps paper search JSON", async () => {
    setCatalogFetch(async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              paperId: "abc123",
              title: "S2 Paper",
              year: 2020,
              citationCount: 99,
              authors: [{ name: "Marie Curie" }],
              externalIds: { DOI: "10.1000/s2" },
              url: "https://semanticscholar.org/paper/abc123",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const hits = await semanticScholarDiscoveryAdapter.search("curie", {
      limit: 5,
      year: null,
      signal: new AbortController().signal,
    });
    expect(hits[0]?.doi).toBe("10.1000/s2");
    expect(hits[0]?.citationCount).toBe(99);
  });

  it("throws on 429", async () => {
    setCatalogFetch(async () => new Response("", { status: 429 }));
    await expect(
      semanticScholarDiscoveryAdapter.search("x", {
        limit: 5,
        year: null,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("rate limited");
  });
});

describe("pubmedDiscoveryAdapter", () => {
  it("esearch then esummary", async () => {
    let call = 0;
    setCatalogFetch(async (input) => {
      call += 1;
      const url = String(input);
      if (url.includes("esearch")) {
        return new Response(
          JSON.stringify({ esearchresult: { idlist: ["12345"] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          result: {
            uids: ["12345"],
            "12345": {
              uid: "12345",
              title: "PubMed Paper.",
              pubdate: "2021 Jan",
              authors: [{ name: "Jonas Salk" }],
              articleids: [{ idtype: "doi", value: "10.1000/pm" }],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const hits = await pubmedDiscoveryAdapter.search("vaccine", {
      limit: 5,
      year: null,
      signal: new AbortController().signal,
    });
    expect(call).toBe(2);
    expect(hits[0]?.pmid).toBe("12345");
    expect(hits[0]?.doi).toBe("10.1000/pm");
    expect(hits[0]?.title).toBe("PubMed Paper");
  });
});
