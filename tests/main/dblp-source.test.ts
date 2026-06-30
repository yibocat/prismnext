import { describe, it, expect, vi, beforeEach } from "vitest";
import { dblpSource } from "../../src/shared/bibliographic-metadata/sources/dblp";

const DBLP_NEURIPS_HIT = {
  result: {
    hits: {
      hit: [
        {
          info: {
            title: "Attention Is All You Need.",
            authors: {
              author: [
                { text: "Ashish Vaswani" },
                { text: "Noam Shazeer" },
              ],
            },
            year: "2017",
            venue: "NeurIPS",
            type: "Conference and Workshop Papers",
            doi: "10.5555/3295222.3295349",
          },
        },
      ],
    },
  },
};

describe("dblp source", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves by DOI and maps conference paper fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => DBLP_NEURIPS_HIT,
      }),
    );

    const meta = await dblpSource.resolveByDoi!("10.5555/3295222.3295349");
    expect(meta).not.toBeNull();
    expect(meta!.title).toBe("Attention Is All You Need");
    expect(meta!.venue).toBe("NeurIPS");
    expect(meta!.year).toBe(2017);
    expect(meta!.source).toBe("dblp");
    expect(meta!.doi).toBe("10.5555/3295222.3295349");
    expect(meta!.authors).toContain("Vaswani");
  });

  it("resolves by title (fuzzy conference search)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => DBLP_NEURIPS_HIT,
      }),
    );

    const meta = await dblpSource.resolveByTitle!("Attention Is All You Need");
    expect(meta).not.toBeNull();
    expect(meta!.venue).toBe("NeurIPS");
  });

  it("returns null when no hits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: { hits: { hit: [] } } }),
      }),
    );

    const meta = await dblpSource.resolveByTitle!("nonexistent paper xxx");
    expect(meta).toBeNull();
  });

  it("handles single-author object (not array)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            hits: {
              hit: [
                {
                  info: {
                    title: "Solo Paper",
                    authors: { author: { text: "Jane Doe" } },
                    year: "2023",
                    venue: "ICML",
                  },
                },
              ],
            },
          },
        }),
      }),
    );

    const meta = await dblpSource.resolveByTitle!("Solo Paper");
    expect(meta).not.toBeNull();
    expect(meta!.authors).toContain("Doe");
  });
});
