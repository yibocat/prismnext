import { normalizeDoi } from "../../doi-utils";
import { authorsJsonFromParts } from "../helpers";
import type { BibliographicMetadata } from "../types";
import type { BibliographicSource } from "./types";
import { catalogFetch } from "../catalog-fetch";

const CATALOG_HEADERS = {
  Accept: "application/json",
  "User-Agent": "PrismNext/1.0 (mailto:support@researchprism.app)",
} as const;

async function resolveByDoi(rawDoi: string): Promise<BibliographicMetadata | null> {
  const doi = normalizeDoi(rawDoi);
  if (!doi) return null;
  const res = await catalogFetch(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`, {
    headers: { ...CATALOG_HEADERS, Accept: "application/vnd.api+json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`DataCite HTTP ${res.status}`);
  const json = (await res.json()) as {
    data?: {
      attributes?: {
        titles?: Array<{ title?: string }>;
        creators?: Array<{ name?: string; givenName?: string; familyName?: string }>;
        publicationYear?: number | string;
        descriptions?: Array<{ description?: string; descriptionType?: string }>;
        types?: { resourceTypeGeneral?: string };
        publisher?: string;
        url?: string;
        language?: string;
      };
    };
  };
  const attrs = json.data?.attributes;
  if (!attrs) return null;
  const yearRaw = attrs.publicationYear;
  const year =
    typeof yearRaw === "number"
      ? yearRaw
      : typeof yearRaw === "string"
        ? Number.parseInt(yearRaw, 10)
        : null;
  return {
    title: attrs.titles?.[0]?.title ?? doi,
    authors: authorsJsonFromParts(
      (attrs.creators ?? []).map((c) => ({ given: c.givenName, family: c.familyName, name: c.name })),
    ),
    abstract:
      attrs.descriptions?.find((d) => d.descriptionType === "Abstract")?.description ??
      attrs.descriptions?.[0]?.description ??
      null,
    year: Number.isFinite(year) ? year : null,
    doi,
    arxiv_id: null,
    venue: attrs.publisher?.trim() ?? null,
    type: attrs.types?.resourceTypeGeneral?.toLowerCase() ?? "article",
    source: "datacite",
    publisher: attrs.publisher?.trim() ?? null,
    url: attrs.url?.trim() ?? null,
    language: attrs.language?.trim() ?? null,
  };
}

export const dataciteSource: BibliographicSource = {
  id: "datacite",
  label: "DataCite",
  supports: { doi: true },
  priority: 50,
  enabled: true,
  resolveByDoi,
};
