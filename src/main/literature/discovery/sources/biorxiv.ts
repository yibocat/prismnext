import { createOpenAlexDiscoveryAdapter } from "./openalex";

/** bioRxiv / medRxiv keyword search via OpenAlex venue filter (no HTML scraping). */
export const biorxivDiscoveryAdapter = createOpenAlexDiscoveryAdapter(
  "primary_location.source.display_name:bioRxiv",
);
export const medrxivDiscoveryAdapter = createOpenAlexDiscoveryAdapter(
  "primary_location.source.display_name:medRxiv",
);
