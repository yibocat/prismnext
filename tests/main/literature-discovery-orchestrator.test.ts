import { describe, expect, it } from "vitest";
import { runLiteratureDiscovery } from "../../src/main/services/literature-discovery/orchestrator";
import type { DiscoveryAdapter } from "../../src/main/services/literature-discovery/types";
import type { DiscoveryHit } from "../../src/shared/literature-discovery";

function adapter(
  id: DiscoveryAdapter["id"],
  impl: DiscoveryAdapter["search"],
): DiscoveryAdapter {
  return { id, search: impl };
}

describe("runLiteratureDiscovery", () => {
  it("merges hits from parallel sources", async () => {
    const a = adapter("arxiv", async () => [
      {
        id: "a1",
        title: "A",
        authors: [],
        source: "arxiv",
      } satisfies DiscoveryHit,
    ]);
    const b = adapter("crossref", async () => [
      {
        id: "c1",
        title: "C",
        authors: [],
        source: "crossref",
      },
    ]);
    const result = await runLiteratureDiscovery(
      { query: "ml", sources: ["arxiv", "crossref"] },
      [a, b],
      { now: () => 0, cacheTtlMs: 0 },
    );
    expect(result.hits.map((h) => h.id).sort()).toEqual(["a1", "c1"]);
    expect(result.sourcesFailed).toEqual([]);
  });

  it("records per-source failure without failing the call", async () => {
    const ok = adapter("arxiv", async () => [
      { id: "a1", title: "A", authors: [], source: "arxiv" },
    ]);
    const bad = adapter("pubmed", async () => {
      throw new Error("rate limited");
    });
    const result = await runLiteratureDiscovery({ query: "x", sources: ["arxiv", "pubmed"] }, [
      ok,
      bad,
    ], { cacheTtlMs: 0 });
    expect(result.hits).toHaveLength(1);
    expect(result.sourcesFailed).toEqual([
      { source: "pubmed", error: "rate limited" },
    ]);
  });

  it("respects wall-clock budget and returns partial results", async () => {
    const slow = adapter("openalex", (_query, opts) =>
      new Promise<DiscoveryHit[]>((resolve, reject) => {
        const timer = setTimeout(
          () => resolve([{ id: "late", title: "L", authors: [], source: "openalex" }]),
          500,
        );
        opts.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("timed out"));
        }, { once: true });
      }),
    );
    const fast = adapter("arxiv", async () => [
      { id: "fast", title: "F", authors: [], source: "arxiv" },
    ]);
    const result = await runLiteratureDiscovery(
      { query: "q", sources: ["arxiv", "openalex"] },
      [slow, fast],
      { wallClockMs: 80, perSourceTimeoutMs: 40, cacheTtlMs: 0 },
    );
    expect(result.hits.some((h) => h.id === "fast")).toBe(true);
    expect(result.sourcesFailed.some((f) => f.source === "openalex")).toBe(true);
  }, 10_000);
});
