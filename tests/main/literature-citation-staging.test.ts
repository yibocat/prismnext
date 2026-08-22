import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => path.join(os.tmpdir(), "prism-lit-staging-userdata"),
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("../../src/main/literature/enrich", () => ({
  createPaperFromCatalog: vi.fn(),
}));

vi.mock("../../src/main/services/settings", () => ({
  getSettings: vi.fn(() => ({ literatureStrictIntensivePdf: true, mineruApiToken: "" })),
}));

vi.mock("../../src/main/literature/extract/paper-extract-read", () => ({
  readPaperPdfContent: vi.fn().mockResolvedValue({ markdown: "# Page 1\n\nHello" }),
}));

vi.mock("../../src/main/literature/catalog", () => ({
  resolveBibliographicMetadata: vi.fn(),
}));

import { createPaperFromCatalog } from "../../src/main/literature/enrich";
import { resolveBibliographicMetadata } from "../../src/main/literature/catalog";
import { readPaperPdfContent } from "../../src/main/literature/extract/paper-extract-read";
import type { BibliographicMetadata } from "../../src/shared/bibliographic-metadata";
import {
  setSessionIntensiveBibkeys,
  setSessionScratchLookup,
  _resetChatSessionRegistryForTests,
} from "../../src/main/session/chat-session-registry";
import { stageLiteratureCitation } from "../../src/main/literature/citation/literature-citation-staging";
import { createPaper, listPapers } from "../../src/main/literature/facade";
import { sessionCitationsDir } from "../../src/main/workbench/home";
import {
  literatureAddTool,
  literatureReadPdfTool,
  literatureReadTool,
  literatureSearchTool,
} from "../../src/main/agent/tools/literature";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

const roots: string[] = [];

function tempProject(): string {
  const dir = tempLiteratureProject();
  roots.push(dir);
  return dir;
}

function toolCtx(projectRoot: string, sessionId = "test-session"): ToolExecuteContext {
  return {
    runtimeSessionId: sessionId,
    tabId: sessionId,
    turnId: "turn-1",
    toolCallId: "tc-1",
    projectRoot,
    permissionMode: "ask",
  };
}

afterEach(() => {
  _resetChatSessionRegistryForTests();
  vi.mocked(createPaperFromCatalog).mockReset();
  vi.mocked(resolveBibliographicMetadata).mockReset();
  vi.mocked(readPaperPdfContent).mockReset();
  vi.mocked(readPaperPdfContent).mockResolvedValue({ markdown: "# Page 1\n\nHello" });
  for (const root of roots.splice(0)) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

describe("literature-citation-staging", () => {
  it("rejects invalid DOI without calling catalog", async () => {
    const projectRoot = tempProject();
    const result = await stageLiteratureCitation(projectRoot, "test-stage-invalid", {
      doi: "not-a-doi",
    });
    expect(result.staged).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/invalid|missing/i);
    expect(resolveBibliographicMetadata).not.toHaveBeenCalled();
  });

  it("returns verified citation with refId=1 and does not write to library", async () => {
    const projectRoot = tempProject();
    const meta: BibliographicMetadata = {
      title: "Staged Paper",
      authors: "Smith, J.",
      year: 2024,
      abstract: null,
      doi: "10.1038/test.2024.001",
      arxiv_id: null,
      venue: "Nature",
      type: "article-journal",
      source: "crossref",
      pdfUrl: null,
    };
    vi.mocked(resolveBibliographicMetadata).mockResolvedValue({ metadata: meta });

    const result = await stageLiteratureCitation(projectRoot, "test-stage-ok", {
      doi: "10.1038/test.2024.001",
    });
    expect(result.staged).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.refId).toBe(1);
    expect(result.citation?.title).toBe("Staged Paper");
    expect(result.citation?.doi).toBe("10.1038/test.2024.001");
    expect(result.alreadyInLibrary).toBe(false);
    expect(listPapers(projectRoot).length).toBe(0);
    expect(fs.existsSync(path.join(sessionCitationsDir("test-stage-ok"), "staging.json"))).toBe(true);
  });

  it("marks alreadyInLibrary when DOI matches existing library paper", async () => {
    const projectRoot = tempProject();
    const existing = createPaper(projectRoot, {
      title: "Existing Paper",
      doi: "10.1038/test.2024.001",
    });
    const meta: BibliographicMetadata = {
      title: "Existing Paper",
      authors: "Smith, J.",
      year: 2024,
      abstract: null,
      doi: "10.1038/test.2024.001",
      arxiv_id: null,
      venue: "Nature",
      type: "article-journal",
      source: "crossref",
      pdfUrl: null,
    };
    vi.mocked(resolveBibliographicMetadata).mockResolvedValue({ metadata: meta });

    const result = await stageLiteratureCitation(projectRoot, "test-stage-existing", {
      doi: "10.1038/test.2024.001",
    });
    expect(result.alreadyInLibrary).toBe(true);
    expect(result.libraryBibkey).toBe(existing.paper.bibkey);
    expect(result.citation?.libraryPaperId).toBe(existing.paper.id);
  });

  it("reuses refId when same DOI staged twice in a session", async () => {
    const projectRoot = tempProject();
    const meta: BibliographicMetadata = {
      title: "Reuse Paper",
      authors: "Doe, J.",
      year: 2023,
      abstract: null,
      doi: "10.1038/reuse.2023.001",
      arxiv_id: null,
      venue: "Science",
      type: "article-journal",
      source: "crossref",
      pdfUrl: null,
    };
    vi.mocked(resolveBibliographicMetadata).mockResolvedValue({ metadata: meta });

    const first = await stageLiteratureCitation(projectRoot, "test-stage-reuse", {
      doi: "10.1038/reuse.2023.001",
    });
    const second = await stageLiteratureCitation(projectRoot, "test-stage-reuse", {
      doi: "10.1038/reuse.2023.001",
    });
    expect(first.refId).toBe(1);
    expect(second.refId).toBe(1);
  });

  it("returns verified false when catalog lookup fails", async () => {
    const projectRoot = tempProject();
    vi.mocked(resolveBibliographicMetadata).mockRejectedValue(new Error("DOI not found in catalogs"));

    const result = await stageLiteratureCitation(projectRoot, "test-stage-miss", {
      doi: "10.9999/missing",
    });
    expect(result.staged).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(result.hint).toMatch(/websearch/i);
  });

  it("writes staging under conversationId when lookup maps the runtime id", async () => {
    const projectRoot = tempProject();
    const meta: BibliographicMetadata = {
      title: "Mapped Paper",
      authors: "Doe, J.",
      year: 2024,
      abstract: null,
      doi: "10.1038/mapped.2024.001",
      arxiv_id: null,
      venue: "Nature",
      type: "article-journal",
      source: "crossref",
      pdfUrl: null,
    };
    vi.mocked(resolveBibliographicMetadata).mockResolvedValue({ metadata: meta });
    setSessionScratchLookup({
      getSession(id) {
        if (id === "rt-1") return { conversationId: "conv-1", runtimeSessionId: "rt-1" };
        return null;
      },
      getByConversationId() {
        return null;
      },
    });

    const result = await stageLiteratureCitation(projectRoot, "sub-rt-1-1710000000000", {
      doi: "10.1038/mapped.2024.001",
    });
    expect(result.staged).toBe(true);
    expect(result.refId).toBe(1);
    expect(fs.existsSync(path.join(sessionCitationsDir("conv-1"), "staging.json"))).toBe(true);
    expect(fs.existsSync(path.join(sessionCitationsDir("rt-1"), "staging.json"))).toBe(false);
  });
});

describe("literature native tools (same functions the Pi host calls)", () => {
  it("reads paper by bibkey", async () => {
    const projectRoot = tempProject();
    const { paper } = createPaper(projectRoot, {
      bibkey: "test_read_key",
      title: "Bridge Test Paper",
      year: 2024,
      venue: "Test Journal",
      csl_json: JSON.stringify({ volume: "9", page: "1--10" }),
    });

    const result = await literatureReadTool.execute({ bibkey: paper.bibkey }, toolCtx(projectRoot)) as {
      paper?: { title?: string; publication_details?: { volume?: string } };
    };
    expect(result.paper?.title).toBe("Bridge Test Paper");
    expect(result.paper?.publication_details?.volume).toBe("9");
  });

  it("rejects invalid DOI without calling catalog", async () => {
    const projectRoot = tempProject();
    const result = await literatureAddTool.execute({ doi: "not-a-doi" }, toolCtx(projectRoot)) as {
      verified?: boolean;
      error?: string;
    };
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/doi|arxiv/i);
    expect(createPaperFromCatalog).not.toHaveBeenCalled();
  });

  it("adds paper via catalog when DOI is valid", async () => {
    const projectRoot = tempProject();
    vi.mocked(createPaperFromCatalog).mockResolvedValue({
      created: true,
      duplicateReason: null,
      pdfAttached: false,
      pdfAttachError: null,
      paper: {
        id: "p1",
        bibkey: "smith2024",
        title: "Verified Paper",
        authors: "Smith, J.",
        year: 2024,
        abstract: null,
        doi: "10.1234/example",
        arxiv_id: null,
        venue: "Test Journal",
        type: "article-journal",
        origin: "catalog",
        metadata_source: "crossref",
        pdf_path: null,
        zotero_item_key: null,
        csl_json: JSON.stringify({ volume: "1" }),
        created_at: "",
        updated_at: "",
      },
    });

    const result = await literatureAddTool.execute(
      { doi: "10.1234/example" },
      toolCtx(projectRoot),
    ) as { success?: boolean; verified?: boolean; paper?: { bibkey?: string; title?: string } };
    expect(createPaperFromCatalog).toHaveBeenCalledWith(projectRoot, {
      doi: "10.1234/example",
      arxivId: undefined,
    });
    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.paper?.bibkey).toBe("smith2024");
    expect(result.paper?.title).toBe("Verified Paper");
  });

  it("returns verified false when catalog lookup fails", async () => {
    const projectRoot = tempProject();
    vi.mocked(createPaperFromCatalog).mockRejectedValue(new Error("DOI not found in catalogs"));

    const result = await literatureAddTool.execute(
      { doi: "10.1234/missing" },
      toolCtx(projectRoot),
    ) as { verified?: boolean; error?: string };
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("read-pdf calls extract after the paper is on the intensive list", async () => {
    const projectRoot = tempProject();
    const { paper } = createPaper(projectRoot, {
      bibkey: "intensive_allowed_key",
      title: "Allowed Test",
    });
    const sessionId = "test-read-pdf-allowed";
    setSessionIntensiveBibkeys(sessionId, [paper.bibkey]);

    const result = await literatureReadPdfTool.execute(
      { bibkey: paper.bibkey },
      toolCtx(projectRoot, sessionId),
    ) as { markdown?: string };
    expect(readPaperPdfContent).toHaveBeenCalled();
    expect(result.markdown).toContain("Hello");
  });

  it("search lists all papers when query is empty", async () => {
    const projectRoot = tempProject();
    createPaper(projectRoot, { bibkey: "alpha2024", title: "Alpha Paper" });
    createPaper(projectRoot, { bibkey: "beta2024", title: "Beta Paper" });

    const result = await literatureSearchTool.execute({}, toolCtx(projectRoot)) as {
      count?: number;
      results?: Array<{ bibkey?: string }>;
    };
    expect(result.count).toBe(2);
    expect(result.results?.map((r) => r.bibkey).sort()).toEqual(["alpha2024", "beta2024"]);
  });

  it("search resolves worktree cwd to the paper project's library", async () => {
    const projectRoot = tempProject();
    createPaper(projectRoot, { bibkey: "main_lib_key", title: "Main Library Paper" });
    const worktreePath = path.join(projectRoot, ".workbench", "worktrees", "feature-a");
    fs.mkdirSync(worktreePath, { recursive: true });

    const result = await literatureSearchTool.execute({}, toolCtx(worktreePath)) as {
      count?: number;
      results?: Array<{ bibkey?: string }>;
    };
    expect(result.count).toBe(1);
    expect(result.results?.[0]?.bibkey).toBe("main_lib_key");
  });
});
