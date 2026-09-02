/**
 * Native websearch / webfetch tools — Tavily BYOK.
 */

import { Type } from "@earendil-works/pi-ai";
import { TOOL_NAMES } from "../../../shared/agent/tool-names";
import { missingTavilyApiKeyError } from "../../lib/tavily/errors";
import { tavilyExtract, tavilySearch } from "../../lib/tavily/client";
import { readTavilyApiKey } from "../../lib/tavily/settings";
import type { NativeToolDefinition } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function stringList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const items = v.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export const webSearchTool: NativeToolDefinition = {
  name: TOOL_NAMES.websearch,
  label: "Web Search",
  description:
    "Search the public web via Tavily and return titles, URLs, and snippets. Not for citable academic catalogs.",
  promptSnippet: "Find current web pages; use webfetch for full page text; literature-discover for papers.",
  promptGuidelines: [
    "Use websearch for docs, news, product pages, and non-academic current info.",
    "Citable papers / DOI / arXiv → literature-discover, not websearch.",
    "Search returns snippets only. Call webfetch on a promising URL when you need the page body.",
    "After websearch, stage papers you will cite with literature-stage and discoveredFrom: websearch.",
  ],
  parameters: Type.Object({
    query: Type.String({ minLength: 1, description: "Web search query" }),
    maxResults: Type.Optional(Type.Number({
      minimum: 1,
      maximum: 10,
      description: "Number of results to return (default 8, max 10)",
    })),
    topic: Type.Optional(Type.Union([
      Type.Literal("general"),
      Type.Literal("news"),
    ], { description: "Search topic (default general)" })),
    timeRange: Type.Optional(Type.Union([
      Type.Literal("day"),
      Type.Literal("week"),
      Type.Literal("month"),
      Type.Literal("year"),
    ], { description: "Restrict results by recency" })),
    includeDomains: Type.Optional(Type.Array(Type.String(), {
      description: "Only include these domains",
    })),
    excludeDomains: Type.Optional(Type.Array(Type.String(), {
      description: "Exclude these domains",
    })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const query = str(args.query);
    if (!query) return { ok: false, error: "missing_query", message: "query is required" };
    const apiKey = await readTavilyApiKey();
    if (!apiKey) return missingTavilyApiKeyError();
    const topic = args.topic === "news" ? "news" as const : "general" as const;
    const timeRange = args.timeRange === "day" || args.timeRange === "week"
      || args.timeRange === "month" || args.timeRange === "year"
      ? args.timeRange
      : undefined;
    return tavilySearch({
      apiKey,
      query,
      maxResults: typeof args.maxResults === "number" ? args.maxResults : undefined,
      topic,
      timeRange,
      includeDomains: stringList(args.includeDomains),
      excludeDomains: stringList(args.excludeDomains),
      signal: ctx.abortSignal,
    });
  },
};

export const webFetchTool: NativeToolDefinition = {
  name: TOOL_NAMES.webfetch,
  label: "Web Fetch",
  description:
    "Fetch a public URL with Tavily Extract and return markdown or text. Use after websearch when you have a URL.",
  promptSnippet: "Read a known URL as markdown; do not use for project literature PDFs.",
  promptGuidelines: [
    "Use webfetch when you already have a URL and need the page body.",
    "Project library PDFs stay on literature-read-pdf — not webfetch.",
    "If the page looks like a paper (DOI / arXiv), stage with literature-stage and discoveredFrom: webfetch.",
    "Do not pass a question as the URL. Search first, then fetch.",
  ],
  parameters: Type.Object({
    url: Type.String({ minLength: 1, description: "https URL to extract" }),
    format: Type.Optional(Type.Union([
      Type.Literal("markdown"),
      Type.Literal("text"),
    ], { description: "Output format (default markdown)" })),
    query: Type.Optional(Type.String({
      description: "Optional intent used to rerank extracted chunks",
    })),
    extractDepth: Type.Optional(Type.Union([
      Type.Literal("basic"),
      Type.Literal("advanced"),
    ], { description: "Tavily extract depth (default basic)" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const url = str(args.url);
    if (!url) return { ok: false, error: "invalid_url", message: "url is required" };
    const apiKey = await readTavilyApiKey();
    if (!apiKey) return missingTavilyApiKeyError();
    return tavilyExtract({
      apiKey,
      url,
      format: args.format === "text" ? "text" : "markdown",
      query: str(args.query) || undefined,
      extractDepth: args.extractDepth === "advanced" ? "advanced" : "basic",
      signal: ctx.abortSignal,
    });
  },
};

export const WEB_TOOLS: NativeToolDefinition[] = [webSearchTool, webFetchTool];
