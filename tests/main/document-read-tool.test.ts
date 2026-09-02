import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";
import { getToolPermissionEntry } from "../../src/shared/permissions/tool-registry";

const readDocumentMarkdownCached = vi.hoisted(() => vi.fn());

vi.mock("../../src/main/lib/anydoc/cache", () => ({
  readDocumentMarkdownCached,
}));

import { getNativeToolByName } from "../../src/main/agent/tools/index";

const projectRoot = mkdtempSync(join(tmpdir(), "prism-doc-read-"));

const ctx: ToolExecuteContext = {
  runtimeSessionId: "rt-doc",
  tabId: "tab",
  turnId: "turn",
  toolCallId: "call-doc",
  projectRoot,
  permissionMode: "auto",
};

describe("native document-read tool", () => {
  beforeEach(() => {
    readDocumentMarkdownCached.mockReset();
  });

  afterAll(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("is registered as document-read with read-only permissions", () => {
    expect(getNativeToolByName(TOOL_NAMES.documentRead)?.name).toBe("document-read");
    expect(getToolPermissionEntry("document-read")?.permissionGroup).toBe("read");
    expect(getToolPermissionEntry("document-read")?.rules.readonly).toBe("allow");
  });

  it("accepts project PDFs (not unsupported_format)", async () => {
    const filePath = join(projectRoot, "draft.pdf");
    writeFileSync(filePath, "%PDF-1.4\n", "utf8");
    readDocumentMarkdownCached.mockResolvedValue({
      ok: true,
      markdown: "## UNIQUE_PDF_TOKEN Hello",
      format: "pdf",
      truncated: false,
      cacheHit: false,
    });
    const tool = getNativeToolByName(TOOL_NAMES.documentRead)!;
    const result = await tool.execute({ path: "draft.pdf" }, ctx) as { ok: boolean; format?: string; content?: string };
    expect(result.ok).toBe(true);
    expect(result.format).toBe("pdf");
    expect(result.content).toContain("UNIQUE_PDF_TOKEN");
    expect(readDocumentMarkdownCached).toHaveBeenCalled();
  });

  it("rejects .zip as unsupported_format", async () => {
    const tool = getNativeToolByName(TOOL_NAMES.documentRead)!;
    const result = await tool.execute({ path: "archive.zip" }, ctx) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("unsupported_format");
    expect(readDocumentMarkdownCached).not.toHaveBeenCalled();
  });

  it("rejects paths outside the project", async () => {
    const tool = getNativeToolByName(TOOL_NAMES.documentRead)!;
    const result = await tool.execute({ path: "/etc/hosts" }, ctx) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("path_outside_project");
    expect(readDocumentMarkdownCached).not.toHaveBeenCalled();
  });

  it("returns file_not_found for a missing whitelist file", async () => {
    const tool = getNativeToolByName(TOOL_NAMES.documentRead)!;
    const result = await tool.execute({ path: "missing.docx" }, ctx) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("file_not_found");
  });

  it("maps password_protected from the converter", async () => {
    const filePath = join(projectRoot, "secret.docx");
    writeFileSync(filePath, "encrypted", "utf8");
    readDocumentMarkdownCached.mockResolvedValue({
      ok: false,
      error: "password_protected",
      message: "This file is password-protected. Save an unlocked copy and try again.",
    });
    const tool = getNativeToolByName(TOOL_NAMES.documentRead)!;
    const result = await tool.execute({ path: "secret.docx" }, ctx) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("password_protected");
  });

  it("maps scanned_pdf_unsupported from the converter", async () => {
    const filePath = join(projectRoot, "scan.pdf");
    writeFileSync(filePath, "%PDF-1.4\n", "utf8");
    readDocumentMarkdownCached.mockResolvedValue({
      ok: false,
      error: "scanned_pdf_unsupported",
      message: "This PDF looks scanned (needs OCR).",
    });
    const tool = getNativeToolByName(TOOL_NAMES.documentRead)!;
    const result = await tool.execute({ path: "scan.pdf" }, ctx) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("scanned_pdf_unsupported");
  });

  it("applies query filtering on converted markdown", async () => {
    const filePath = join(projectRoot, "notes.docx");
    writeFileSync(filePath, "docx", "utf8");
    readDocumentMarkdownCached.mockResolvedValue({
      ok: true,
      markdown: "# Title\nintro\nkeep UNIQUE_DOCX_TOKEN\nnoise\nfooter",
      format: "docx",
      truncated: false,
      cacheHit: true,
    });
    const tool = getNativeToolByName(TOOL_NAMES.documentRead)!;
    const result = await tool.execute({ path: "notes.docx", query: "UNIQUE_DOCX_TOKEN" }, ctx) as {
      ok: boolean;
      filtered?: boolean;
      cacheHit?: boolean;
      content?: string;
    };
    expect(result.ok).toBe(true);
    expect(result.filtered).toBe(true);
    expect(result.cacheHit).toBe(true);
    expect(result.content).toContain("UNIQUE_DOCX_TOKEN");
    expect(result.content).not.toContain("# Title");
    expect(result.content).not.toContain("footer");
  });
});
