/** Helpers shared by the source resolver — kept separate from index for clarity. */
import type { BibliographicMetadata } from "../types";

function pickMergedVenue(primary: string | null, supplemental: string | null): string | null {
  if (primary && primary !== "arXiv") return primary;
  if (supplemental && supplemental !== "arXiv") return supplemental;
  return primary ?? supplemental;
}

function pickMergedTitle(primary: string, supplemental: string): string {
  if (!primary) return supplemental;
  if (!supplemental) return primary;
  return primary.length >= supplemental.length ? primary : supplemental;
}

function pickMergedAbstract(primary: string | null, supplemental: string | null): string | null {
  if (!primary) return supplemental;
  if (!supplemental) return primary;
  return primary.length >= supplemental.length ? primary : supplemental;
}

function pickOptionalString(
  primary: string | null | undefined,
  supplemental: string | null | undefined,
): string | null | undefined {
  if (primary != null && primary.trim() !== "") return primary;
  if (supplemental != null && supplemental.trim() !== "") return supplemental;
  return primary ?? supplemental;
}

/** Fill gaps from fallback sources without discarding the primary hit. */
export function mergeBibliographicMetadata(
  primary: BibliographicMetadata,
  supplemental: BibliographicMetadata,
): BibliographicMetadata {
  return {
    title: pickMergedTitle(primary.title, supplemental.title),
    authors: primary.authors ?? supplemental.authors,
    abstract: pickMergedAbstract(primary.abstract, supplemental.abstract),
    year: primary.year ?? supplemental.year,
    doi: primary.doi ?? supplemental.doi,
    arxiv_id: primary.arxiv_id ?? supplemental.arxiv_id,
    venue: pickMergedVenue(primary.venue, supplemental.venue),
    type: primary.type || supplemental.type,
    source: primary.source,
    pdfUrl: primary.pdfUrl ?? supplemental.pdfUrl,
    volume: pickOptionalString(primary.volume, supplemental.volume),
    issue: pickOptionalString(primary.issue, supplemental.issue),
    page: pickOptionalString(primary.page, supplemental.page),
    publisher: pickOptionalString(primary.publisher, supplemental.publisher),
    url: pickOptionalString(primary.url, supplemental.url),
    language: pickOptionalString(primary.language, supplemental.language),
    containerTitleShort: pickOptionalString(
      primary.containerTitleShort,
      supplemental.containerTitleShort,
    ),
    event: pickOptionalString(primary.event, supplemental.event),
    editors: primary.editors ?? supplemental.editors,
    note: pickOptionalString(primary.note, supplemental.note),
  };
}
