/** Normalize ISBN-10 / ISBN-13 (strip hyphens and prefixes). */
export function normalizeIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^isbn[:\s-]*/i, "")
    .replace(/-/g, "")
    .trim();
  if (/^\d{10}$/.test(cleaned)) return cleaned;
  if (/^\d{13}$/.test(cleaned) && (cleaned.startsWith("978") || cleaned.startsWith("979"))) {
    return cleaned;
  }
  return null;
}

/** Normalize PubMed PMID from bare id or pubmed URL. */
export function normalizePmid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const fromUrl = raw.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,8})/i)?.[1];
  if (fromUrl) return fromUrl;
  const bare = raw.replace(/^pmid[:\s]*/i, "").trim();
  if (/^\d{1,8}$/.test(bare)) return bare;
  return null;
}

/** Normalize NASA ADS bibcode from URL or bare paste. */
export function normalizeAdsBibcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const fromUrl = raw.match(/adsabs\.harvard\.edu\/abs\/([^?\s#]+)/i)?.[1];
  if (fromUrl) {
    const segment = decodeURIComponent(fromUrl.replace(/\/$/, ""));
    const bibcode = segment.split("/")[0]?.replace(/\/$/, "") ?? segment;
    if (/^\d{4}[A-Za-z][A-Za-z0-9._-]+$/.test(bibcode)) return bibcode;
  }
  const trimmed = raw.replace(/^ads[:\s]*/i, "").trim();
  if (/^\d{4}[A-Za-z][A-Za-z0-9._-]+$/.test(trimmed)) return trimmed;
  return null;
}
