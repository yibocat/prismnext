/**
 * Extract markdown may use paths relative to the extract dir (`images/fig.png`).
 * Rewrite to project-root-relative paths so chat, notes, and agent replies can embed figures.
 */
export function rewritePaperExtractImageSrcs(markdown: string, paperId: string): string {
  const id = paperId.trim();
  if (!id || !markdown) return markdown;
  const base = `.prismnext/library/extract/${id}/`;
  return markdown.replace(
    /!\[([^\]]*)\]\(\s*([^)\s]+)\s*\)/g,
    (full, alt: string, src: string) => {
      const raw = src.trim().replace(/\\/g, "/");
      if (/^(https?:|data:|blob:|file:)/i.test(raw)) return full;
      if (raw.includes(".prismnext/library/extract/")) return full;
      const norm = raw.replace(/^\.\//, "");
      if (!norm.startsWith("images/")) return full;
      return `![${alt}](${base}${norm})`;
    },
  );
}

const EXTRACT_FIGURE_PATH_RE =
  /^\.prismnext\/library\/extract\/([^/]+)\/(images\/[^?\s#]+)$/i;

/** True when markdown contains embeddable extract figure paths (after rewrite). */
export function markdownHasExtractFigures(markdown: string): boolean {
  return /!\[[^\]]*\]\(\s*\.prismnext\/library\/extract\/[^)]+\/images\//.test(markdown);
}

/** List unique figure paths from markdown image syntax (project-relative or `images/…`). */
export function listExtractFigurePaths(markdown: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)\s*\)/g)) {
    const raw = m[1]?.trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!raw) continue;
    const isExtractFigure =
      raw.startsWith("images/") || raw.includes(".prismnext/library/extract/");
    if (!isExtractFigure || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

export function parseLibraryExtractFigurePath(
  src: string,
): { paperId: string; imageRel: string } | null {
  const norm = src.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  const m = norm.match(EXTRACT_FIGURE_PATH_RE);
  if (!m) return null;
  return { paperId: m[1]!, imageRel: m[2]! };
}

export function isLibraryExtractFigurePath(src: string): boolean {
  return parseLibraryExtractFigurePath(src) != null;
}

/** Resolve a bibkey + extract-relative image ref to a project-relative path. */
export function resolveLibraryFigurePath(paperId: string, imageRel: string): string {
  const id = paperId.trim();
  const rel = imageRel.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!id || !rel) return rel;
  if (rel.startsWith(".prismnext/library/extract/")) return rel;
  const imagePath = rel.startsWith("images/") ? rel : `images/${rel.replace(/^images\//, "")}`;
  return `.prismnext/library/extract/${id}/${imagePath}`;
}

export function encodeLibraryFigureHref(bibkey: string, imageRel: string): string {
  return `library-figure:${encodeURIComponent(`${bibkey}|${imageRel.trim()}`)}`;
}

export function decodeLibraryFigureHref(href: string): { bibkey: string; imageRel: string } | null {
  if (!href.startsWith("library-figure:")) return null;
  const raw = href.slice("library-figure:".length);
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const pipe = decoded.indexOf("|");
    if (pipe <= 0) return null;
    const bibkey = decoded.slice(0, pipe);
    const imageRel = decoded.slice(pipe + 1).trim();
    if (!bibkey || !imageRel) return null;
    return { bibkey, imageRel };
  } catch {
    return null;
  }
}
