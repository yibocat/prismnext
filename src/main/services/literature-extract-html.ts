import type { PaperRow } from "./literature-service";
import { resolvePublisherPageUrl } from "./paper-extract-db";

export interface HtmlSnapshotResult {
  markdown: string;
  pageCount: number;
  sourceUrl: string;
}

function stripHtmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const text = withBreaks
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text;
}

function extractArxivAbstractHtml(html: string): string | null {
  const match = html.match(/<blockquote[^>]*class="[^"]*abstract[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/i);
  if (!match) return null;
  return stripHtmlToText(match[1]);
}

export async function fetchHtmlSnapshot(paper: PaperRow): Promise<HtmlSnapshotResult> {
  const sourceUrl = resolvePublisherPageUrl(paper);
  if (!sourceUrl) {
    throw new Error("No DOI or arXiv ID — cannot fetch publisher HTML snapshot.");
  }

  const res = await fetch(sourceUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "PrismNext/1.0 (mailto:yibocat@yeah.net)",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Publisher page fetch failed (${res.status})`);
  }
  const html = await res.text();
  let body = stripHtmlToText(html);
  if (paper.arxiv_id) {
    const abs = extractArxivAbstractHtml(html);
    if (abs) body = abs;
  }
  if (!body.trim()) {
    throw new Error("Publisher page returned no readable text.");
  }

  const title = paper.title?.trim() || "Untitled";
  const markdown = [
    `# ${title}`,
    "",
    `> HTML snapshot from ${sourceUrl}`,
    "",
    "<!-- page:1 -->",
    "",
    body,
  ].join("\n");

  return {
    markdown,
    pageCount: 1,
    sourceUrl,
  };
}
