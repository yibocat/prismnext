export const DEFAULT_DISCOVERY_SOURCES = [
  "arxiv",
  "crossref",
  "openalex",
  "semantic-scholar",
  "pubmed",
] as const;

export const OPTIONAL_DISCOVERY_SOURCES = ["biorxiv", "medrxiv"] as const;

export type DefaultDiscoverySourceId = (typeof DEFAULT_DISCOVERY_SOURCES)[number];
export type OptionalDiscoverySourceId = (typeof OPTIONAL_DISCOVERY_SOURCES)[number];
export type DiscoverySourceId = DefaultDiscoverySourceId | OptionalDiscoverySourceId;

export const ALL_DISCOVERY_SOURCES: readonly DiscoverySourceId[] = [
  ...DEFAULT_DISCOVERY_SOURCES,
  ...OPTIONAL_DISCOVERY_SOURCES,
];

export interface DiscoveryHit {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  arxivId?: string;
  pmid?: string;
  abstract?: string;
  url?: string;
  pdfUrl?: string;
  source: DiscoverySourceId;
  citationCount?: number;
}

export interface DiscoverLiteratureInput {
  query: string;
  sources?: string[];
  limit?: number;
  year?: string;
  author?: string;
  /** Optional keys from app settings */
  semanticScholarApiKey?: string;
  pubmedApiKey?: string;
}

export interface DiscoverLiteratureResult {
  query: string;
  sourcesQueried: DiscoverySourceId[];
  sourcesFailed: Array<{ source: DiscoverySourceId; error: string }>;
  hits: DiscoveryHit[];
}

export function normalizeDiscoverySources(
  sources: string[] | undefined | null,
): DiscoverySourceId[] {
  const allowed = new Set<string>(ALL_DISCOVERY_SOURCES);
  const picked = (sources ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is DiscoverySourceId => allowed.has(s));
  const unique = [...new Set(picked)];
  return unique.length > 0 ? unique : [...DEFAULT_DISCOVERY_SOURCES];
}

export function parseDiscoveryYearRange(
  year: string | undefined | null,
): { from: number; to: number | null } | null {
  const raw = (year ?? "").trim();
  if (!raw) return null;
  const single = /^(\d{4})$/.exec(raw);
  if (single) {
    const y = Number(single[1]);
    return { from: y, to: y };
  }
  const range = /^(\d{4})\s*-\s*(\d{4})?$/.exec(raw);
  if (range) {
    return {
      from: Number(range[1]),
      to: range[2] ? Number(range[2]) : null,
    };
  }
  return null;
}

export function clampDiscoveryLimit(limit: number | undefined | null): number {
  if (limit == null || !Number.isFinite(limit)) return 8;
  return Math.min(20, Math.max(1, Math.floor(limit)));
}

/** Keep discovery hit abstracts intact for agent triage (cap only extreme outliers). */
export function truncateDiscoveryAbstract(
  text: string | undefined | null,
  max = 8000,
): string | undefined {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
