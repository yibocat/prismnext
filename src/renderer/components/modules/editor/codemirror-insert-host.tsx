import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { SelectionInsertAction } from "@/components/modules/shared/selection-insert-action";
import { insertCodeToChat, lineRangeFromSelection } from "@/lib/chat/insert-to-chat";
import { getEditorSelectionChipPosition } from "@/lib/editor/selection-anchor";
import type { CodeSnippetRequest } from "@/lib/chat/context-insert";
import { cn } from "@/lib/utils";

export interface CodeMirrorInsertHostProps {
  viewRef: RefObject<EditorView | null>;
  filePath: string;
  fileId?: string;
  source: CodeSnippetRequest["source"];
  sourceTabId?: string;
  enabled?: boolean;
  /** `fill` = stretch in tab editor; `content` = natural height (inline git diff). */
  layout?: "fill" | "content";
  /** Bump when EditorView is created/destroyed so listeners re-attach. */
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [chipPos, setChipPos] = useState<{ left: number; top: number } | null>(null);

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

  useEffect(() => {
    if (!enabled) {
      dismissAction();
      return;
    }

    const view = viewRef.current;
    const container = containerRef.current;
    if (!view || !container) return;

    const scheduleUpdate = () => {
      // Wait for CodeMirror to paint .cm-selectionBackground before measuring.
      requestAnimationFrame(() => {
        requestAnimationFrame(updateActionPosition);
      });
    };

    const onMouseUp = () => scheduleUpdate();
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || e.key.startsWith("Arrow")) scheduleUpdate();
    };

    view.contentDOM.addEventListener("mouseup", onMouseUp);
    view.contentDOM.addEventListener("keyup", onKeyUp);
    container.addEventListener("mouseup", onMouseUp);

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
      view.contentDOM.removeEventListener("mouseup", onMouseUp);
      view.contentDOM.removeEventListener("keyup", onKeyUp);
      container.removeEventListener("mouseup", onMouseUp);
      view.scrollDOM.removeEventListener("scroll", onScroll);
      scrollRoot?.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
    };
  }, [viewRef, enabled, viewReadySignal, updateActionPosition, dismissAction]);

  useEffect(() => {
    if (!hasSelection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        runInsert();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
        anchor="viewport"
        placement="selection-top-right"
        shortcut="⌘L"
        label="Add to Chat"
        onInsert={runInsert}
        onDismiss={dismissAction}
      />
    </div>
  );
}
