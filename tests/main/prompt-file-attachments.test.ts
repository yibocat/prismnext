import { describe, expect, it, afterEach } from "vitest";
import {
  materializePromptFiles,
  _setAttachCacheDirForTests,
} from "../../src/main/session/prompt-file-attachments";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

describe("materializePromptFiles", () => {
  afterEach(() => {
    _setAttachCacheDirForTests(null);
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

  it("caches DOCX extract under userData override (not project dir)", async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "prism-docx-"));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-att-cache-"));
    _setAttachCacheDirForTests(cacheDir);

    const wordDir = path.join(work, "word");
    fs.mkdirSync(wordDir, { recursive: true });
    fs.writeFileSync(
      path.join(wordDir, "document.xml"),
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>CachedDocxBody</w:t></w:r></w:p></w:body></w:document>`,
      "utf8",
    );
    const docxPath = path.join(work, "note.docx");
    execFileSync("zip", ["-qr", docxPath, "word"], { cwd: work });

    const input = {
      uri: `file://${docxPath}`,
      name: "note.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };

    const first = await materializePromptFiles([input]);
    expect(first.blocks).toHaveLength(1);
    if ("text" in first.blocks[0]!.resource) {
      expect(first.blocks[0]!.resource.text).toContain("CachedDocxBody");
    }

    const cacheFiles = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
    expect(cacheFiles.length).toBeGreaterThanOrEqual(1);

    const cacheFile = path.join(cacheDir, cacheFiles[0]!);
    const entry = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as { text: string };
    entry.text = "[DOCX attachment: note.docx]\n\nFROM_DISK_CACHE";
    fs.writeFileSync(cacheFile, JSON.stringify(entry), "utf8");

    const second = await materializePromptFiles([input]);
    expect(second.blocks).toHaveLength(1);
    if ("text" in second.blocks[0]!.resource) {
      expect(second.blocks[0]!.resource.text).toContain("FROM_DISK_CACHE");
    }

    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });
});
