import { describe, it, expect, afterEach, vi } from "vitest";
import { downloadPdfBytes } from "../../src/main/lib/download-pdf";
import { StagedCitationAddCancelledError } from "../../src/main/lib/staged-citation-add-cancelled";

describe("downloadPdfBytes cancel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aborts an in-progress stream when signal is aborted", async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    let reads = 0;

    globalThis.fetch = vi.fn(async (_url, init) => {
      const stream = new ReadableStream<Uint8Array>({
        pull(streamController) {
          reads++;
          if (reads > 2) {
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
      downloadPdfBytes("https://example.com/paper.pdf", () => {}, controller.signal),
    ).rejects.toBeInstanceOf(StagedCitationAddCancelledError);
  });
});
