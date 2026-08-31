import { afterEach, describe, expect, it } from "vitest";
import { EXTRACT_PARSER_UNAVAILABLE } from "../../src/shared/literature/paper-extract";
import { createPaper } from "../../src/main/literature/facade";
import { setPdfJsParserAvailableForTest } from "../../src/main/literature/extract/literature-extract-pdfjs";
import {
  upsertPaperExtractState,
  writeExtractArtifacts,
} from "../../src/main/literature/extract/paper-extract-db";
import { createAgentNativeTools } from "../../src/main/agent/agent-service";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

afterEach(() => {
  setPdfJsParserAvailableForTest(null);
});

describe("host PDF extract (RW-3.2)", () => {
  it("returns extract_parser_unavailable when Host has no MinerU token and no pdfjs", async () => {
    setPdfJsParserAvailableForTest(false);
    const root = tempLiteratureProject("p_remote_extract");
    const { paper } = createPaper(root, { title: "No Parser Paper" });
    const ctx = createHostContext();
    ctx.remoteRoot = root;
    ctx.projectId = "p_remote_extract";

    await expect(dispatchHostMethod("extract:enqueue", {
      projectRoot: root,
      paperId: paper.id,
      source: "pdfjs",
    }, ctx)).rejects.toMatchObject({ code: EXTRACT_PARSER_UNAVAILABLE });

    await expect(dispatchHostMethod("extract:enqueue", {
      projectRoot: root,
      paperId: paper.id,
      source: "mineru",
    }, ctx)).rejects.toMatchObject({ code: EXTRACT_PARSER_UNAVAILABLE });
  });

  it("still reads a cached extract when the parser is missing", async () => {
    setPdfJsParserAvailableForTest(false);
    const root = tempLiteratureProject("p_remote_cached_extract");
    const { paper } = createPaper(root, { title: "Cached Extract", bibkey: "cached2024" });
    const bibkey = paper.bibkey;
    const written = writeExtractArtifacts(
      root,
      paper.id,
      "pdfjs",
      "<!-- page:1 -->\n\nHello from cache",
      { engine: "pdfjs", pageCount: 1 },
      1,
    );
    upsertPaperExtractState(root, {
      paperId: paper.id,
      source: "pdfjs",
      status: "ready",
      mdPath: written.mdPath,
      pages: written.pages,
      finishedAt: Date.now(),
    });

    const ctx = createHostContext();
    ctx.remoteRoot = root;
    const listed = await dispatchHostMethod("extract:list", {
      projectRoot: root,
      paperIds: [paper.id],
    }, ctx) as Record<string, { pdfjs?: { status?: string } }>;
    expect(listed[paper.id]?.pdfjs?.status).toBe("ready");

    const read = await dispatchHostMethod("extract:readPdf", {
      projectRoot: root,
      bibkey,
    }, ctx) as { markdown?: string; error?: string };
    expect(read.error).toBeUndefined();
    expect(read.markdown).toContain("Hello from cache");
  });

  it("lets literature-read-pdf fail with the same code when force needs a parser", async () => {
    setPdfJsParserAvailableForTest(false);
    const root = tempLiteratureProject("p_remote_read_pdf");
    const { paper } = createPaper(root, { title: "Force Extract", bibkey: "force2024" });
    const tools = createAgentNativeTools({ pendingRemoteModules: true });
    const readPdf = tools.find((tool) => tool.name === "literature-read-pdf");
    expect(readPdf).toBeTruthy();
    const result = await readPdf!.execute({ bibkey: paper.bibkey, force: true }, {
      runtimeSessionId: "rt",
      tabId: "tab",
      turnId: "t1",
      toolCallId: "c1",
      projectRoot: root,
      permissionMode: "auto",
    }) as { error?: string };
    expect(result.error).toBe(EXTRACT_PARSER_UNAVAILABLE);
  });
});
