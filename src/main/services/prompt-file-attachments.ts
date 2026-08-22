import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app } from "electron";
import { createLogger } from "../app/logger";
import { extractPdfTextWithPdfJs } from "../literature/extract/literature-extract-pdfjs";

const log = createLogger("prompt-file-attachments", "agent");
const execFileAsync = promisify(execFile);

const MAX_TEXT_CHARS = 200_000;
const MAX_PDF_CHARS = 120_000;
const MAX_BLOB_BYTES = 5 * 1024 * 1024;
const CACHE_VERSION = 1;

/** Override only in tests — production always uses Electron userData. */
let attachCacheDirOverride: string | null = null;

export function _setAttachCacheDirForTests(dir: string | null) {
  attachCacheDirOverride = dir;
}

function getAttachCacheDir(): string {
  if (attachCacheDirOverride) return attachCacheDirOverride;
  return path.join(app.getPath("userData"), "composer-attach-cache");
}

interface ExtractCacheEntry {
  v: number;
  absPath: string;
  mtimeMs: number;
  size: number;
  kind: "pdf" | "docx";
  maxChars: number;
  text: string;
  truncated: boolean;
}

function cacheKey(absPath: string, mtimeMs: number, size: number, kind: string, maxChars: number): string {
  return createHash("sha256")
    .update(`${absPath}\0${mtimeMs}\0${size}\0${kind}\0${maxChars}\0${CACHE_VERSION}`)
    .digest("hex");
}

async function readExtractCache(
  absPath: string,
  st: { mtimeMs: number; size: number },
  kind: "pdf" | "docx",
  maxChars: number,
): Promise<ExtractCacheEntry | null> {
  const key = cacheKey(absPath, st.mtimeMs, st.size, kind, maxChars);
  const file = path.join(getAttachCacheDir(), `${key}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as ExtractCacheEntry;
    if (
      parsed?.v !== CACHE_VERSION ||
      parsed.absPath !== absPath ||
      parsed.mtimeMs !== st.mtimeMs ||
      parsed.size !== st.size ||
      parsed.kind !== kind ||
      parsed.maxChars !== maxChars ||
      typeof parsed.text !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeExtractCache(entry: ExtractCacheEntry): Promise<void> {
  try {
    const dir = getAttachCacheDir();
    await fs.mkdir(dir, { recursive: true });
    const key = cacheKey(entry.absPath, entry.mtimeMs, entry.size, entry.kind, entry.maxChars);
    const file = path.join(dir, `${key}.json`);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(entry), "utf8");
    await fs.rename(tmp, file);
  } catch (err) {
    log.warn("attach cache write failed", { err: String(err) });
  }
}

export interface PromptFileInput {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}

export type AcpResourceBlock =
  | {
      type: "resource";
      resource: { uri: string; mimeType: string; text: string };
    }
  | {
      type: "resource";
      resource: { uri: string; mimeType: string; blob: string };
    };

export interface MaterializePromptFilesResult {
  blocks: AcpResourceBlock[];
  /** Human-readable issues (unsupported type, truncated, etc.). */
  notes: string[];
}

function absPathFromFileUri(uri: string): string {
  if (uri.startsWith("file://")) {
    return fileURLToPath(uri);
  }
  return uri;
}

function isTextMime(mime: string, filePath: string): boolean {
  if (mime.startsWith("text/")) return true;
  if (mime === "application/json" || mime === "application/xml" || mime === "application/yaml") {
    return true;
  }
  const ext = path.extname(filePath).toLowerCase();
  return [
    ".md",
    ".markdown",
    ".txt",
    ".tex",
    ".bib",
    ".cls",
    ".sty",
    ".json",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".css",
    ".html",
    ".htm",
    ".xml",
    ".yaml",
    ".yml",
    ".csv",
    ".rs",
    ".go",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".sh",
    ".toml",
    ".ini",
    ".cfg",
    ".log",
  ].includes(ext);
}

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return {
    text: `${text.slice(0, max)}\n\n… [truncated: showing ${max} of ${text.length} chars]`,
    truncated: true,
  };
}

function stripDocxXml(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Best-effort DOCX text via system `unzip` (no extra npm dep). */
async function extractDocxText(absPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("unzip", ["-p", absPath, "word/document.xml"], {
      maxBuffer: 20 * 1024 * 1024,
      encoding: "utf8",
    });
    const text = stripDocxXml(stdout);
    return text || null;
  } catch (err) {
    log.warn("docx extract failed", { absPath, err: String(err) });
    return null;
  }
}

async function materializeOne(file: PromptFileInput): Promise<{
  block?: AcpResourceBlock;
  note?: string;
}> {
  const absPath = absPathFromFileUri(file.uri);
  const uri = file.uri.startsWith("file://") ? file.uri : `file://${absPath}`;
  const mime = file.mimeType || "application/octet-stream";
  const name = file.name || path.basename(absPath);

  let st: Awaited<ReturnType<typeof fs.stat>>;
  try {
    st = await fs.stat(absPath);
  } catch {
    return { note: `附件不存在或无法访问：${name}` };
  }
  if (!st.isFile()) {
    return { note: `不是普通文件：${name}` };
  }

  // PDF → extract text (coding models generally cannot ingest raw PDF bytes).
  // Cache under app userData — never the project tree.
  if (mime === "application/pdf" || absPath.toLowerCase().endsWith(".pdf")) {
    try {
      const cached = await readExtractCache(absPath, st, "pdf", MAX_PDF_CHARS);
      if (cached) {
        return {
          block: {
            type: "resource",
            resource: { uri, mimeType: "text/plain", text: cached.text },
          },
          note: cached.truncated ? `PDF「${name}」文本已截断后发给模型` : undefined,
        };
      }

      const extracted = await extractPdfTextWithPdfJs(absPath);
      const body = extracted.markdown?.trim() || "";
      if (!body) {
        return { note: `PDF 未能抽出文本（可能是扫描件）：${name}` };
      }
      const { text, truncated } = truncate(body, MAX_PDF_CHARS);
      const resourceText = [
        `[PDF attachment: ${name} · ${extracted.pageCount} page(s)]`,
        text,
      ].join("\n\n");
      await writeExtractCache({
        v: CACHE_VERSION,
        absPath,
        mtimeMs: st.mtimeMs,
        size: st.size,
        kind: "pdf",
        maxChars: MAX_PDF_CHARS,
        text: resourceText,
        truncated,
      });
      return {
        block: {
          type: "resource",
          resource: {
            uri,
            mimeType: "text/plain",
            text: resourceText,
          },
        },
        note: truncated ? `PDF「${name}」文本已截断后发给模型` : undefined,
      };
    } catch (err) {
      log.error("pdf extract failed", { absPath, err: String(err) });
      return { note: `PDF 文本提取失败：${name}` };
    }
  }

  // DOCX → best-effort text extract (cached in userData)
  if (
    mime.includes("wordprocessingml") ||
    absPath.toLowerCase().endsWith(".docx")
  ) {
    const cached = await readExtractCache(absPath, st, "docx", MAX_TEXT_CHARS);
    if (cached) {
      return {
        block: {
          type: "resource",
          resource: { uri, mimeType: "text/plain", text: cached.text },
        },
        note: cached.truncated ? `DOCX「${name}」文本已截断后发给模型` : undefined,
      };
    }

    const docxText = await extractDocxText(absPath);
    if (!docxText) {
      return {
        note: `暂无法读取 .docx「${name}」的正文。请另存为 .md / .txt / .pdf 后再试。`,
      };
    }
    const { text, truncated } = truncate(docxText, MAX_TEXT_CHARS);
    const resourceText = `[DOCX attachment: ${name}]\n\n${text}`;
    await writeExtractCache({
      v: CACHE_VERSION,
      absPath,
      mtimeMs: st.mtimeMs,
      size: st.size,
      kind: "docx",
      maxChars: MAX_TEXT_CHARS,
      text: resourceText,
      truncated,
    });
    return {
      block: {
        type: "resource",
        resource: {
          uri,
          mimeType: "text/plain",
          text: resourceText,
        },
      },
      note: truncated ? `DOCX「${name}」文本已截断后发给模型` : undefined,
    };
  }

  // Plain / code text
  if (isTextMime(mime, absPath)) {
    if (st.size > MAX_TEXT_CHARS * 4) {
      return { note: `文本附件过大，已跳过：${name}（${Math.round(st.size / 1024)}KB）` };
    }
    const raw = await fs.readFile(absPath, "utf8");
    const { text, truncated } = truncate(raw, MAX_TEXT_CHARS);
    return {
      block: {
        type: "resource",
        resource: { uri, mimeType: mime.startsWith("text/") ? mime : "text/plain", text },
      },
      note: truncated ? `「${name}」已截断后发给模型` : undefined,
    };
  }

  // Other binary → ACP blob (size-capped). Many coding models still cannot parse these.
  if (st.size > MAX_BLOB_BYTES) {
    return {
      note: `二进制附件过大（>${Math.round(MAX_BLOB_BYTES / 1024 / 1024)}MB），已跳过：${name}`,
    };
  }
  const buf = await fs.readFile(absPath);
  return {
    block: {
      type: "resource",
      resource: {
        uri,
        mimeType: mime,
        blob: buf.toString("base64"),
      },
    },
    note: `「${name}」以二进制附件发送；若模型无法解析该格式，请改为 PDF/纯文本。`,
  };
}

/** Turn composer file refs into ACP `resource` blocks OpenCode can ingest. */
export async function materializePromptFiles(
  files: PromptFileInput[],
): Promise<MaterializePromptFilesResult> {
  const blocks: AcpResourceBlock[] = [];
  const notes: string[] = [];
  for (const file of files) {
    const { block, note } = await materializeOne(file);
    if (block) blocks.push(block);
    if (note) notes.push(note);
  }
  return { blocks, notes };
}
