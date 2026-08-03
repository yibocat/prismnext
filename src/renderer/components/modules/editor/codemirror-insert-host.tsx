import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { EditorView } from "@codemirror/view";
import { SelectionInsertAction } from "@/components/modules/shared/selection-insert-action";
import { insertCodeToChat, lineRangeFromSelection } from "@/lib/chat/insert-to-chat";
import { codeSnippetDragPayload } from "@/lib/chat/code-snippet-drag";
import { getEditorSelectionChipPosition } from "@/lib/editor/selection-anchor";
import type { ViewportChipPosition } from "@/lib/editor/selection-anchor";
import type { CodeSnippetRequest } from "@/lib/chat/context-insert";
import type { SelectionChipPlacement } from "@/lib/selection-chip-position";
import { matchesShortcutEvent, shortcutChordLabel } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

export interface CodeMirrorInsertHostProps {
  viewRef: RefObject<EditorView | null>;
  filePath: string;
  fileId?: string;
  source: CodeSnippetRequest["source"];
  sourceTabId?: string;
  enabled?: boolean;
  layout?: "fill" | "content";
  viewReadySignal?: number;
  children: ReactNode;
}

/** CodeMirror selection → Add to Chat (Files, TeX Workspace, Git diff). */
export function CodeMirrorInsertHost({
  viewRef,
  filePath,
  fileId,
  source,
  sourceTabId,
  enabled = true,
  layout = "fill",
  viewReadySignal = 0,
  children,
}: CodeMirrorInsertHostProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [chipPos, setChipPos] = useState<ViewportChipPosition | null>(null);

  const dismissAction = useCallback(() => {
    setHasSelection(false);
    setChipPos(null);
  }, []);

  const updateActionPosition = useCallback(() => {
    const view = viewRef.current;
    if (!view || !enabled) {
      dismissAction();
      return;
    }

    const pos = getEditorSelectionChipPosition(view);
    if (!pos) {
      dismissAction();
      return;
    }

    setHasSelection(true);
    setChipPos(pos);
  }, [viewRef, enabled, dismissAction]);

  const runInsert = useCallback(() => {
    const view = viewRef.current;
    if (!view || !filePath) return false;

    const main = view.state.selection.main;
    if (main.empty) return false;

    const from = Math.min(main.anchor, main.head);
    const to = Math.max(main.anchor, main.head);
    const doc = view.state.doc.toString();
    const range = lineRangeFromSelection(doc, from, to);
    if (!range.text.trim()) return false;

    const ok = insertCodeToChat({
      filePath,
      fileId,
      source,
      sourceTabId,
      quiet: true,
      ...range,
    });

    if (ok) {
      view.dispatch({ selection: { anchor: main.anchor, head: main.head } });
      dismissAction();
    }
    return ok;
  }, [viewRef, filePath, fileId, source, sourceTabId, dismissAction]);

  const getDragPayloads = useCallback(() => {
    const view = viewRef.current;
    if (!view || !filePath) return null;

    const main = view.state.selection.main;
    if (main.empty) return null;

    const from = Math.min(main.anchor, main.head);
    const to = Math.max(main.anchor, main.head);
    const doc = view.state.doc.toString();
    const range = lineRangeFromSelection(doc, from, to);
    if (!range.text.trim()) return null;

    return [
      codeSnippetDragPayload({
        filePath,
        fileId,
        source,
        sourceTabId,
        ...range,
      }),
    ];
  }, [viewRef, filePath, fileId, source, sourceTabId]);

  useEffect(() => {
    if (!enabled) {
      dismissAction();
      return;
    }

    const view = viewRef.current;
    const container = containerRef.current;
    if (!view || !container) return;

    const scheduleUpdate = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(updateActionPosition);
      });
    };

    let dragRaf = 0;
    const dragLoop = () => {
      updateActionPosition();
      dragRaf = requestAnimationFrame(dragLoop);
    };

    const onMouseDown = () => {
      cancelAnimationFrame(dragRaf);
      dragRaf = requestAnimationFrame(dragLoop);
    };
    const onMouseUp = () => {
      cancelAnimationFrame(dragRaf);
      scheduleUpdate();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || e.key.startsWith("Arrow")) scheduleUpdate();
    };
    const onSelectionChange = () => scheduleUpdate();

    view.contentDOM.addEventListener("mousedown", onMouseDown);
    view.contentDOM.addEventListener("mouseup", onMouseUp);
    view.contentDOM.addEventListener("keyup", onKeyUp);
    container.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);

    const onScroll = () => {
      if (!view.state.selection.main.empty) scheduleUpdate();
    };
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    const scrollRoot = container.querySelector(".overflow-auto");
    scrollRoot?.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });

    const onResize = () => {
      if (!view.state.selection.main.empty) updateActionPosition();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(dragRaf);
      view.contentDOM.removeEventListener("mousedown", onMouseDown);
      view.contentDOM.removeEventListener("mouseup", onMouseUp);
      view.contentDOM.removeEventListener("keyup", onKeyUp);
      container.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      view.scrollDOM.removeEventListener("scroll", onScroll);
      scrollRoot?.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
    };
  }, [viewRef, enabled, viewReadySignal, updateActionPosition, dismissAction]);

  useEffect(() => {
    if (!hasSelection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesShortcutEvent("workspace.insertToChat", e)) return;
      e.preventDefault();
      e.stopPropagation();
      runInsert();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [hasSelection, runInsert]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full min-h-0 flex flex-col",
        layout === "fill" ? "h-full flex-1 overflow-hidden" : "overflow-visible",
      )}
    >
      {children}
      <SelectionInsertAction
        open={enabled && hasSelection && !!chipPos}
        x={chipPos?.left ?? 0}
        y={chipPos?.top ?? 0}
        chipPlacement={chipPos?.placement as SelectionChipPlacement | undefined}
        anchor="viewport"
        placement="selection-top-right"
        shortcut={shortcutChordLabel("workspace.insertToChat")}
        label={t("common.addToChat")}
        onInsert={runInsert}
        onDismiss={dismissAction}
        getDragPayloads={getDragPayloads}
      />
    </div>
  );
}
