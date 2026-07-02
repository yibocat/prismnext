import type { PaperExtractBlock } from "../../../shared/paper-extract-block";
import { blocksOverlappingRect, mergeBlockMarkdown } from "../../../shared/paper-extract-block";

/** One queued PDF text excerpt (plain or MinerU-resolved Markdown). */
export interface PdfTextExcerpt {
  text: string;
  page: number;
  markdown: string;
}

interface SelectionHighlightRect {
  pageNumber: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SelectionDimension {
  text: string;
  highlights: SelectionHighlightRect[];
}

/** Resolve best Markdown for a text selection (MinerU blocks when available). */
export function markdownFromTextSelection(
  dim: SelectionDimension,
  blocks: PaperExtractBlock[],
): { markdown: string; page: number } | null {
  const text = dim.text?.trim();
  if (!text || !dim.highlights?.length) return null;
  const page = dim.highlights[0]?.pageNumber ?? 1;
  const pageIdx = page - 1;
  const pageEl = document.querySelector(
    `[data-page-number="${page}"]`,
  ) as HTMLElement | null;
  const pageShell = pageEl?.closest(".prism-pdf-page") as HTMLElement | null;
  const pageW = pageShell?.clientWidth ?? 1;
  const pageH = pageShell?.clientHeight ?? 1;
  const matched = new Map<string, PaperExtractBlock>();
  for (const h of dim.highlights) {
    if (h.pageNumber !== page) continue;
    const rect = {
      left: h.left / pageW,
      top: h.top / pageH,
      width: h.width / pageW,
      height: h.height / pageH,
    };
    for (const block of blocksOverlappingRect(blocks, pageIdx, rect)) {
      matched.set(block.id, block);
    }
  }
  const ordered = [...matched.values()].sort((a, b) => a.index - b.index);
  const structured = mergeBlockMarkdown(ordered, blocks);
  return {
    markdown: structured.trim() || text,
    page,
  };
}

export function excerptFromTextSelection(
  dim: SelectionDimension,
  blocks: PaperExtractBlock[],
  hasBlocks: boolean,
): PdfTextExcerpt | null {
  const text = dim.text?.trim();
  if (!text || !dim.highlights?.length) return null;
  const page = dim.highlights[0]?.pageNumber ?? 1;
  if (hasBlocks && blocks.length > 0) {
    const resolved = markdownFromTextSelection(dim, blocks);
    if (resolved) {
      return { text, page: resolved.page, markdown: resolved.markdown };
    }
  }
  return { text, page, markdown: text };
}

export function mergeExcerptMarkdown(parts: { markdown: string }[]): string {
  return parts
    .map((p) => p.markdown.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}
