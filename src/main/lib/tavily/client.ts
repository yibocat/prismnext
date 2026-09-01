import { tavily } from "@tavily/core";
import { mapTavilyError } from "./errors";
import {
  clampSearchResultCount,
  mapExtractContent,
  mapSearchResults,
  validateFetchUrl,
  type WebFetchSuccess,
  type WebSearchSuccess,
} from "./map";
import type { WebToolError } from "./errors";

export type TavilyClient = ReturnType<typeof tavily>;

export function createTavilyClient(apiKey: string): TavilyClient {
  return tavily({ apiKey });
}

export type TavilySearchInput = {
  apiKey: string;
  query: string;
  maxResults?: number;
  topic?: "general" | "news";
  timeRange?: "day" | "week" | "month" | "year";
  includeDomains?: string[];
  excludeDomains?: string[];
  signal?: AbortSignal;
};

export type TavilyExtractInput = {
  apiKey: string;
  url: string;
  format?: "markdown" | "text";
  query?: string;
  extractDepth?: "basic" | "advanced";
  signal?: AbortSignal;
};

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export async function tavilySearch(input: TavilySearchInput): Promise<WebSearchSuccess | WebToolError> {
  const query = input.query.trim();
  if (!query) return { ok: false, error: "tavily_request_failed", message: "missing_query" };
  const client = createTavilyClient(input.apiKey);
  try {
    const response = await client.search(query, {
      searchDepth: "basic",
      includeAnswer: false,
      includeRawContent: false,
      maxResults: clampSearchResultCount(input.maxResults),
      topic: input.topic === "news" ? "news" : "general",
      ...(input.timeRange ? { timeRange: input.timeRange } : {}),
      ...(stringList(input.includeDomains) ? { includeDomains: stringList(input.includeDomains) } : {}),
      ...(stringList(input.excludeDomains) ? { excludeDomains: stringList(input.excludeDomains) } : {}),
    });
    if (input.signal?.aborted) {
      return { ok: false, error: "tavily_request_failed", message: "aborted" };
    }
    return mapSearchResults(query, response);
  } catch (err) {
    return mapTavilyError(err);
  }
}

export async function tavilyExtract(input: TavilyExtractInput): Promise<WebFetchSuccess | WebToolError> {
  const checked = validateFetchUrl(input.url);
  if (!checked.ok) return checked;
  const format = input.format === "text" ? "text" : "markdown";
  const client = createTavilyClient(input.apiKey);
  try {
    const response = await client.extract([checked.url], {
      format,
      extractDepth: input.extractDepth === "advanced" ? "advanced" : "basic",
      includeImages: false,
      ...(input.query?.trim() ? { query: input.query.trim() } : {}),
    });
    if (input.signal?.aborted) {
      return { ok: false, error: "tavily_request_failed", message: "aborted" };
    }
    return mapExtractContent(checked.url, format, response);
  } catch (err) {
    return mapTavilyError(err);
  }
}
