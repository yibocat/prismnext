import type { WebToolError } from "./errors";

export const SEARCH_SNIPPET_MAX = 500;
export const SEARCH_DEFAULT_RESULTS = 8;
export const SEARCH_MAX_RESULTS = 10;
export const FETCH_CONTENT_MAX = 120_000;
const TRIM_MARKER = "\n\n[...content trimmed...]\n\n";

export type WebSearchResultItem = {
  title: string;
  url: string;
  snippet: string;
  score?: number;
};

export type WebSearchSuccess = {
  ok: true;
  query: string;
  provider: "tavily";
  results: WebSearchResultItem[];
  answer: null;
};

export type WebFetchSuccess = {
  ok: true;
  url: string;
  title?: string;
  format: "markdown" | "text";
  content: string;
  contentLength: number;
  truncated?: boolean;
  failed?: Array<{ url: string; error: string }>;
};

export type FetchUrlOk = { ok: true; url: string };

const PRIVATE_V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost"
    || host === "127.0.0.1"
    || host === "0.0.0.0"
    || host === "::1"
    || host === "::"
    || host.endsWith(".local")
    || host.endsWith(".internal")
    || host.endsWith(".localhost")
  ) {
    return true;
  }
  const ipv4 = host.match(PRIVATE_V4);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  if (host.includes(":")) {
    if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  }
  return false;
}

export function validateFetchUrl(raw: string): FetchUrlOk | WebToolError {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: "invalid_url", message: `Invalid URL: ${raw}` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      error: "invalid_url",
      message: `Unsupported URL scheme "${parsed.protocol}" — only http: and https: are allowed.`,
    };
  }
  if (isBlockedHostname(parsed.hostname)) {
    return {
      ok: false,
      error: "invalid_url",
      message: `Blocked: "${parsed.hostname}" looks like a private or internal address.`,
    };
  }
  return { ok: true, url: parsed.toString() };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clipSnippet(value: string): string {
  if (value.length <= SEARCH_SNIPPET_MAX) return value;
  return value.slice(0, SEARCH_SNIPPET_MAX);
}

export function clampSearchResultCount(value: unknown, fallback = SEARCH_DEFAULT_RESULTS): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(SEARCH_MAX_RESULTS, Math.max(1, n));
}

export function mapSearchResults(query: string, raw: unknown): WebSearchSuccess {
  const rec = asRecord(raw);
  const list = Array.isArray(rec?.results) ? rec.results : [];
  const results: WebSearchResultItem[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const url = str(row.url);
    const title = str(row.title) || url;
    if (!url) continue;
    const snippet = clipSnippet(str(row.content) || str(row.snippet));
    const score = typeof row.score === "number" ? row.score : undefined;
    results.push(score == null ? { title, url, snippet } : { title, url, snippet, score });
  }
  return {
    ok: true,
    query,
    provider: "tavily",
    results,
    answer: null,
  };
}

function trimLargeDocument(content: string, maxChars: number): { text: string; truncated: boolean } {
  if (content.length <= maxChars) return { text: content, truncated: false };
  const budget = Math.max(0, maxChars - TRIM_MARKER.length);
  const headSize = Math.floor(budget * 0.75);
  const tailSize = budget - headSize;
  const head = content.slice(0, headSize).trimEnd();
  const tail = content.slice(-tailSize).trimStart();
  return { text: `${head}${TRIM_MARKER}${tail}`.slice(0, maxChars), truncated: true };
}

function extractFailed(raw: unknown): Array<{ url: string; error: string }> {
  const rec = asRecord(raw);
  const list = Array.isArray(rec?.failedResults)
    ? rec.failedResults
    : Array.isArray(rec?.failed_results)
      ? rec.failed_results
      : [];
  const out: Array<{ url: string; error: string }> = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const url = str(row.url);
    const error = str(row.error) || "extract_failed";
    if (url) out.push({ url, error });
  }
  return out;
}

export function mapExtractContent(
  url: string,
  format: "markdown" | "text",
  raw: unknown,
): WebFetchSuccess | WebToolError {
  const rec = asRecord(raw);
  const list = Array.isArray(rec?.results) ? rec.results : [];
  const first = asRecord(list[0]);
  const body = str(first?.rawContent) || str(first?.raw_content);
  const failed = extractFailed(raw);
  if (!body) {
    const failHint = failed[0]?.error;
    return {
      ok: false,
      error: "tavily_request_failed",
      message: failHint || `Tavily extract returned no content for ${url}.`,
    };
  }
  const trimmed = trimLargeDocument(body, FETCH_CONTENT_MAX);
  const title = str(first?.title);
  const result: WebFetchSuccess = {
    ok: true,
    url: str(first?.url) || url,
    format,
    content: trimmed.text,
    contentLength: trimmed.text.length,
  };
  if (title) result.title = title;
  if (trimmed.truncated) result.truncated = true;
  if (failed.length > 0) result.failed = failed;
  return result;
}
