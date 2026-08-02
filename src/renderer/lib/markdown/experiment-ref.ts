/** Experiment island ids in chat markdown (`exp-YYYYMMDD-slug-shortid`). */

const EXPERIMENT_ID_RE = /\b(exp-\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*)\b/gi;

export function looksLikeExperimentRef(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return /^exp-\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(v);
}

export function findExperimentRefsInText(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(EXPERIMENT_ID_RE)) {
    const id = m[1];
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function encodeExperimentRefHref(id: string): string {
  return `experiment-ref:${encodeURIComponent(id)}`;
}

export function decodeExperimentRefHref(href: string): string | null {
  if (!href.startsWith("experiment-ref:")) return null;
  const raw = href.slice("experiment-ref:".length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
