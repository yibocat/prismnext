const URL_PREFIX = "literature-pdf://file/";

/** Renderer-safe URL — pdf.js fetches via registered protocol (no giant IPC copy). */
export function toLiteraturePdfUrl(absPath: string): string {
  return `${URL_PREFIX}${encodeURIComponent(absPath)}`;
}

export function literaturePdfAbsPathFromUrl(url: string): string | null {
  if (!url.startsWith(URL_PREFIX)) return null;
  return decodeURIComponent(url.slice(URL_PREFIX.length));
}
