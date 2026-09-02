import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { applyPromptFilesToUserText, materializePromptFiles } from "../../src/main/session/prompt-file-attachments";
import {
  _setAnydocModuleForTests,
  _setDocumentExtractCacheDirForTests,
} from "../../src/main/lib/anydoc";
const SOURCE = readFileSync(
  path.join(__dirname, "../../src/main/session/prompt-file-attachments.ts"),
  "utf8",
);

function tmpFile(ext: string, body = "placeholder"): { dir: string; filePath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-att-"));
  const filePath = path.join(dir, `sample${ext}`);
  fs.writeFileSync(filePath, body);
  return { dir, filePath };
}

describe("materializePromptFiles", () => {
  afterEach(() => {
    _setAnydocModuleForTests(null);
    _setDocumentExtractCacheDirForTests(null);
  });

  it("does not keep pdf.js or unzip-docx extractors in the Composer path", () => {
    expect(SOURCE).not.toContain("extractPdfTextWithPdfJs");
    expect(SOURCE).not.toContain("literature-extract-pdfjs");
    expect(SOURCE).not.toContain("extractDocxText");
    expect(SOURCE).not.toContain("stripDocxXml");
    expect(SOURCE).not.toContain("unzip");
  });

  it("forwards promptFiles from the chat send path into agent:send", () => {
    const send = readFileSync(
      path.join(__dirname, "../../src/renderer/stores/chat/send.ts"),
      "utf8",
    );
    expect(send).toContain("promptFiles: composerExtras?.promptFiles");
    const ipc = readFileSync(
      path.join(__dirname, "../../src/main/ipc/agent.ts"),
      "utf8",
    );
    expect(ipc).toContain("applyPromptFilesToUserText");
    expect(ipc).toContain("promptFiles: undefined");
  });

  it("embeds text files as ACP resource text", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-att-"));
    const filePath = path.join(dir, "notes.md");
    fs.writeFileSync(filePath, "# Hello\n\nworld", "utf8");

    const result = await materializePromptFiles([
      {
        uri: `file://${filePath}`,
        name: "notes.md",
        mimeType: "text/markdown",
      },
    ]);

    expect(result.blocks).toHaveLength(1);
    const block = result.blocks[0]!;
    expect(block.type).toBe("resource");
    expect("text" in block.resource).toBe(true);
    if ("text" in block.resource) {
      expect(block.resource.text).toContain("Hello");
    }

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reports a clear note when the path is missing", async () => {
    const result = await materializePromptFiles([
      {
        uri: "file:///tmp/prism-does-not-exist-12345.docx",
        name: "missing.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ]);
    expect(result.blocks).toHaveLength(0);
    expect(result.notes.some((n) => n.includes("不存在") || n.includes("无法访问"))).toBe(true);
  });

  it("converts PDF via AnyDoc, not pdf.js", async () => {
    const { dir, filePath } = tmpFile(".pdf");
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-att-cache-"));
    _setDocumentExtractCacheDirForTests(cacheDir);

    let calls = 0;
    _setAnydocModuleForTests({
      toMarkdown: async () => {
        calls += 1;
        return "# UNIQUE_PDF_TOKEN\n\nAnyDoc body";
      },
      formatFromPath: () => "pdf",
    });

    const result = await materializePromptFiles([
      {
        uri: `file://${filePath}`,
        name: "paper.pdf",
        mimeType: "application/pdf",
      },
    ]);

    expect(result.blocks).toHaveLength(1);
    expect("text" in result.blocks[0]!.resource).toBe(true);
    if ("text" in result.blocks[0]!.resource) {
      expect(result.blocks[0]!.resource.text).toContain("[PDF attachment: paper.pdf]");
      expect(result.blocks[0]!.resource.text).toContain("UNIQUE_PDF_TOKEN");
      expect(result.blocks[0]!.resource.mimeType).toBe("text/plain");
    }
    expect(calls).toBe(1);

    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it("converts CSV via AnyDoc before the text/csv fallthrough", async () => {
    const { dir, filePath } = tmpFile(".csv", "raw,csv,should,not,appear\n1,2,3,4,5\n");
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-att-cache-"));
    _setDocumentExtractCacheDirForTests(cacheDir);
    _setAnydocModuleForTests({
      toMarkdown: async () => "| col |\n| --- |\n| UNIQUE_CSV_TOKEN |",
      formatFromPath: () => "csv",
    });

    const result = await materializePromptFiles([
      {
        uri: `file://${filePath}`,
        name: "table.csv",
        mimeType: "text/csv",
      },
    ]);

    expect(result.blocks).toHaveLength(1);
    if ("text" in result.blocks[0]!.resource) {
      expect(result.blocks[0]!.resource.text).toContain("[CSV attachment: table.csv]");
      expect(result.blocks[0]!.resource.text).toContain("UNIQUE_CSV_TOKEN");
      expect(result.blocks[0]!.resource.text).not.toContain("raw,csv,should,not,appear");
    }

    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it("converts DOCX via AnyDoc and reuses document-extract-cache", async () => {
    const { dir, filePath } = tmpFile(".docx");
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-att-cache-"));
    _setDocumentExtractCacheDirForTests(cacheDir);

    let calls = 0;
    _setAnydocModuleForTests({
      toMarkdown: async () => {
        calls += 1;
        return "# CachedDocxBody";
      },
      formatFromPath: () => "docx",
    });

    const input = {
      uri: `file://${filePath}`,
      name: "note.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };

    const first = await materializePromptFiles([input]);
    expect(first.blocks).toHaveLength(1);
    if ("text" in first.blocks[0]!.resource) {
      expect(first.blocks[0]!.resource.text).toContain("[DOCX attachment: note.docx]");
      expect(first.blocks[0]!.resource.text).toContain("CachedDocxBody");
    }
    expect(calls).toBe(1);

    const cacheFiles = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
    expect(cacheFiles.length).toBeGreaterThanOrEqual(1);

    const second = await materializePromptFiles([input]);
    expect(second.blocks).toHaveLength(1);
    if ("text" in second.blocks[0]!.resource) {
      expect(second.blocks[0]!.resource.text).toContain("CachedDocxBody");
    }
    expect(calls).toBe(1);

    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it("notes password-protected documents with the tool error message", async () => {
    const { dir, filePath } = tmpFile(".docx");
    _setAnydocModuleForTests({
      toMarkdown: async () => {
        throw Object.assign(new Error("encrypted"), { code: "encrypted" });
      },
    });

    const result = await materializePromptFiles([
      {
        uri: `file://${filePath}`,
        name: "locked.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ]);

    expect(result.blocks).toHaveLength(0);
    expect(result.notes.some((n) => n.includes("password-protected") && n.includes("locked.docx"))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("notes scanned PDFs with the literature-read-pdf hint", async () => {
    const { dir, filePath } = tmpFile(".pdf");
    _setAnydocModuleForTests({
      toMarkdown: async () => {
        throw Object.assign(new Error("needs OCR"), { code: "needsOcr" });
      },
    });

    const result = await materializePromptFiles([
      {
        uri: `file://${filePath}`,
        name: "scan.pdf",
        mimeType: "application/pdf",
      },
    ]);

    expect(result.blocks).toHaveLength(0);
    expect(result.notes.some((n) => n.includes("literature-read-pdf") && n.includes("scan.pdf"))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("appends converted Markdown to the user turn the model actually sees", async () => {
    const { dir, filePath } = tmpFile(".docx");
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-att-cache-"));
    _setDocumentExtractCacheDirForTests(cacheDir);
    _setAnydocModuleForTests({
      toMarkdown: async () => "# UNIQUE_DOCX_TOKEN\n\nWord body",
      formatFromPath: () => "docx",
    });

    const applied = await applyPromptFilesToUserText("这个文件你看看", [
      {
        uri: `file://${filePath}`,
        name: "详细流程.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ]);

    expect(applied.text).toContain("这个文件你看看");
    expect(applied.text).toContain("## Attached files");
    expect(applied.text).toContain("## Attachment status (this turn)");
    expect(applied.text).toContain("详细流程.docx");
    expect(applied.text).toContain("converted below");
    expect(applied.text).toContain("[DOCX attachment: 详细流程.docx]");
    expect(applied.text).toContain("UNIQUE_DOCX_TOKEN");

    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it("still gives the model a note when conversion fails, instead of an empty turn", async () => {
    const { dir, filePath } = tmpFile(".docx");
    _setAnydocModuleForTests({
      toMarkdown: async () => {
        throw Object.assign(new Error("encrypted"), { code: "encrypted" });
      },
    });

    const applied = await applyPromptFilesToUserText("", [
      {
        uri: `file://${filePath}`,
        name: "locked.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ]);

    expect(applied.text).toContain("## Attachment notes");
    expect(applied.text).toContain("## Attachment status (this turn)");
    expect(applied.text).toContain("NOT converted");
    expect(applied.text).toContain("cannot read");
    expect(applied.text).toContain("Do not invent the document");
    expect(applied.text).toContain("password-protected");
    expect(applied.text).toContain("locked.docx");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
