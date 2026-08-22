/** One row in References or Cited by lists (OpenAlex-backed). */
export type PaperCitationEntry = {
  openAlexId: string;
  title: string;
  authors: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxivId: string | null;
  citedByCount: number | null;
};

export type PaperCitationSectionKind = "references" | "citedBy";

export type PaperCitationSection = {
  totalCount: number;
  items: PaperCitationEntry[];
  hasMore: boolean;
  /** References: numeric offset; Cited by: OpenAlex cursor token */
  nextCursor: string | null;
};

export type PaperCitationNetworkSource = "openalex" | "semantic-scholar";

export type PaperCitationNetworkResult = {
  ok: boolean;
  error?: string;
  openAlexWorkId?: string;
  references?: PaperCitationSection;
  citedBy?: PaperCitationSection;
  cachedAt?: number;
  source: PaperCitationNetworkSource;
  /** Set when OpenAlex failed and another provider was used. */
  sourceNote?: string;
};

export const PAPER_CITATION_PAGE_SIZE = 25;
export const PAPER_CITATION_UI_MAX_ROWS = 500;
export const PAPER_CITATION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function paperCitationSectionKindLabel(kind: PaperCitationSectionKind): string {
  return kind === "references" ? "References" : "Cited by";
}

/** User-facing message when catalog fetch fails at the network layer. */
export function formatCitationFetchError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("abort")
  ) {
    return (
      "无法连接文献图谱 API（OpenAlex / Semantic Scholar）。浏览器能打开网站，" +
      "不代表 Electron 主进程能直连——请确认系统代理对桌面 App 生效，或等待自动 fallback。"
    );
  }
  return message;
}

export function paperCitationSourceLabel(source: PaperCitationNetworkSource): string {
  return source === "openalex" ? "OpenAlex" : "Semantic Scholar";
}

export function describePaperCitationIdentifier(paper: {
  doi?: string | null;
  arxiv_id?: string | null;
}): string | null {
  const doi = paper.doi?.trim();
  const arxiv = paper.arxiv_id?.trim();
  if (doi) return `DOI ${doi}`;
  if (arxiv) return `arXiv ${arxiv}`;
  return null;
}
