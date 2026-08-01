import type { DiscoverLiteratureInput, DiscoverLiteratureResult } from "../../../shared/literature-discovery";
import { runLiteratureDiscovery } from "./orchestrator";
import { arxivDiscoveryAdapter } from "./sources/arxiv";
import { crossrefDiscoveryAdapter } from "./sources/crossref";
import { openalexDiscoveryAdapter } from "./sources/openalex";
import { semanticScholarDiscoveryAdapter } from "./sources/semantic-scholar";
import { pubmedDiscoveryAdapter } from "./sources/pubmed";
import { biorxivDiscoveryAdapter, medrxivDiscoveryAdapter } from "./sources/biorxiv";
import type { DiscoveryAdapter } from "./types";

export const DEFAULT_DISCOVERY_ADAPTERS: DiscoveryAdapter[] = [
  arxivDiscoveryAdapter,
  crossrefDiscoveryAdapter,
  openalexDiscoveryAdapter,
  semanticScholarDiscoveryAdapter,
  pubmedDiscoveryAdapter,
  biorxivDiscoveryAdapter,
  medrxivDiscoveryAdapter,
];

export async function discoverLiterature(
  input: DiscoverLiteratureInput,
): Promise<DiscoverLiteratureResult> {
  return runLiteratureDiscovery(input, DEFAULT_DISCOVERY_ADAPTERS);
}

export { runLiteratureDiscovery } from "./orchestrator";
export type { DiscoveryAdapter, DiscoverySearchOptions } from "./types";
