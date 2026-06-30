/**
 * DOI / arXiv normalization and extraction (shared by main + renderer PDF import).
 */

function stripDoiUrlJunk(d: string): string {
  let s = d.split(/[?#]/)[0];
  // PNAS / publisher supplementary paths: .../-/DCSupplemental, .../-/DC1
  s = s.replace(/\/-\/.*$/i, "");
  // Common link suffixes (not part of DOI)
  s = s.replace(/\/(full|abstract|pdf|epdf|mmc\d*)(?:\.[a-z]+)?$/i, "");
  return s;
}

/** Normalize and validate a DOI (strip URL prefix, supplementary paths, trailing junk). */
export function normalizeDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim();
  d = d.replace(/^doi:\s*/i, "");
  d = d.replace(/\s+/g, "");
  d = stripDoiUrlJunk(d);
  d = d.replace(/[.,;:)\]}>'"\s]+$/g, "");
  d = d.replace(/\.(pdf|html?|xml|doi)$/i, "");

  const m = d.match(/^(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  if (!m) return null;

  let core = stripDoiUrlJunk(m[1]);
  const m2 = core.match(/^(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  if (!m2) return null;
  core = m2[1];

  const suffix = core.split("/").slice(1).join("/");
  if (!suffix || suffix.length < 2) return null;
  if (suffix.startsWith("-/") || suffix.includes("/-/")) return null;

  return core;
}

/** Find DOIs in text; normalized, deduped, order preserved. */
export function extractDoisFromText(text: string): string[] {
  // (?<![0-9.]) allows matching after "doi.org/" (slash is OK; dot-digit prefix is not)
  const re = /(?<![0-9.])(10\.\d{4,9}\/(?:(?!\/-\/)[-._;()/:A-Z0-9])+)/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = normalizeDoi(m[0]);
    if (n && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      out.push(n);
    }
  }
  return out;
}

export function normalizeArxivId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.replace(/^arxiv:/i, "").trim().match(/^(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  return m ? m[1] : null;
}

/** arXiv-assigned DOI (10.48550/arXiv.…) → new-style arXiv ID. */
export function arxivIdFromDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  const m = doi.match(/10\.48550\/arxiv\.(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  if (m) return normalizeArxivId(m[1]);
  const normalized = normalizeDoi(doi);
  if (!normalized) return null;
  const m2 = normalized.match(/^10\.48550\/arxiv\.(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  return m2 ? normalizeArxivId(m2[1]) : null;
}

export function extractArxivFromText(text: string): string | null {
  const m = text.match(/(?:arXiv:\s*|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  return m ? normalizeArxivId(m[1]) : null;
}
