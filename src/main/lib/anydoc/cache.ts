import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { getUserDataPath } from "../../app/paths";
import { createLogger } from "../../app/logger";
import { documentReadFormatId } from "../../../shared/document/formats";
import { convertFileToMarkdown, getAnydocEngineVersion } from "./client";
import {
  DOCUMENT_READ_MAX_OUTPUT_CHARS,
  truncateMarkdown,
} from "./map";
import type { DocumentReadError } from "./errors";

const log = createLogger("anydoc-cache", "agent");
const CACHE_VERSION = 1;

let cacheDirOverride: string | null = null;

export function _setDocumentExtractCacheDirForTests(dir: string | null): void {
  cacheDirOverride = dir;
}

function getCacheDir(): string {
  if (cacheDirOverride) return cacheDirOverride;
  return path.join(getUserDataPath(), "document-extract-cache");
}

interface CacheEntry {
  v: number;
  absPath: string;
  mtimeMs: number;
  size: number;
  format: string;
  maxChars: number;
  engineVersion: string;
  markdown: string;
  truncated: boolean;
}

function cacheKey(
  absPath: string,
  mtimeMs: number,
  size: number,
  maxChars: number,
  engineVersion: string,
): string {
  return createHash("sha256")
    .update(`${absPath}\0${mtimeMs}\0${size}\0${maxChars}\0${engineVersion}\0${CACHE_VERSION}`)
    .digest("hex");
}

async function readCache(entryPath: string): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(entryPath, "utf8");
    const parsed = JSON.parse(raw) as CacheEntry;
    if (
      parsed?.v !== CACHE_VERSION
      || typeof parsed.markdown !== "string"
      || typeof parsed.absPath !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(file: string, entry: CacheEntry): Promise<void> {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(entry), "utf8");
    await fs.rename(tmp, file);
  } catch (err) {
    log.warn("document extract cache write failed", { err: String(err) });
  }
}

export type CachedMarkdownOk = {
  ok: true;
  markdown: string;
  format: string;
  truncated: boolean;
  cacheHit: boolean;
};

export async function readDocumentMarkdownCached(
  absPath: string,
  opts?: { maxChars?: number; signal?: AbortSignal },
): Promise<CachedMarkdownOk | DocumentReadError> {
  const maxChars = opts?.maxChars ?? DOCUMENT_READ_MAX_OUTPUT_CHARS;
  const engineVersion = getAnydocEngineVersion();
  let st: { mtimeMs: number; size: number };
  try {
    const info = await fs.stat(absPath);
    if (!info.isFile()) {
      return { ok: false, error: "file_not_found", message: "Not a regular file." };
    }
    st = { mtimeMs: info.mtimeMs, size: info.size };
  } catch {
    return { ok: false, error: "file_not_found", message: "File not found." };
  }

  const key = cacheKey(absPath, st.mtimeMs, st.size, maxChars, engineVersion);
  const file = path.join(getCacheDir(), `${key}.json`);
  const cached = await readCache(file);
  if (
    cached
    && cached.absPath === absPath
    && cached.mtimeMs === st.mtimeMs
    && cached.size === st.size
    && cached.maxChars === maxChars
    && cached.engineVersion === engineVersion
  ) {
    return {
      ok: true,
      markdown: cached.markdown,
      format: cached.format,
      truncated: cached.truncated,
      cacheHit: true,
    };
  }

  const converted = await convertFileToMarkdown(absPath, opts?.signal);
  if (!converted.ok) return converted;
  const trimmed = truncateMarkdown(converted.markdown, maxChars);
  const format = converted.format || documentReadFormatId(absPath);
  await writeCache(file, {
    v: CACHE_VERSION,
    absPath,
    mtimeMs: st.mtimeMs,
    size: st.size,
    format,
    maxChars,
    engineVersion,
    markdown: trimmed.text,
    truncated: trimmed.truncated,
  });
  return {
    ok: true,
    markdown: trimmed.text,
    format,
    truncated: trimmed.truncated,
    cacheHit: false,
  };
}
