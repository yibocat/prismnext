import { afterEach, describe, expect, it } from "vitest";
import {
  parseArxivEntryAuthorNames,
  parseArxivEntryDoi,
  parseArxivEntryTitle,
} from "../../src/shared/bibliographic-metadata/arxiv-xml";
import {
  resetCatalogFetchForTests,
  setCatalogFetch,
} from "../../src/shared/bibliographic-metadata/catalog-fetch";
import { arxivDiscoveryAdapter } from "../../src/main/services/literature-discovery/sources/arxiv";
import { crossrefDiscoveryAdapter } from "../../src/main/services/literature-discovery/sources/crossref";

afterEach(() => resetCatalogFetchForTests());

describe("arxiv-xml shared parser", () => {
  const entry = `
    <title>Cool Paper</title>
    <author><name>Ada Lovelace</name></author>
    <arxiv:doi>10.1234/foo</arxiv:doi>
  `;
  it("reads title, authors, and doi from one entry", () => {
    expect(parseArxivEntryTitle(entry)).toBe("Cool Paper");
    expect(parseArxivEntryAuthorNames(entry)).toEqual(["Ada Lovelace"]);
    expect(parseArxivEntryDoi(entry)).toBe("10.1234/foo");
  });
});

describe("arxivDiscoveryAdapter", () => {
  it("parses atom entries from search API", async () => {
    setCatalogFetch(async () =>
      new Response(
        `<?xml version="1.0"?>
         <feed>
           <entry>
             <id>http://arxiv.org/abs/2312.00726v1</id>
             <title>Cool Paper</title>
             <summary>Hello abstract</summary>
             <published>2023-12-01T00:00:00Z</published>
             <author><name>Ada Lovelace</name></author>
             <link title="pdf" href="https://arxiv.org/pdf/2312.00726" rel="related" type="application/pdf"/>
           </entry>
         </feed>`,
        { status: 200 },
      ),
    );
    const hits = await arxivDiscoveryAdapter.search("cool", {
      limit: 5,
      year: null,
      signal: new AbortController().signal,
    });
    expect(hits[0]?.arxivId).toBe("2312.00726");
    expect(hits[0]?.title).toContain("Cool Paper");
    expect(hits[0]?.pdfUrl).toContain("arxiv.org/pdf");
  });
});

describe("crossrefDiscoveryAdapter", () => {
  it("maps works search JSON", async () => {
    setCatalogFetch(async () =>
      new Response(
        JSON.stringify({
          message: {
            items: [
              {
                DOI: "10.1000/xyz",
                title: ["Crossref Title"],
                author: [{ given: "Grace", family: "Hopper" }],
                issued: { "date-parts": [[2021]] },
                abstract: "Abs",
                URL: "https://doi.org/10.1000/xyz",
                "is-referenced-by-count": 12,
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const hits = await crossrefDiscoveryAdapter.search("hopper", {
      limit: 5,
      year: null,
      signal: new AbortController().signal,
    });
    expect(hits[0]?.doi).toBe("10.1000/xyz");
    expect(hits[0]?.citationCount).toBe(12);
    expect(hits[0]?.authors[0]).toMatch(/Hopper/);
  });
});
