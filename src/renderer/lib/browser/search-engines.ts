export type SearchEngineId = "duckduckgo" | "google" | "brave" | "bing" | "ecosia";

export interface SearchEngine {
  id: SearchEngineId;
  /** Stable id used as the settings value. */
  nameKey: string;
  /** Fallback display name when i18n key is missing (e.g. JSON file not
   *  hot-reloaded). Always render with `t(key, { defaultValue: fallbackName })`. */
  fallbackName: string;
  /** URL template — `{q}` is replaced with the encoded query. */
  urlTemplate: string;
}

export const SEARCH_ENGINES: readonly SearchEngine[] = [
  {
    id: "duckduckgo",
    nameKey: "settings.browser.searchEngine.duckduckgo",
    fallbackName: "DuckDuckGo",
    urlTemplate: "https://duckduckgo.com/?q={q}",
  },
  {
    id: "google",
    nameKey: "settings.browser.searchEngine.google",
    fallbackName: "Google",
    urlTemplate: "https://www.google.com/search?q={q}",
  },
  {
    id: "brave",
    nameKey: "settings.browser.searchEngine.brave",
    fallbackName: "Brave Search",
    urlTemplate: "https://search.brave.com/search?q={q}",
  },
  {
    id: "bing",
    nameKey: "settings.browser.searchEngine.bing",
    fallbackName: "Bing",
    urlTemplate: "https://www.bing.com/search?q={q}",
  },
  {
    id: "ecosia",
    nameKey: "settings.browser.searchEngine.ecosia",
    fallbackName: "Ecosia",
    urlTemplate: "https://www.ecosia.org/search?q={q}",
  },
] as const;

export const DEFAULT_SEARCH_ENGINE: SearchEngineId = "duckduckgo";

export function isSearchEngineId(value: unknown): value is SearchEngineId {
  return typeof value === "string" && SEARCH_ENGINES.some((e) => e.id === value);
}

export function getSearchEngine(id: SearchEngineId): SearchEngine {
  return SEARCH_ENGINES.find((e) => e.id === id) ?? SEARCH_ENGINES[0];
}

export function buildSearchUrl(id: SearchEngineId, query: string): string {
  return getSearchEngine(id).urlTemplate.replace("{q}", encodeURIComponent(query));
}

/**
 * Heuristic: does the input look like a URL we'd load directly, or a search
 * query to hand to the search engine? Used by the address bar.
 *
 *  - starts with a scheme (http://, https://, file://, …)         → URL
 *  - contains a dot and no whitespace, OR is `localhost[:port]`    → URL
 *  - everything else                                              → search query
 */
export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  if (/^[a-z][a-z0-9+.\-]*:/i.test(s)) return true; // has scheme
  if (/\s/.test(s)) return false; // whitespace → not a URL
  // `localhost[:port]` or `localhost[:port]/path`
  if (/^localhost(:\d+)?(\/.*)?$/i.test(s)) return true;
  // bare host with a dot: `example.com`, `sub.example.co.uk`, `a.b/path?q=1`
  if (/^[^\s.]+(\.[^\s.]+)+(:\d+)?(\/.*)?$/.test(s)) return true;
  return false;
}

/** Normalize input into a URL string. If `looksLikeUrl`, prepend `https://`
 *  when no scheme is present. */
export function toUrlOrSearch(
  engineId: SearchEngineId | undefined,
  input: string,
): string {
  const id: SearchEngineId = isSearchEngineId(engineId) ? engineId : DEFAULT_SEARCH_ENGINE;
  const s = input.trim();
  if (!s) return buildSearchUrl(id, "");
  if (looksLikeUrl(s)) {
    return /^[a-z][a-z0-9+.\-]*:/i.test(s) ? s : `https://${s}`;
  }
  return buildSearchUrl(id, s);
}
