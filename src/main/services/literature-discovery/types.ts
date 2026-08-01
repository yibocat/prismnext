import type {
  DiscoverLiteratureInput,
  DiscoveryHit,
  DiscoverySourceId,
} from "../../../shared/literature-discovery";

export interface DiscoverySearchOptions {
  limit: number;
  year?: { from: number; to: number | null } | null;
  author?: string;
  semanticScholarApiKey?: string;
  pubmedApiKey?: string;
  signal: AbortSignal;
}

export interface DiscoveryAdapter {
  id: DiscoverySourceId;
  search: (
    query: string,
    opts: DiscoverySearchOptions,
  ) => Promise<DiscoveryHit[]>;
}

export interface OrchestratorOptions {
  wallClockMs?: number;
  perSourceTimeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
}

export type { DiscoverLiteratureInput, DiscoveryHit, DiscoverySourceId };
