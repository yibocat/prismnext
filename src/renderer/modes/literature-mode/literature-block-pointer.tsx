import { useEffect, useRef } from "react";
import { usePdf } from "@anaralabs/lector";
import { hitTestBlock } from "../../../shared/literature/paper-extract-block";
import {
  findLiteraturePdfScrollRoot,
  pageInfoFromPoint,
} from "@/lib/literature/literature-block-hit-test";
import { useLiteratureBlocks, useLiteratureBlockActions } from "./literature-block-context";
import type { LiteraturePaper } from "@/types/electron.d";
import { paperSnippetDragPayloads } from "./literature-block-drag";
import { setComposerDragData } from "@/lib/chat/composer-drag";

/** Viewport-level pointer handling for block hover and pick (Shift+Click toggles multi-select). */
export function LiteratureBlockPointerCapture({ paper }: { paper: LiteraturePaper }) {
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
  const dragHitRef = useRef<ReturnType<typeof hitTestBlock> | null>(null);

  useEffect(() => {
    if (!hasBlocks || !pdfDocumentProxy) return;

    let root: HTMLElement | null = null;
    let attached = false;
    let raf = 0;

    const clearTextSelection = () => window.getSelection()?.removeAllRanges();

    const onMouseDown = (e: MouseEvent) => {
      dragRef.current = false;
      dragHitRef.current = null;
      const info = pageInfoFromPoint(e.clientX, e.clientY);
      const hit = info ? hitTestBlock(blocks, info.pageIdx, info.x, info.y) : null;
      if (hit) dragHitRef.current = hit;

      const shiftPick = e.shiftKey;
      if (!shiftPick && !blockPickMode) return;
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
      const nextId = hit?.id ?? null;
      setHoveredBlockId(nextId);
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

    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-block-action-menu], [data-annotation-tooltip], [data-excerpt-session-bar]")) {
        return;
      }
      const info = pageInfoFromPoint(e.clientX, e.clientY);
      if (!info) return;
      const hit = hitTestBlock(blocks, info.pageIdx, info.x, info.y);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      clearTextSelection();
      toggleBlockSelection(hit, e.shiftKey);
    };

    const onDragStart = (e: DragEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        return;
      }
      const hit = dragHitRef.current;
      const selected =
        selectedBlockIds.length > 0
          ? selectedBlockIds
              .map((id) => blocks.find((b) => b.id === id))
              .filter((b): b is NonNullable<typeof b> => Boolean(b))
          : hit
            ? [hit]
            : [];
      if (selected.length === 0) {
        e.preventDefault();
        return;
      }
      const payloads = paperSnippetDragPayloads({ paper, blocks: selected });
      if (payloads.length === 0) {
        e.preventDefault();
        return;
      }
      if (!e.dataTransfer) {
        e.preventDefault();
        return;
      }
      dragRef.current = true;
      setComposerDragData(e.dataTransfer, payloads);
      clearTextSelection();
    };

    const attach = () => {
      if (attached) return;
      root = findLiteraturePdfScrollRoot(viewportRef);
      if (!root) {
        raf = requestAnimationFrame(attach);
        return;
      }
      attached = true;
      root.draggable = true;
      root.addEventListener("dragstart", onDragStart);
      root.addEventListener("contextmenu", onContextMenu, true);
      root.addEventListener("mousedown", onMouseDown, true);
      root.addEventListener("mousemove", onMouseMove, { passive: true });
      root.addEventListener("mouseleave", onMouseLeave);
      root.addEventListener("click", onClick, true);
    };

    attach();

    return () => {
      cancelAnimationFrame(raf);
      if (root && attached) {
        root.draggable = false;
        root.removeEventListener("dragstart", onDragStart);
        root.removeEventListener("contextmenu", onContextMenu, true);
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
    selectedBlockIds,
    paper,
    pdfDocumentProxy,
    viewportRef,
    setHoveredBlockId,
    clearBlockSelection,
    toggleBlockSelection,
  ]);

  return null;
}
