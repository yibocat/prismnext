import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  _setAnydocModuleForTests,
  _setDocumentExtractCacheDirForTests,
  readDocumentMarkdownCached,
} from "../../src/main/lib/anydoc";

describe("readDocumentMarkdownCached", () => {
  afterEach(() => {
    _setAnydocModuleForTests(null);
    _setDocumentExtractCacheDirForTests(null);
  });

  it("hits cache on a second read of the same mtime/size", async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "anydoc-cache-"));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "anydoc-cache-store-"));
    _setDocumentExtractCacheDirForTests(cacheDir);
    const filePath = path.join(work, "note.docx");
    fs.writeFileSync(filePath, "not-a-real-docx", "utf8");

    let calls = 0;
    _setAnydocModuleForTests({
      toMarkdown: async () => {
        calls += 1;
        return "# Hello cache\n";
      },
      formatFromPath: () => "docx",
    });

    const first = await readDocumentMarkdownCached(filePath);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.cacheHit).toBe(false);
    expect(first.markdown).toContain("Hello cache");
    expect(calls).toBe(1);

    const second = await readDocumentMarkdownCached(filePath);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.cacheHit).toBe(true);
    expect(second.markdown).toContain("Hello cache");
    expect(calls).toBe(1);

    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it("misses cache when mtime changes", async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "anydoc-cache-m-"));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "anydoc-cache-store-m-"));
    _setDocumentExtractCacheDirForTests(cacheDir);
    const filePath = path.join(work, "note.docx");
    fs.writeFileSync(filePath, "v1", "utf8");

    let calls = 0;
    _setAnydocModuleForTests({
      toMarkdown: async () => {
        calls += 1;
        return `version-${calls}`;
      },
    });

    const first = await readDocumentMarkdownCached(filePath);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.markdown).toBe("version-1");

    const later = new Date(Date.now() + 5_000);
    fs.utimesSync(filePath, later, later);

    const second = await readDocumentMarkdownCached(filePath);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.cacheHit).toBe(false);
    expect(second.markdown).toBe("version-2");
    expect(calls).toBe(2);

    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });
});
