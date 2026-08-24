import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  SelectionTooltip,
  usePdf,
  useSelectionDimensions,
  type ColoredHighlight,
} from "@anaralabs/lector";
import { appMenuItemClass, appMenuLabelClass } from "@/components/ui/app-menu";
import { appPopoverListClass } from "@/components/ui/app-popover";
import { insertPaperToChat } from "@/lib/chat/insert-to-chat";
import { insertPaperQuoteIntoNote } from "@/lib/literature/insert-paper-quote";
import {
  blocksUnionClientRect,
  clampFloatingMenuPosition,
} from "@/lib/literature/literature-block-hit-test";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import type { LiteraturePaper } from "@/types/electron.d";
import type { PaperExtractBlock } from "../../../shared/literature/paper-extract-block";
import {
  blockRegions,
  mergeBlockMarkdown,
} from "../../../shared/literature/paper-extract-block";
import { useLiteratureBlocks } from "./literature-block-context";
import {
  excerptFromTextSelection,
  mergeExcerptMarkdown,
  type PdfTextExcerpt,
} from "./literature-pdf-excerpt";
import { LITERATURE_PDF_HIGHLIGHT_COLORS } from "./literature-pdf-highlight-colors";
import {
  preciseSelectionHighlights,
  preciseSelectionText,
} from "@/lib/literature/literature-pdf-selection-rects";

const menuPanelClass = cn(appPopoverListClass, "min-w-[11rem] pointer-events-auto");
const menuItemClass = cn(appMenuItemClass, "w-full text-left hover:bg-accent");

interface LiteraturePdfActionMenuProps {
  paper: LiteraturePaper;
  onHighlight?: (highlight: ColoredHighlight) => void;
}

function clearTextSelection() {
  window.getSelection()?.removeAllRanges();
}

/** Fixed panel anchored to PDF viewport bottom-left — no measure-then-show flash. */
function viewportPanelStyle(viewportRef: React.RefObject<HTMLElement | null>) {
  const host = viewportRef.current?.getBoundingClientRect();
  const pad = 12;
  return {
    position: "fixed" as const,
    left: (host?.left ?? pad) + pad,
    bottom: host ? Math.max(pad, window.innerHeight - host.bottom + pad) : pad,
    zIndex: 100,
  };
}

function blockToHighlightRects(block: PaperExtractBlock): ColoredHighlight["rectangles"] {
  const pageIdxs = [...new Set(blockRegions(block).map((r) => r.pageIdx))].sort((a, b) => a - b);
  const rectangles: ColoredHighlight["rectangles"] = [];

  for (const pageIdx of pageIdxs) {
    const page = pageIdx + 1;
    const pageShell = pageShellForPage(page);
    if (!pageShell) continue;
    const w = pageShell.clientWidth || 1;
    const h = pageShell.clientHeight || 1;
    for (const [x0, y0, x1, y1] of blockRegions(block)
      .filter((r) => r.pageIdx === pageIdx)
      .map((r) => r.bbox)) {
      rectangles.push({
        pageNumber: page,
        left: x0 * w,
        top: y0 * h,
        width: (x1 - x0) * w,
        height: (y1 - y0) * h,
      });
    }
  }

  return rectangles;
}

function pageShellForPage(page: number): HTMLElement | null {
  const pageEl = document.querySelector(
    `[data-page-number="${page}"]`,
  ) as HTMLElement | null;
  return (pageEl?.closest(".prism-pdf-page") as HTMLElement | null) ?? pageEl;
}

function resolveTextPayload(
  queued: PdfTextExcerpt[],
  dim: ReturnType<ReturnType<typeof useSelectionDimensions>["getDimension"]>,
  blocks: PaperExtractBlock[],
  hasBlocks: boolean,
): { markdown: string; page: number } | null {
  const parts = [...queued];
  if (dim?.text?.trim() && dim.highlights?.length) {
    const excerpt = excerptFromTextSelection(dim, blocks, hasBlocks);
    if (excerpt) parts.push(excerpt);
  }
  if (parts.length === 0) return null;
  return { markdown: mergeExcerptMarkdown(parts), page: parts[0]!.page };
}

function hasLiveTextSelection(): boolean {
  const sel = window.getSelection();
  return Boolean(sel && !sel.isCollapsed);
}

function ActionMenuPanel({
  paper,
  onHighlight,
  onDismiss,
  mode,
  selectedBlocks = [],
  queuedExcerpts = [],
}: LiteraturePdfActionMenuProps & {
  mode: "block" | "text" | "session";
  selectedBlocks?: PaperExtractBlock[];
  queuedExcerpts?: PdfTextExcerpt[];
  onDismiss?: () => void;
}) {
  const { getDimension } = useSelectionDimensions();
  const addColoredHighlight = usePdf((s) => s.addColoredHighlight);
  const zoom = usePdf((s) => s.zoom);
  const {
    blocks,
    hasBlocks,
    clearBlockSelection,
    addTextExcerpt,
    clearTextExcerptQueue,
  } = useLiteratureBlocks();
  const bibkey = paper.bibkey?.trim() || paper.id;

  const hasLiveSelection = hasLiveTextSelection();

  const blockMarkdown =
    selectedBlocks.length > 0 ? mergeBlockMarkdown(selectedBlocks, blocks) : "";

  const dismissAll = () => {
    if (mode === "block") clearBlockSelection();
    if (mode === "text" || mode === "session") {
      clearTextExcerptQueue();
      clearTextSelection();
    }
    onDismiss?.();
  };

  const handleSendToChat = () => {
    if (mode === "block") {
      if (!blockMarkdown.trim()) return;
      const single = selectedBlocks.length === 1 ? selectedBlocks[0]! : null;
      insertPaperToChat({
        bibkey,
        title: paper.title,
        page: (selectedBlocks[0]?.pageIdx ?? 0) + 1,
        paperId: paper.id,
        quotedText: blockMarkdown,
        ...(single ? { blockId: single.id, blockType: single.type } : {}),
        ...(hasBlocks ? { extractSource: "mineru" as const } : {}),
      });
      dismissAll();
      return;
    }
    const dim = getDimension();
    const payload = resolveTextPayload(queuedExcerpts, dim, blocks, hasBlocks);
    if (!payload) return;
    insertPaperToChat({
      bibkey,
      title: paper.title,
      page: payload.page,
      paperId: paper.id,
      quotedText: payload.markdown,
      ...(hasBlocks ? { extractSource: "mineru" as const } : {}),
    });
    dismissAll();
  };

  const handleInsertNote = () => {
    if (mode === "block") {
      if (!blockMarkdown.trim()) return;
      void insertPaperQuoteIntoNote(paper, blockMarkdown, (selectedBlocks[0]?.pageIdx ?? 0) + 1);
      dismissAll();
      return;
    }
    const dim = getDimension();
    const payload = resolveTextPayload(queuedExcerpts, dim, blocks, hasBlocks);
    if (!payload) return;
    void insertPaperQuoteIntoNote(paper, payload.markdown, payload.page);
    dismissAll();
  };

  const handleAddExcerpt = () => {
    const dim = getDimension();
    if (!dim?.text?.trim()) return;
    const excerpt = excerptFromTextSelection(dim, blocks, hasBlocks);
    if (!excerpt) return;
    addTextExcerpt(excerpt);
    clearTextSelection();
  };

  const handleHighlightColor = (color: string) => {
    if (mode === "block") {
      for (const block of selectedBlocks) {
        const rectangles = blockToHighlightRects(block);
        if (rectangles.length === 0) continue;
        const highlight: ColoredHighlight = {
          uuid: crypto.randomUUID(),
          pageNumber: rectangles[0]!.pageNumber,
          color,
          rectangles,
          text: block.markdown,
        };
        addColoredHighlight(highlight);
        onHighlight?.(highlight);
      }
      dismissAll();
      return;
    }

    const dim = getDimension();
    const preciseRects = preciseSelectionHighlights(zoom);
    const preciseText = preciseSelectionText();
    if (!preciseRects?.length) {
      if (!dim?.highlights[0]) return;
      const highlight: ColoredHighlight = {
        uuid: crypto.randomUUID(),
        pageNumber: dim.highlights[0].pageNumber,
        color,
        rectangles: dim.highlights,
        text: dim.text,
      };
      addColoredHighlight(highlight);
      onHighlight?.(highlight);
      dismissAll();
      return;
    }

    const highlight: ColoredHighlight = {
      uuid: crypto.randomUUID(),
      pageNumber: preciseRects[0]!.pageNumber,
      color,
      rectangles: preciseRects,
      text: preciseText ?? dim?.text ?? "",
    };
    addColoredHighlight(highlight);
    onHighlight?.(highlight);
    dismissAll();
  };

  const canSend =
    mode === "block"
      ? blockMarkdown.trim().length > 0
      : queuedExcerpts.length > 0 || hasLiveSelection;
  const canAddExcerpt = (mode === "text" || mode === "session") && hasLiveSelection;
  const showHighlight =
    mode === "block" ? selectedBlocks.length > 0 : hasLiveSelection;

  const statusLabel = (() => {
    if (mode === "block" && selectedBlocks.length > 1) {
      return `${selectedBlocks.length} blocks`;
    }
    if (mode === "session") {
      if (queuedExcerpts.length === 0) return "Multi-select";
      if (hasLiveSelection) {
        return `${queuedExcerpts.length} saved · add current`;
      }
      return `${queuedExcerpts.length} saved · select next`;
    }
    return null;
  })();

  return (
    <div className={menuPanelClass} data-annotation-tooltip>
      {statusLabel ? (
        <div className={cn(appMenuLabelClass, "px-2 normal-case tracking-normal")}>
          {statusLabel}
        </div>
      ) : null}

      <button
        type="button"
        className={menuItemClass}
        disabled={!canSend}
        onClick={handleSendToChat}
      >
        Send to Chat
      </button>
      <button
        type="button"
        className={menuItemClass}
        disabled={!canSend}
        onClick={handleInsertNote}
      >
        Insert into note
      </button>

      {canAddExcerpt ? (
        <button type="button" className={menuItemClass} onClick={handleAddExcerpt}>
          Keep selecting
        </button>
      ) : null}

      {showHighlight ? (
        <>
          <div className="mx-0.5 my-0.5 h-px bg-border" />
          <div className="px-2 py-1">
            <div className={cn(appMenuLabelClass, "px-0 pb-1")}>Highlight</div>
            <div className="flex flex-wrap gap-1">
              {LITERATURE_PDF_HIGHLIGHT_COLORS.map(({ color, label }) => (
                <Hint key={color} label={label}>
                  <button
                    type="button"
                    aria-label={label}
                    className="size-4 shrink-0 rounded-sm ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ backgroundColor: color }}
                    onClick={() => handleHighlightColor(color)}
                  />
                </Hint>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {onDismiss ? (
        <>
          <div className="mx-0.5 my-0.5 h-px bg-border" />
          <button type="button" className={menuItemClass} onClick={dismissAll}>
            Dismiss
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Block pick menu — fixed + portal, anchored to selected block union bbox. */
function BlockActionMenu({ paper, onHighlight }: LiteraturePdfActionMenuProps) {
  const viewportRef = usePdf((s) => s.viewportRef);
  const { selectedBlocks, clearBlockSelection } = useLiteratureBlocks();
  const [layoutNonce, setLayoutNonce] = useState(0);

  const blockIdsKey = selectedBlocks.map((b) => b.id).join(",");

  useEffect(() => {
    if (!blockIdsKey) return;
    const root = viewportRef.current;
    if (!root) return;
    const bump = () => setLayoutNonce((n) => n + 1);
    root.addEventListener("scroll", bump, { passive: true });
    window.addEventListener("resize", bump);
    return () => {
      root.removeEventListener("scroll", bump);
      window.removeEventListener("resize", bump);
    };
  }, [blockIdsKey, viewportRef]);

  const menuPos = useMemo(() => {
    if (!blockIdsKey) return null;
    const anchorRect = blocksUnionClientRect(selectedBlocks, viewportRef);
    if (!anchorRect) return null;
    // Estimated menu size — avoids measure → setState → re-measure loops.
    return clampFloatingMenuPosition(anchorRect, 180, 220);
  }, [blockIdsKey, layoutNonce, selectedBlocks, viewportRef]);

  if (!blockIdsKey || !menuPos) return null;

  const content = (
    <div
      className="pointer-events-auto fixed z-[100]"
      style={{ top: menuPos.top, left: menuPos.left }}
      data-block-action-menu
    >
      <ActionMenuPanel
        paper={paper}
        onHighlight={onHighlight}
        mode="block"
        selectedBlocks={selectedBlocks}
        onDismiss={() => clearBlockSelection()}
      />
    </div>
  );

  return createPortal(content, document.body);
}

/** Persistent panel during multi-excerpt session — visible immediately at PDF bottom-left. */
function ExcerptSessionPanel({ paper, onHighlight }: LiteraturePdfActionMenuProps) {
  const viewportRef = usePdf((s) => s.viewportRef);
  const { textExcerptQueue, excerptSessionActive, clearTextExcerptQueue } =
    useLiteratureBlocks();
  const [, setSelectionTick] = useState(0);

  useEffect(() => {
    const onChange = () => setSelectionTick((n) => n + 1);
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  if (!excerptSessionActive && textExcerptQueue.length === 0) return null;

  const content = (
    <div
      className="pointer-events-auto"
      style={viewportPanelStyle(viewportRef)}
      data-excerpt-session-bar
    >
      <ActionMenuPanel
        paper={paper}
        onHighlight={onHighlight}
        mode="session"
        queuedExcerpts={textExcerptQueue}
        onDismiss={() => clearTextExcerptQueue()}
      />
    </div>
  );

  return createPortal(content, document.body);
}

function TextActionMenu({ paper, onHighlight }: LiteraturePdfActionMenuProps) {
  const { excerptSessionActive } = useLiteratureBlocks();

  if (excerptSessionActive) return null;

  return (
    <SelectionTooltip>
      <ActionMenuPanel paper={paper} onHighlight={onHighlight} mode="text" />
    </SelectionTooltip>
  );
}

/**
 * Unified PDF selection / block-pick menu — one panel; structured Markdown when MinerU is available.
 */
export function LiteraturePdfActionMenu({
  paper,
  onHighlight,
}: LiteraturePdfActionMenuProps) {
  const { selectedBlocks, clearBlockSelection, excerptSessionActive } = useLiteratureBlocks();

  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && selectedBlocks.length > 0) {
        clearBlockSelection();
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [selectedBlocks.length, clearBlockSelection]);

  return (
    <>
      {selectedBlocks.length > 0 ? (
        <BlockActionMenu paper={paper} onHighlight={onHighlight} />
      ) : (
        <>
          <TextActionMenu paper={paper} onHighlight={onHighlight} />
          {excerptSessionActive ? (
            <ExcerptSessionPanel paper={paper} onHighlight={onHighlight} />
          ) : null}
        </>
      )}
    </>
  );
}
