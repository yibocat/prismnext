import { describe, expect, it } from "vitest";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";
import { getZoteroMirrorByPaperId, listPapers } from "../../src/main/literature/facade";
import { readPaperPdfBytes } from "../../src/main/literature/pdf";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

const pdfBytes = Buffer.from("%PDF-1.4 host-import\n", "utf8");

describe("host literature:importBatch (RW-3.3)", () => {
  it("writes Zotero rows and PDF bytes into the remote library", async () => {
    const root = tempLiteratureProject("p_remote_zotero");
    const ctx = createHostContext();
    ctx.remoteRoot = root;
    ctx.projectId = "p_remote_zotero";

    await dispatchHostMethod("literature:setZoteroBinding", {
      projectRoot: root,
      collectionId: "COLL1",
      collectionName: "ML",
    }, ctx);

    const binding = await dispatchHostMethod("literature:getZoteroBinding", {
      projectRoot: root,
    }, ctx);
    expect(binding).toMatchObject({
      zoteroCollectionId: "COLL1",
      zoteroCollectionName: "ML",
    });

    await dispatchHostMethod("literature:importBatch", {
      projectRoot: root,
      collectionKey: "COLL1",
      collectionName: "ML",
      papers: [{
        zoteroKey: "ITEM1",
        zoteroVersion: 2,
        zoteroAttachKey: "ATT1",
        bibkey: "vaswani2017",
        rawBibtex: "@article{vaswani2017, title={Attention}}",
        title: "Attention Is All You Need",
        authors: "Vaswani",
        year: 2017,
        abstract: null,
        doi: "10.5555/attention",
        arxivId: null,
        venue: "NeurIPS",
        type: "article",
        pdfBase64: pdfBytes.toString("base64"),
      }],
      finalize: true,
      zoteroKeys: ["ITEM1"],
    }, ctx);

    const papers = listPapers(root);
    expect(papers.some((paper) => paper.title.includes("Attention"))).toBe(true);
    const paper = papers.find((row) => row.title.includes("Attention"));
    expect(paper).toBeTruthy();
    const mirror = getZoteroMirrorByPaperId(root, paper!.id);
    expect(mirror?.zotero_key).toBe("ITEM1");
    const stored = readPaperPdfBytes(root, paper!.id);
    expect(stored?.equals(pdfBytes)).toBe(true);
  });
});
