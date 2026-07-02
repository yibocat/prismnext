import { useEffect, useRef } from "react";
import { usePdf } from "@anaralabs/lector";
import { hitTestBlock } from "../../../shared/paper-extract-block";
import {
  findLiteraturePdfScrollRoot,
  pageInfoFromPoint,
} from "@/lib/literature/literature-block-hit-test";
import { useLiteratureBlocks, useLiteratureBlockActions } from "./literature-block-context";

/** Viewport-level pointer handling for block hover and pick (Shift+Click toggles multi-select). */
export function LiteratureBlockPointerCapture() {
  const viewportRef = usePdf((s) => s.viewportRef);
  const pdfDocumentProxy = usePdf((s) => s.pdfDocumentProxy);
  const {
    blocks,
    hasBlocks,
    blockPickMode,
    selectedBlockIds,
    setHoveredBlockId,
    clearBlockSelection,
  } = useLiteratureBlocks();
  const { toggleBlockSelection } = useLiteratureBlockActions();
  const dragRef = useRef(false);

  useEffect(() => {
    if (!hasBlocks || !pdfDocumentProxy) return;

    let root: HTMLElement | null = null;
    let attached = false;
    let raf = 0;

    const clearTextSelection = () => window.getSelection()?.removeAllRanges();

    const onMouseDown = (e: MouseEvent) => {
      dragRef.current = false;
      const shiftPick = e.shiftKey;
      if (!shiftPick && !blockPickMode) return;
      const info = pageInfoFromPoint(e.clientX, e.clientY);
      if (!info) return;
      const hit = hitTestBlock(blocks, info.pageIdx, info.x, info.y);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      clearTextSelection();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (e.buttons !== 0) dragRef.current = true;
      const info = pageInfoFromPoint(e.clientX, e.clientY);
      if (!info) {
        setHoveredBlockId(null);
        return;
      }
      const hit = hitTestBlock(blocks, info.pageIdx, info.x, info.y);
      setHoveredBlockId((prev) => (prev === (hit?.id ?? null) ? prev : hit?.id ?? null));
    };
    const onMouseLeave = () => setHoveredBlockId(null);

    const onClick = (e: MouseEvent) => {
      if (dragRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-block-action-menu], [data-annotation-tooltip], [data-excerpt-session-bar]")) {
        return;
      }

      const info = pageInfoFromPoint(e.clientX, e.clientY);
      const hit = info ? hitTestBlock(blocks, info.pageIdx, info.x, info.y) : null;
      const shiftPick = e.shiftKey;

      if (shiftPick || blockPickMode) {
        if (!hit) return;
        e.preventDefault();
        e.stopPropagation();
        clearTextSelection();
        toggleBlockSelection(hit, shiftPick);
        return;
      }

      if (selectedBlockIds.length > 0 && !hit) {
        clearBlockSelection();
      }
    };

    const attach = () => {
      if (attached) return;
      root = findLiteraturePdfScrollRoot(viewportRef);
      if (!root) {
        raf = requestAnimationFrame(attach);
        return;
      }
      attached = true;
      root.addEventListener("mousedown", onMouseDown, true);
      root.addEventListener("mousemove", onMouseMove, { passive: true });
      root.addEventListener("mouseleave", onMouseLeave);
      root.addEventListener("click", onClick, true);
    };

    attach();

    return () => {
      cancelAnimationFrame(raf);
      if (root && attached) {
        root.removeEventListener("mousedown", onMouseDown, true);
        root.removeEventListener("mousemove", onMouseMove);
        root.removeEventListener("mouseleave", onMouseLeave);
        root.removeEventListener("click", onClick, true);
      }
    };
  }, [
    blocks,
    hasBlocks,
    blockPickMode,
    selectedBlockIds.length,
    pdfDocumentProxy,
    viewportRef,
    setHoveredBlockId,
    clearBlockSelection,
    toggleBlockSelection,
  ]);

  return null;
}
