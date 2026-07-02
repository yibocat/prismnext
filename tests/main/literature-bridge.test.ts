import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setSessionProjectRoot, setSessionIntensiveBibkeys, _resetChatSessionRegistryForTests } from "../../src/main/services/chat-session-registry";
import { processLiteratureBridgeOnceForTests } from "../../src/main/services/literature-bridge";
import { createPaper } from "../../src/main/services/literature-service";

vi.mock("../../src/main/services/literature-enrich", () => ({
  createPaperFromCatalog: vi.fn(),
}));

vi.mock("../../src/main/services/settings", () => ({
  getSettings: vi.fn(() => ({ literatureStrictIntensivePdf: true, mineruApiToken: "" })),
}));

vi.mock("../../src/main/services/paper-extract-read", () => ({
  readPaperPdfContent: vi.fn().mockResolvedValue({ markdown: "# Page 1\n\nHello" }),
}));

vi.mock("../../src/shared/bibliographic-metadata", () => ({
  resolveBibliographicMetadata: vi.fn(),
}));

import { createPaperFromCatalog } from "../../src/main/services/literature-enrich";
import { resolveBibliographicMetadata } from "../../src/shared/bibliographic-metadata";
import { readPaperPdfContent } from "../../src/main/services/paper-extract-read";
import type { BibliographicMetadata } from "../../src/shared/bibliographic-metadata";

const roots: string[] = [];

function tempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-lit-bridge-"));
  fs.mkdirSync(path.join(dir, ".prismnext", "library"), { recursive: true });
  roots.push(dir);
  return dir;
}

function bridgeDir(sessionId: string): string {
  return path.join(os.homedir(), ".prism-literature-bridge", sessionId);
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

describe("literature bridge", () => {
  it("reads paper by bibkey via file bridge", async () => {
    const projectRoot = tempProject();
    const { paper } = createPaper(projectRoot, {
      bibkey: "test_bridge_key",
      title: "Bridge Test Paper",
      year: 2024,
      venue: "Test Journal",
      csl_json: JSON.stringify({ volume: "9", page: "1--10" }),
    });

    const sessionId = "test-bridge-session";
    setSessionProjectRoot(sessionId, projectRoot);

    const requestId = "req-1";
    const dir = bridgeDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${requestId}.request.json`),
      JSON.stringify({ action: "read", bibkey: paper.bibkey, sessionId }),
      "utf-8",
    );

    await processLiteratureBridgeOnceForTests();

    const resultPath = path.join(dir, `${requestId}.result.json`);
    expect(fs.existsSync(resultPath)).toBe(true);
    const result = JSON.parse(fs.readFileSync(resultPath, "utf-8")) as {
      paper?: { title?: string; publication_details?: { volume?: string } };
    };
    expect(result.paper?.title).toBe("Bridge Test Paper");
    expect(result.paper?.publication_details?.volume).toBe("9");

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it("rejects invalid DOI without calling catalog", async () => {
    const projectRoot = tempProject();
    const sessionId = "test-bridge-add-invalid";
    setSessionProjectRoot(sessionId, projectRoot);

    const requestId = "req-add-invalid";
    const dir = bridgeDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${requestId}.request.json`),
      JSON.stringify({ action: "add", doi: "not-a-doi", sessionId }),
      "utf-8",
    );

    await processLiteratureBridgeOnceForTests();

    const result = JSON.parse(
      fs.readFileSync(path.join(dir, `${requestId}.result.json`), "utf-8"),
    ) as { verified?: boolean; error?: string };
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/invalid|missing/i);
    expect(createPaperFromCatalog).not.toHaveBeenCalled();

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it("adds paper via catalog when DOI is valid", async () => {
    const projectRoot = tempProject();
    const sessionId = "test-bridge-add-ok";
    setSessionProjectRoot(sessionId, projectRoot);

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

    const requestId = "req-add-ok";
    const dir = bridgeDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${requestId}.request.json`),
      JSON.stringify({ action: "add", doi: "10.1234/example", sessionId }),
      "utf-8",
    );

    await processLiteratureBridgeOnceForTests();

    const result = JSON.parse(
      fs.readFileSync(path.join(dir, `${requestId}.result.json`), "utf-8"),
    ) as {
      success?: boolean;
      verified?: boolean;
      paper?: { bibkey?: string; title?: string };
    };
    expect(createPaperFromCatalog).toHaveBeenCalledWith(projectRoot, {
      doi: "10.1234/example",
      arxivId: undefined,
    });
    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.paper?.bibkey).toBe("smith2024");
    expect(result.paper?.title).toBe("Verified Paper");

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it("returns verified false when catalog lookup fails", async () => {
    const projectRoot = tempProject();
    const sessionId = "test-bridge-add-miss";
    setSessionProjectRoot(sessionId, projectRoot);

    vi.mocked(createPaperFromCatalog).mockRejectedValue(new Error("DOI not found in catalogs"));

    const requestId = "req-add-miss";
    const dir = bridgeDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${requestId}.request.json`),
      JSON.stringify({ action: "add", doi: "10.1234/missing", sessionId }),
      "utf-8",
    );

    await processLiteratureBridgeOnceForTests();

    const result = JSON.parse(
      fs.readFileSync(path.join(dir, `${requestId}.result.json`), "utf-8"),
    ) as { verified?: boolean; error?: string; hint?: string };
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(result.hint).toMatch(/websearch/i);

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it("stage: rejects invalid DOI without calling catalog", async () => {
    const projectRoot = tempProject();
    const sessionId = "test-bridge-stage-invalid";
    setSessionProjectRoot(sessionId, projectRoot);

    const requestId = "req-stage-invalid";
    const dir = bridgeDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${requestId}.request.json`),
      JSON.stringify({ action: "stage", doi: "not-a-doi", sessionId }),
      "utf-8",
    );

    await processLiteratureBridgeOnceForTests();

    const result = JSON.parse(
      fs.readFileSync(path.join(dir, `${requestId}.result.json`), "utf-8"),
    ) as { staged?: boolean; verified?: boolean; error?: string };
    expect(result.staged).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/invalid|missing/i);
    expect(resolveBibliographicMetadata).not.toHaveBeenCalled();

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it("stage: returns verified citation with refId=1 and does not write to library", async () => {
    const projectRoot = tempProject();
    const sessionId = "test-bridge-stage-ok";
    setSessionProjectRoot(sessionId, projectRoot);

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

    const requestId = "req-stage-ok";
    const dir = bridgeDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${requestId}.request.json`),
      JSON.stringify({ action: "stage", doi: "10.1038/test.2024.001", sessionId }),
      "utf-8",
    );

    await processLiteratureBridgeOnceForTests();

    const result = JSON.parse(
      fs.readFileSync(path.join(dir, `${requestId}.result.json`), "utf-8"),
    ) as {
      staged?: boolean;
      verified?: boolean;
      refId?: number;
      citation?: { title?: string; doi?: string };
      alreadyInLibrary?: boolean;
    };
    expect(result.staged).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.refId).toBe(1);
    expect(result.citation?.title).toBe("Staged Paper");
    expect(result.citation?.doi).toBe("10.1038/test.2024.001");
    expect(result.alreadyInLibrary).toBe(false);
    // Library should still be empty.
    const { listPapers } = await import("../../src/main/services/literature-service");
    expect(listPapers(projectRoot).length).toBe(0);

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it("stage: marks alreadyInLibrary when DOI matches existing library paper", async () => {
    const projectRoot = tempProject();
    const sessionId = "test-bridge-stage-existing";
    setSessionProjectRoot(sessionId, projectRoot);

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

    const requestId = "req-stage-existing";
    const dir = bridgeDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${requestId}.request.json`),
      JSON.stringify({ action: "stage", doi: "10.1038/test.2024.001", sessionId }),
      "utf-8",
    );

    await processLiteratureBridgeOnceForTests();

    const result = JSON.parse(
      fs.readFileSync(path.join(dir, `${requestId}.result.json`), "utf-8"),
    ) as {
      alreadyInLibrary?: boolean;
      libraryBibkey?: string;
      citation?: { libraryPaperId?: string; libraryBibkey?: string };
    };
    expect(result.alreadyInLibrary).toBe(true);
    expect(result.libraryBibkey).toBe(existing.paper.bibkey);
    expect(result.citation?.libraryPaperId).toBe(existing.paper.id);

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it("stage: reuses refId when same DOI staged twice in a session", async () => {
    const projectRoot = tempProject();
    const sessionId = "test-bridge-stage-reuse";
    setSessionProjectRoot(sessionId, projectRoot);

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

    const dir = bridgeDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "req-stage-1.json.request.json"),
      JSON.stringify({ action: "stage", doi: "10.1038/reuse.2023.001", sessionId }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, "req-stage-2.json.request.json"),
      JSON.stringify({ action: "stage", doi: "10.1038/reuse.2023.001", sessionId }),
      "utf-8",
    );

    await processLiteratureBridgeOnceForTests();

    const r1 = JSON.parse(fs.readFileSync(path.join(dir, "req-stage-1.json.result.json"), "utf-8")) as { refId?: number };
    const r2 = JSON.parse(fs.readFileSync(path.join(dir, "req-stage-2.json.result.json"), "utf-8")) as { refId?: number };
    expect(r1.refId).toBe(1);
    expect(r2.refId).toBe(1);

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it("stage: returns verified false when catalog lookup fails", async () => {
    const projectRoot = tempProject();
    const sessionId = "test-bridge-stage-miss";
    setSessionProjectRoot(sessionId, projectRoot);

    vi.mocked(resolveBibliographicMetadata).mockRejectedValue(new Error("DOI not found in catalogs"));

    const requestId = "req-stage-miss";
    const dir = bridgeDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${requestId}.request.json`),
      JSON.stringify({ action: "stage", doi: "10.9999/missing", sessionId }),
      "utf-8",
    );

    await processLiteratureBridgeOnceForTests();

    const result = JSON.parse(
      fs.readFileSync(path.join(dir, `${requestId}.result.json`), "utf-8"),
    ) as { staged?: boolean; verified?: boolean; error?: string; hint?: string };
    expect(result.staged).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(result.hint).toMatch(/websearch/i);

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it("read-pdf: rejects bibkeys outside the session intensive list", async () => {
    const projectRoot = tempProject();
    const { paper } = createPaper(projectRoot, {
      bibkey: "intensive_gate_key",
      title: "Gate Test",
    });
    const sessionId = "test-bridge-read-pdf-gate";
    setSessionProjectRoot(sessionId, projectRoot);

    const requestId = "req-read-pdf-gate";
    const dir = bridgeDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${requestId}.request.json`),
      JSON.stringify({ action: "read-pdf", bibkey: paper.bibkey, sessionId, force: true }),
      "utf-8",
    );

    await processLiteratureBridgeOnceForTests();

    const result = JSON.parse(
      fs.readFileSync(path.join(dir, `${requestId}.result.json`), "utf-8"),
    ) as { intensiveReadingRequired?: boolean; error?: string };
    expect(result.intensiveReadingRequired).toBe(true);
    expect(result.error).toMatch(/intensive reading/i);
    expect(readPaperPdfContent).not.toHaveBeenCalled();

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it("read-pdf: allows bibkeys on the session intensive list", async () => {
    const projectRoot = tempProject();
    const { paper } = createPaper(projectRoot, {
      bibkey: "intensive_allowed_key",
      title: "Allowed Test",
    });
    const sessionId = "test-bridge-read-pdf-allowed";
    setSessionProjectRoot(sessionId, projectRoot);
    setSessionIntensiveBibkeys(sessionId, [paper.bibkey]);

    const requestId = "req-read-pdf-allowed";
    const dir = bridgeDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${requestId}.request.json`),
      JSON.stringify({ action: "read-pdf", bibkey: paper.bibkey, sessionId }),
      "utf-8",
    );

    await processLiteratureBridgeOnceForTests();

    const result = JSON.parse(
      fs.readFileSync(path.join(dir, `${requestId}.result.json`), "utf-8"),
    ) as { markdown?: string; intensiveReadingRequired?: boolean };
    expect(result.intensiveReadingRequired).toBeUndefined();
    expect(readPaperPdfContent).toHaveBeenCalled();
    expect(result.markdown).toContain("Hello");

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });
});
