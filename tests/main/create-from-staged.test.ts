import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/main/services/settings", () => ({
  getSettings: vi.fn(() => ({
    literatureAutoExtractOnImport: false,
    literatureExtractEngineDefault: "pdfjs",
  })),
  updateSettings: vi.fn(),
}));
vi.mock("../../src/main/literature/extract/literature-extract-automation", () => ({
  onPaperPdfAttached: vi.fn(),
  onPaperPdfChanged: vi.fn(),
  maybeAutoEnqueueExtract: vi.fn(),
}));

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createPaperFromStagedCitation,
  type StagedAddProgressCallback,
} from "../../src/main/literature/enrich";
import { getPaper, listPapers } from "../../src/main/literature/facade";
import * as bibliographic from "../../src/main/literature/catalog";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

const roots: string[] = [];

function tempProject(): string {
  const dir = tempLiteratureProject();
  roots.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("createPaperFromStagedCitation", () => {
  let root: string;

  beforeEach(() => {
    root = tempProject();
  });

  it("writes library row from staged snapshot without full catalog chain", async () => {
    const resolveSpy = vi.spyOn(bibliographic, "resolveBibliographicMetadata");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      Response.json({}, { status: 404 }),
    ) as typeof fetch;

    const result = await createPaperFromStagedCitation(root, {
      stagedId: "staged-1",
      sessionId: "sess-1",
      title: "Attention Is All You Need",
      authors: '["Vaswani, A"]',
      year: 2017,
      venue: "NeurIPS",
      type: "inproceedings",
      doi: null,
      arxivId: "1706.03762",
      abstract: "Transformer architecture.",
      cslJson: null,
      catalogSource: "arxiv",
      catalogVerified: true,
    });

    expect(result.created).toBe(true);
    expect(result.paper.title).toBe("Attention Is All You Need");
    expect(listPapers(root)).toHaveLength(1);
    expect(resolveSpy).not.toHaveBeenCalled();

    globalThis.fetch = originalFetch;
  });

  it("emits writing → downloading-pdf → done progress phases", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      Response.json({}, { status: 404 }),
    ) as typeof fetch;

    const phases: string[] = [];
    const onProgress: StagedAddProgressCallback = (info) => {
      phases.push(info.phase);
    };

    await createPaperFromStagedCitation(
      root,
      {
        stagedId: "staged-2",
        title: "Test arXiv",
        authors: null,
        year: 2024,
        venue: null,
        type: "article",
        doi: null,
        arxivId: "2405.00133",
        abstract: null,
        cslJson: null,
        catalogSource: "arxiv",
        catalogVerified: true,
      },
      onProgress,
    );

    expect(phases[0]).toBe("downloading-pdf");
    expect(phases).toContain("writing");
    expect(phases[phases.length - 1]).toBe("done");

    globalThis.fetch = originalFetch;
  });

  it("uses fast catalog lookup for DOI-only when no arXiv PDF URL", async () => {
    const resolveSpy = vi
      .spyOn(bibliographic, "resolveBibliographicMetadata")
      .mockResolvedValue({
        metadata: {
          title: "OA Paper",
          doi: "10.1000/oa.test",
          pdfUrl: "https://example.com/paper.pdf",
          source: "openalex",
        },
        sourcesAttempted: ["openalex"],
      });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(Buffer.from("%PDF-1.4 test"), {
        status: 200,
        headers: { "Content-Type": "application/pdf", "Content-Length": "14" },
      }),
    ) as typeof fetch;

    const result = await createPaperFromStagedCitation(root, {
      stagedId: "staged-3",
      title: "OA Paper",
      authors: null,
      year: 2024,
      venue: "Journal",
      type: "article",
      doi: "10.1000/oa.test",
      arxivId: null,
      abstract: null,
      cslJson: null,
      catalogSource: "crossref",
      catalogVerified: true,
    });

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy).toHaveBeenCalledWith({ doi: "10.1000/oa.test" }, { fast: true });
    expect(result.pdfAttached).toBe(true);
    expect(getPaper(root, result.paper.id)?.pdf_path).toBeTruthy();

    globalThis.fetch = originalFetch;
  });

  it("deletes the library row when cancelled during PDF download", async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    let reads = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_url, init) => {
      const stream = new ReadableStream<Uint8Array>({
        pull(streamController) {
          reads++;
          if (reads > 1) {
            controller.abort();
            streamController.error(new DOMException("Aborted", "AbortError"));
            return;
          }
          streamController.enqueue(encoder.encode("%PDF-1.4\n"));
          if (init?.signal?.aborted) {
            streamController.error(new DOMException("Aborted", "AbortError"));
          }
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    }) as typeof fetch;

    await expect(
      createPaperFromStagedCitation(
        root,
        {
          stagedId: "staged-cancel",
          title: "Cancel Me",
          authors: null,
          year: 2024,
          venue: null,
          type: "article",
          doi: null,
          arxivId: "2405.00133",
          abstract: null,
          cslJson: null,
          catalogSource: "arxiv",
          catalogVerified: true,
        },
        undefined,
        { signal: controller.signal },
      ),
    ).rejects.toThrow("STAGED_CITATION_ADD_CANCELLED");

    expect(listPapers(root)).toHaveLength(0);
    globalThis.fetch = originalFetch;
  });
});
