import { useMemo } from "react";
import { usePDFPageNumber } from "@anaralabs/lector";
import type { ExtractBlockType } from "../../../shared/literature/paper-extract-block";
import { collectEmphasizedBlockIds } from "../../../shared/literature/paper-extract-block";
import { cn } from "@/lib/utils";
import { useLiteratureBlocks } from "./literature-block-context";

const BLOCK_OUTLINE: Record<ExtractBlockType, string> = {
  text: "border-blue-500/75 bg-blue-500/[0.07]",
  title: "border-blue-600/80 bg-blue-500/[0.09]",
  equation: "border-red-500/75 bg-red-500/[0.07]",
  image: "border-violet-500/75 bg-violet-500/[0.07]",
  chart: "border-violet-500/75 bg-violet-500/[0.07]",
  table: "border-emerald-500/75 bg-emerald-500/[0.07]",
  code: "border-amber-500/75 bg-amber-500/[0.07]",
  list: "border-sky-500/75 bg-sky-500/[0.07]",
  discarded: "border-muted-foreground/45 bg-muted/[0.06]",
};

function blockStyle(bbox: [number, number, number, number]) {
  const [x0, y0, x1, y1] = bbox;
  return {
    left: `${x0 * 100}%`,
    top: `${y0 * 100}%`,
    width: `${(x1 - x0) * 100}%`,
    height: `${(y1 - y0) * 100}%`,
  };
}

/** Per-page MinerU block outlines (visual only; pointer-events none by default). */
export function LiteratureBlockPageOverlay() {
  const pageNumber = usePDFPageNumber();
  const pageIdx = pageNumber - 1;
  const { blocks, blocksByPage, hoveredBlockId, selectedBlockIds, hasBlocks } =
    useLiteratureBlocks();

  const selectedEmphasis = useMemo(
    () => collectEmphasizedBlockIds(blocks, null, selectedBlockIds),
    [blocks, selectedBlockIds],
  );
  const hoverEmphasis = useMemo(
    () => collectEmphasizedBlockIds(blocks, hoveredBlockId, []),
    [blocks, hoveredBlockId],
  );

  const pagePlacements = useMemo(
    () => blocksByPage.get(pageIdx) ?? [],
    [blocksByPage, pageIdx],
  );

  if (!hasBlocks || pagePlacements.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[15]" aria-hidden>
      {pagePlacements.map(({ block, bbox, regionIndex }) => {
        const isSelected = selectedEmphasis.has(block.id);
        const isHovered = !isSelected && hoverEmphasis.has(block.id);
        if (!isSelected && !isHovered) return null;
        return (
          <div
            key={`${block.id}:${regionIndex}`}
            className={cn(
              "absolute border transition-opacity duration-75",
              BLOCK_OUTLINE[block.type],
              isSelected
                ? "border-[1.5px] opacity-100"
                : "border opacity-75",
            )}
            style={blockStyle(bbox)}
            title={block.textPreview}
          />
        );
      })}
    </div>
  );
}
