import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/main/literature/facade", () => ({
  getPaperByBibkey: vi.fn(),
}));

vi.mock("../../src/main/literature/extract/paper-extract-db", () => ({
  listPaperExtractStates: vi.fn(),
  getPaperExtractState: vi.fn(),
  readExtractMarkdown: vi.fn(),
}));

vi.mock("../../src/main/literature/extract/literature-extract-queue", () => ({
  enqueuePaperExtract: vi.fn(),
  notifyAgentExtractRequested: vi.fn(),
}));

import { getPaperByBibkey } from "../../src/main/literature/facade";
import {
  getPaperExtractState,
  listPaperExtractStates,
  readExtractMarkdown,
} from "../../src/main/literature/extract/paper-extract-db";
import { readPaperPdfContent } from "../../src/main/literature/extract/paper-extract-read";

const ROOT = "/proj";
const PAPER = {
  id: "paper-abc",
  bibkey: "smith2024",
  title: "Test",
};

describe("readPaperPdfContent figure paths", () => {
  beforeEach(() => {
    vi.mocked(getPaperByBibkey).mockReturnValue(PAPER as never);
    vi.mocked(listPaperExtractStates).mockReturnValue({
      [PAPER.id]: {
        mineru: { status: "ready", paperId: PAPER.id, source: "mineru" },
      },
    } as never);
    vi.mocked(getPaperExtractState).mockReturnValue({
      status: "ready",
      paperId: PAPER.id,
      source: "mineru",
      pages: 5,
    } as never);
  });

  it("rewrites MinerU image refs in returned markdown", async () => {
    vi.mocked(readExtractMarkdown).mockReturnValue(
      "# Results\n\n![Figure 2](images/fig-1.png)\n",
    );

    const result = await readPaperPdfContent(
      { projectRoot: ROOT, bibkey: PAPER.bibkey },
      true,
    );

    expect(result.markdown).toContain(
      "library/extract/paper-abc/images/fig-1.png",
    );
    expect(result.hasFigures).toBe(true);
    expect(result.figures?.[0]).toContain("library/extract/paper-abc/images/fig-1.png");
    expect(result.hint).toMatch(/embed/i);
  });
});
