import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../app/logger";
import {
  assertReadableSize,
  documentReadFormatLabel,
  isDocumentReadExtension,
  readDocumentMarkdownCached,
  type DocumentReadError,
} from "../lib/anydoc";

const log = createLogger("prompt-file-attachments", "agent");

const MAX_TEXT_CHARS = 200_000;
const MAX_BLOB_BYTES = 5 * 1024 * 1024;

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

function documentNote(name: string, err: DocumentReadError): string {
  return `「${name}」${err.message}`;
}

async function materializeDocument(
  absPath: string,
  uri: string,
  name: string,
  size: number,
): Promise<{ block?: AcpResourceBlock; note?: string }> {
  const sizeOk = assertReadableSize(size);
  if (!sizeOk.ok) return { note: documentNote(name, sizeOk) };

  const converted = await readDocumentMarkdownCached(absPath);
  if (!converted.ok) {
    log.warn("document attachment convert failed", {
      absPath,
      error: converted.error,
      message: converted.message,
    });
    return { note: documentNote(name, converted) };
  }

  const format = documentReadFormatLabel(absPath);
  const resourceText = `[${format} attachment: ${name}]\n\n${converted.markdown}`;
  return {
    block: {
      type: "resource",
      resource: { uri, mimeType: "text/plain", text: resourceText },
    },
    note: converted.truncated ? `${format}「${name}」文本已截断后发给模型` : undefined,
  };
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

  // Office / ODF / RTF / EPUB / CSV / PDF → AnyDoc (same cache as document-read).
  if (isDocumentReadExtension(absPath)) {
    return materializeDocument(absPath, uri, name, st.size);
  }

  // Plain / code text (CSV is already handled above via the whitelist).
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

/**
 * Flatten converted attachments into the user turn text Pi actually sees.
 * Binary blobs stay out of the prompt (notes only) — models cannot parse base64 Office.
 * Always name each attached file and whether conversion succeeded, so the model
 * cannot treat a missing body as license to invent or substitute another file.
 */
export function formatMaterializedPromptFiles(
  result: MaterializePromptFilesResult,
  files: PromptFileInput[] = [],
): string {
  const texts: string[] = [];
  for (const block of result.blocks) {
    if ("text" in block.resource && block.resource.text.trim()) {
      texts.push(block.resource.text.trim());
    }
  }

  const statusLines: string[] = [];
  for (const file of files) {
    const converted = result.blocks.some((block) =>
      "text" in block.resource
      && (
        block.resource.uri === file.uri
        || block.resource.text.includes(`attachment: ${file.name}`)
      )
    );
    if (converted) {
      statusLines.push(
        `- \`${file.name}\` — converted below. Answer from that Markdown. Do not substitute another project file.`,
      );
    } else {
      statusLines.push(
        `- \`${file.name}\` — NOT converted. You do not have this file's contents. Tell the user you cannot read it. Do not invent the document. Do not ls/read a different project file and present it as this attachment.`,
      );
    }
  }

  const sections: string[] = [];
  if (statusLines.length > 0) {
    sections.push(
      [
        "## Attachment status (this turn)",
        "",
        "These are the files the user attached. They are the subject of the request.",
        "",
        ...statusLines,
      ].join("\n"),
    );
  }
  if (texts.length > 0) {
    sections.push(["## Attached files", "", ...texts].join("\n\n"));
  }
  if (result.notes.length > 0) {
    sections.push(["## Attachment notes", "", ...result.notes.map((n) => `- ${n}`)].join("\n"));
  }
  return sections.join("\n\n");
}

export async function applyPromptFilesToUserText(
  text: string,
  files?: PromptFileInput[] | null,
): Promise<{ text: string; notes: string[] }> {
  if (!files?.length) return { text, notes: [] };
  const result = await materializePromptFiles(files);
  const extra = formatMaterializedPromptFiles(result, files);
  const trimmed = text.trim();
  if (!extra) return { text: trimmed, notes: result.notes };
  return {
    text: trimmed ? `${trimmed}\n\n${extra}` : extra,
    notes: result.notes,
  };
}
