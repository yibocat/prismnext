import type { DocumentReadError } from "./errors";

export const DOCUMENT_READ_MAX_OUTPUT_CHARS = 120_000;
export const DOCUMENT_READ_MAX_INPUT_BYTES = 50 * 1024 * 1024;

const TRIM_MARKER = "\n\n[...content trimmed...]\n\n";

export type DocumentReadSuccess = {
  ok: true;
  path: string;
  absPath: string;
  format: string;
  content: string;
  contentLength: number;
  truncated?: boolean;
  filtered?: boolean;
  cacheHit?: boolean;
};

export type DocumentReadResult = DocumentReadSuccess | DocumentReadError;

export function truncateMarkdown(
  content: string,
  maxChars = DOCUMENT_READ_MAX_OUTPUT_CHARS,
): { text: string; truncated: boolean } {
  if (content.length <= maxChars) return { text: content, truncated: false };
  const budget = Math.max(0, maxChars - TRIM_MARKER.length);
  const headSize = Math.floor(budget * 0.75);
  const tailSize = budget - headSize;
  const head = content.slice(0, headSize).trimEnd();
  const tail = content.slice(-tailSize).trimStart();
  return { text: `${head}${TRIM_MARKER}${tail}`.slice(0, maxChars), truncated: true };
}

export function filterMarkdownByQuery(
  markdown: string,
  query: string | undefined,
): { text: string; filtered: boolean } {
  const needle = query?.trim().toLowerCase();
  if (!needle) return { text: markdown, filtered: false };
  const lines = markdown.split("\n");
  const keep = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.toLowerCase().includes(needle)) {
      if (i > 0) keep.add(i - 1);
      keep.add(i);
      if (i + 1 < lines.length) keep.add(i + 1);
    }
  }
  if (keep.size === 0) {
    return {
      text: `No lines matched query: ${query!.trim()}`,
      filtered: true,
    };
  }
  const kept = [...keep].sort((a, b) => a - b).map((i) => lines[i]!);
  const text = kept.join("\n");
  return { text, filtered: text.length < markdown.length };
}

export function mapConvertSuccess(input: {
  path: string;
  absPath: string;
  format: string;
  markdown: string;
  maxChars?: number;
  query?: string;
  cacheHit?: boolean;
  /** Cache already applied the output cap — keep the flag even if length now fits. */
  alreadyTruncated?: boolean;
}): DocumentReadSuccess {
  const trimmed = truncateMarkdown(input.markdown, input.maxChars ?? DOCUMENT_READ_MAX_OUTPUT_CHARS);
  const queried = filterMarkdownByQuery(trimmed.text, input.query);
  const result: DocumentReadSuccess = {
    ok: true,
    path: input.path,
    absPath: input.absPath,
    format: input.format,
    content: queried.text,
    contentLength: queried.text.length,
  };
  if (input.alreadyTruncated || trimmed.truncated) result.truncated = true;
  if (queried.filtered) result.filtered = true;
  if (input.cacheHit) result.cacheHit = true;
  return result;
}
