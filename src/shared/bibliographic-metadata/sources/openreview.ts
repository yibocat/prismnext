/**
 * OpenReview — open peer-review platform hosting ICLR, NeurIPS workshops,
 * CoRL, TeNL, and other ML/AI conferences.
 *
 * API v2: https://api2.openreview.net/notes?content.title=<title>
 * No API key required for public content.
 */
import { normalizeDoi } from "../../literature/doi-utils";
import { authorsJsonFromParts } from "../helpers";
import type { BibliographicMetadata } from "../types";
import type { BibliographicSource } from "./types";
import { catalogFetch } from "../catalog-fetch";

const OPENREVIEW_API = "https://api2.openreview.net/notes";

interface OpenReviewNote {
  id?: string;
  forum?: string;
  content?: {
    title?: { value?: string } | string;
    authors?: { value?: string[] } | string[];
    abstract?: { value?: string } | string;
    venue?: { value?: string } | string;
    venueid?: { value?: string } | string;
    pdf?: { value?: string } | string;
    "venue_date"?: { value?: string } | string;
  };
  cdate?: number;
  mdate?: number;
}

interface OpenReviewResponse {
  notes?: OpenReviewNote[];
}

function unwrap(field: { value?: string } | string | undefined): string | undefined {
  if (!field) return undefined;
  if (typeof field === "string") return field;
  return field.value;
}

function unwrapArray(field: { value?: string[] } | string[] | undefined): string[] {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  return field.value ?? [];
}

function metadataFromNote(note: OpenReviewNote): BibliographicMetadata | null {
  const c = note.content;
  if (!c) return null;
  const title = unwrap(c.title)?.trim();
  if (!title) return null;
  const authors = unwrapArray(c.authors);
  const abstract = unwrap(c.abstract);
  const venue = unwrap(c.venue) ?? unwrap(c.venueid) ?? null;
  const pdf = unwrap(c.pdf);
  const cdate = note.cdate ?? note.mdate;
  const year = cdate ? new Date(cdate).getFullYear() : null;
  const forum = note.id ?? note.forum ?? null;
  const forumUrl = forum ? `https://openreview.net/forum?id=${forum}` : undefined;
  const pdfUrl = pdf?.startsWith("http") ? pdf : forum ? `https://openreview.net/pdf?id=${forum}` : undefined;
  return {
    title,
    authors: authors.length ? authorsJsonFromParts(authors.map((n) => ({ name: n }))) : null,
    abstract: abstract ?? null,
    year: year && Number.isFinite(year) ? year : null,
    doi: null,
    arxiv_id: null,
    venue,
    type: "conference",
    source: "openreview",
    ...(pdfUrl ? { pdfUrl } : {}),
    ...(forumUrl ? { forumUrl } : {}),
  } as BibliographicMetadata;
}

async function searchOpenReview(query: string): Promise<BibliographicMetadata | null> {
  const url = `${OPENREVIEW_API}?content.title=${encodeURIComponent(query)}&limit=5`;
  const res = await catalogFetch(url, {
    headers: { Accept: "application/json", "User-Agent": "PrismNext/1.0" },
  });
  if (!res.ok) throw new Error(`OpenReview HTTP ${res.status}`);
  const json = (await res.json()) as OpenReviewResponse;
  const notes = json.notes ?? [];
  for (const note of notes) {
    const meta = metadataFromNote(note);
    if (meta) return meta;
  }
  return null;
}

async function resolveByTitle(title: string): Promise<BibliographicMetadata | null> {
  const clean = title.trim();
  if (!clean) return null;
  return searchOpenReview(clean);
}

export const openreviewSource: BibliographicSource = {
  id: "openreview",
  label: "OpenReview",
  supports: { title: true },
  priority: 25,
  enabled: true,
  resolveByTitle,
};
