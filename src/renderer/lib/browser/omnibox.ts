import {
  buildSearchUrl,
  isSearchEngineId,
  looksLikeUrl,
  toUrlOrSearch,
  type SearchEngineId,
} from "./search-engines";

export type OmniboxSuggestionKind = "bookmark" | "history" | "url" | "search";

export interface OmniboxSuggestion {
  id: string;
  kind: OmniboxSuggestionKind;
  title: string;
  url: string;
  subtitle?: string;
}

export interface OmniboxSource {
  id?: string;
  title: string;
  url: string;
}

export const OMNIBOX_LIMIT = 8;
export const OMNIBOX_PANEL_MAX_PX = 256;
export const OMNIBOX_PANEL_GAP_PX = 4;

export interface OmniboxAnchor {
  left: number;
  bottom: number;
  width: number;
}

/**
 * Punch a hole in the native <webview> so a fixed HTML omnibox can sit over
 * the page. Coordinates are CSS pixels relative to `host`.
 */
export function webviewOmniboxClipPath(
  host: { left: number; top: number; width: number; height: number },
  anchor: OmniboxAnchor,
  panelHeight: number,
): string | null {
  if (host.width < 1 || host.height < 1 || anchor.width < 1 || panelHeight < 1) return null;
  const x1 = anchor.left - host.left;
  const y1 = anchor.bottom + OMNIBOX_PANEL_GAP_PX - host.top;
  const x2 = x1 + anchor.width;
  const y2 = y1 + panelHeight;
  if (x2 <= 0 || y2 <= 0 || x1 >= host.width || y1 >= host.height) return null;
  const left = Math.max(0, x1);
  const top = Math.max(0, y1);
  const right = Math.min(host.width, x2);
  const bottom = Math.min(host.height, y2);
  if (right <= left || bottom <= top) return null;
  return `polygon(evenodd, 0px 0px, ${host.width}px 0px, ${host.width}px ${host.height}px, 0px ${host.height}px, 0px 0px, ${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px)`;
}

/** Compare bookmarks / history / typed URLs without www, hash, or a trailing slash. */
export function canonicalizeOmniboxUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    let path = parsed.pathname;
    if (path.endsWith("/")) path = path.slice(0, -1);
    return `${parsed.protocol}//${parsed.hostname.replace(/^www\./, "")}${path}${parsed.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function scoreMatch(query: string, title: string, url: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const titleLower = title.toLowerCase();
  const urlLower = url.toLowerCase();
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    host = urlLower;
  }

  let score = 0;
  if (titleLower === q || urlLower === q || host === q) score += 100;
  if (titleLower.startsWith(q)) score += 50;
  if (host.startsWith(q)) score += 40;
  if (titleLower.includes(q)) score += 25;
  if (host.includes(q)) score += 18;
  if (urlLower.includes(q)) score += 12;
  return score;
}

function toBookmarkSuggestion(source: OmniboxSource): OmniboxSuggestion {
  return {
    id: `bookmark:${source.id ?? source.url}`,
    kind: "bookmark",
    title: source.title || source.url,
    url: source.url,
    subtitle: source.url,
  };
}

function toHistorySuggestion(source: OmniboxSource): OmniboxSuggestion {
  return {
    id: `history:${canonicalizeOmniboxUrl(source.url)}`,
    kind: "history",
    title: source.title || source.url,
    url: source.url,
    subtitle: source.url,
  };
}

/**
 * Address-bar matches: bookmarks and history, plus a typed URL and a
 * “search this” row. Empty query (just focused) lists recent visits, then
 * leftover bookmarks.
 */
export function matchOmniboxSuggestions(input: {
  query: string;
  bookmarks: OmniboxSource[];
  recentVisits: OmniboxSource[];
  searchEngineId: SearchEngineId | undefined;
  limit?: number;
}): OmniboxSuggestion[] {
  const limit = input.limit ?? OMNIBOX_LIMIT;
  const query = input.query.trim();
  const engineId: SearchEngineId = isSearchEngineId(input.searchEngineId)
    ? input.searchEngineId
    : "duckduckgo";

  if (!query) {
    const seen = new Set<string>();
    const out: OmniboxSuggestion[] = [];
    for (const visit of input.recentVisits) {
      const key = canonicalizeOmniboxUrl(visit.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(toHistorySuggestion(visit));
      if (out.length >= limit) return out;
    }
    for (const bookmark of input.bookmarks) {
      const key = canonicalizeOmniboxUrl(bookmark.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(toBookmarkSuggestion(bookmark));
      if (out.length >= limit) return out;
    }
    return out;
  }

  const out: OmniboxSuggestion[] = [];
  const seen = new Set<string>();

  if (looksLikeUrl(query)) {
    const url = toUrlOrSearch(engineId, query);
    out.push({
      id: `url:${canonicalizeOmniboxUrl(url)}`,
      kind: "url",
      title: url,
      url,
    });
    seen.add(canonicalizeOmniboxUrl(url));
  }

  const ranked: Array<{ score: number; kind: "bookmark" | "history"; source: OmniboxSource }> = [];
  for (const bookmark of input.bookmarks) {
    const score = scoreMatch(query, bookmark.title, bookmark.url);
    if (score > 0) ranked.push({ score: score + 5, kind: "bookmark", source: bookmark });
  }
  for (const visit of input.recentVisits) {
    const score = scoreMatch(query, visit.title, visit.url);
    if (score > 0) ranked.push({ score, kind: "history", source: visit });
  }
  ranked.sort((a, b) => b.score - a.score);

  for (const row of ranked) {
    const key = canonicalizeOmniboxUrl(row.source.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row.kind === "bookmark" ? toBookmarkSuggestion(row.source) : toHistorySuggestion(row.source));
    if (out.length >= limit) break;
  }

  if (out.length < limit) {
    out.push({
      id: `search:${query}`,
      kind: "search",
      title: query,
      url: buildSearchUrl(engineId, query),
    });
  }

  return out.slice(0, limit);
}

export function pickOmniboxNavigation(
  query: string,
  suggestions: OmniboxSuggestion[],
  activeIndex: number,
): string {
  const selected = activeIndex >= 0 ? suggestions[activeIndex] : undefined;
  if (selected) return selected.url;
  return query.trim();
}
