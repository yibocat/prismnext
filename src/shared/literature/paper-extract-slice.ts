/** Parse page spec like "1-5", "3,7,9", "2--2" (last page = -2) into 1-based page numbers. */
export function parsePageSpec(
  spec: string | undefined,
  totalPages: number,
): number[] | null {
  if (!spec?.trim()) return null;
  const trimmed = spec.trim();
  const pages = new Set<number>();

  for (const part of trimmed.split(",")) {
    const token = part.trim();
    if (!token) continue;
    if (token.includes("-")) {
      const [rawStart, rawEnd] = token.split("-");
      const start = Number.parseInt(rawStart, 10);
      let end: number;
      if (rawEnd.startsWith("-")) {
        const fromEnd = Number.parseInt(rawEnd, 10);
        end = totalPages + fromEnd + 1;
      } else {
        end = Number.parseInt(rawEnd, 10);
      }
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      for (let p = lo; p <= hi; p++) {
        if (p >= 1 && p <= totalPages) pages.add(p);
      }
    } else {
      const p = Number.parseInt(token, 10);
      if (Number.isFinite(p) && p >= 1 && p <= totalPages) pages.add(p);
    }
  }

  return pages.size > 0 ? [...pages].sort((a, b) => a - b) : null;
}

const PAGE_MARKER = /^<!--\s*page:(\d+)\s*-->$/;

/** Slice markdown that uses `<!-- page:N -->` markers (pdfjs + html paths). */
export function sliceMarkdownByPages(markdown: string, pageNumbers: number[]): string {
  const wanted = new Set(pageNumbers);
  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let currentPage: number | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (currentPage != null && wanted.has(currentPage) && buf.length > 0) {
      chunks.push(buf.join("\n"));
    }
    buf = [];
  };

  for (const line of lines) {
    const m = PAGE_MARKER.exec(line.trim());
    if (m) {
      flush();
      currentPage = Number.parseInt(m[1], 10);
      continue;
    }
    if (currentPage != null && wanted.has(currentPage)) {
      buf.push(line);
    }
  }
  flush();
  return chunks.join("\n\n").trim();
}

export function filterMarkdownByQuery(markdown: string, query: string): string {
  const q = query.trim().toLowerCase();
  if (!q) return markdown;
  const paragraphs = markdown.split(/\n{2,}/);
  const hits = paragraphs.filter((p) => p.toLowerCase().includes(q));
  return hits.join("\n\n").trim();
}

/** Rough token budget (~4 chars per token). */
export function truncateMarkdown(markdown: string, maxTokens = 6000): {
  text: string;
  truncated: boolean;
} {
  const maxChars = maxTokens * 4;
  if (markdown.length <= maxChars) {
    return { text: markdown, truncated: false };
  }
  return {
    text: `${markdown.slice(0, maxChars)}\n\n… [truncated]`,
    truncated: true,
  };
}
