import type { ComposerDragPayload } from "@/lib/chat/composer-drag";
import type { PaperExtractBlock } from "../../../shared/literature/paper-extract-block";

export function paperSnippetDragPayloads(opts: {
  paper: { id: string; title: string; bibkey?: string | null };
  blocks: PaperExtractBlock[];
}): ComposerDragPayload[] {
  const bibkey = opts.paper.bibkey?.trim() || opts.paper.id;
  return opts.blocks
    .map((block) => ({
      v: 1 as const,
      kind: "paper-snippet" as const,
      bibkey,
      title: opts.paper.title,
      page: block.pageIdx + 1,
      quotedText: block.markdown.trim(),
      paperId: opts.paper.id,
      blockId: block.id,
      blockType: block.type,
      extractSource: "mineru" as const,
    }))
    .filter((payload) => payload.quotedText.length > 0);
}
