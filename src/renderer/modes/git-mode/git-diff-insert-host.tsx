import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import type { MergeView } from "@codemirror/merge";
import type { EditorView } from "@codemirror/view";
import { toast } from "sonner";
import { SelectionInsertAction } from "@/components/modules/shared/selection-insert-action";
import { insertGitDiffToChat } from "@/lib/chat/insert-to-chat";
import { getEditorSelectionChipPositionInContainer } from "@/lib/editor/selection-anchor";
import {
  resolveDeletionWidgetSelection,
  resolveFromSplit,
  resolveFromUnified,
} from "@/lib/git/diff-hunk-snippet";
import { matchesShortcutEvent, shortcutChordLabel } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

export interface GitDiffInsertHostProps {
  filePath: string;
  oldContent: string;
  newContent: string;
  layout: "unified" | "split";
  unifiedViewRef: RefObject<EditorView | null>;
  splitViewRef: RefObject<MergeView | null>;
  sourceTabId?: string;
  viewReadySignal?: number;
  children: ReactNode;
}

function chipFromDomSelection(container: HTMLElement): { left: number; top: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (rect.width < 1 && rect.height < 1) return null;

  const bounds = container.getBoundingClientRect();
  const rightX = rect.right - bounds.left;
  const top = rect.top - bounds.top - 28;

  return {
    left: Math.max(0, Math.min(rightX, bounds.width)),
    top: Math.max(0, top),
  };
}

function activeSplitView(merge: MergeView): EditorView | null {
  const aSel = merge.a.state.selection.main;
  const bSel = merge.b.state.selection.main;
  if (!aSel.empty && bSel.empty) return merge.a;
  if (aSel.empty && !bSel.empty) return merge.b;
  if (!aSel.empty && !bSel.empty) {
    const focused = document.activeElement;
    return merge.b.dom.contains(focused) ? merge.b : merge.a;
  }
  return null;
}

/** Git diff selection → Add to Chat (unified + split, hunk-expanded). */
export function GitDiffInsertHost({
  filePath,
  oldContent,
  newContent,
  layout,
  unifiedViewRef,
  splitViewRef,
  sourceTabId,
  viewReadySignal = 0,
  children,
}: GitDiffInsertHostProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [chipPos, setChipPos] = useState<{ left: number; top: number } | null>(null);

  const dismissAction = useCallback(() => {
    setHasSelection(false);
    setChipPos(null);
  }, []);

  const updateActionPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      dismissAction();
      return;
    }

    if (layout === "split") {
      const merge = splitViewRef.current;
      if (!merge) {
        dismissAction();
        return;
      }
      const view = activeSplitView(merge);
      if (!view) {
        dismissAction();
        return;
      }
      const pos = getEditorSelectionChipPositionInContainer(view, container);
      if (!pos) {
        dismissAction();
        return;
      }
      setHasSelection(true);
      setChipPos(pos);
      return;
    }

    const view = unifiedViewRef.current;
    if (!view) {
      dismissAction();
      return;
    }

    const cmPos = getEditorSelectionChipPositionInContainer(view, container);
    if (cmPos) {
      setHasSelection(true);
      setChipPos(cmPos);
      return;
    }

    const domSel = window.getSelection();
    const node = domSel?.anchorNode;
    const el = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement) as
      | HTMLElement
      | null
      | undefined;
    if (el?.closest(".cm-deletedChunk") && container.contains(el)) {
      const domPos = chipFromDomSelection(container);
      if (domPos) {
        setHasSelection(true);
        setChipPos(domPos);
        return;
      }
    }

    dismissAction();
  }, [layout, unifiedViewRef, splitViewRef, dismissAction]);

  const runInsert = useCallback(() => {
    if (!filePath) return false;

    let snippet = null;

    if (layout === "split") {
      const merge = splitViewRef.current;
      if (!merge) return false;
      snippet = resolveFromSplit(merge, oldContent, newContent, filePath);
    } else {
      const view = unifiedViewRef.current;
      const container = containerRef.current;
      if (!view) return false;

      const main = view.state.selection.main;
      if (!main.empty) {
        const from = Math.min(main.anchor, main.head);
        const to = Math.max(main.anchor, main.head);
        snippet = resolveFromUnified(view, oldContent, newContent, filePath, from, to);
      } else if (container) {
        snippet = resolveDeletionWidgetSelection(
          view,
          container,
          oldContent,
          newContent,
          filePath,
        );
      }
    }

    if (!snippet) {
      toast.info("请先在 diff 中选中有改动的区域");
      return false;
    }

    const ok = insertGitDiffToChat({ ...snippet, sourceTabId, quiet: true });
    if (ok) dismissAction();
    return ok;
  }, [
    filePath,
    layout,
    oldContent,
    newContent,
    sourceTabId,
    unifiedViewRef,
    splitViewRef,
    dismissAction,
  ]);

  useEffect(() => {
    const scheduleUpdate = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(updateActionPosition);
      });
    };

    const views: EditorView[] = [];
    if (layout === "split") {
      const merge = splitViewRef.current;
      if (merge) views.push(merge.a, merge.b);
    } else {
      const view = unifiedViewRef.current;
      if (view) views.push(view);
    }

    if (views.length === 0) {
      dismissAction();
      return;
    }

    const container = containerRef.current;
    const onMouseUp = () => scheduleUpdate();
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || e.key.startsWith("Arrow")) scheduleUpdate();
    };
    const onSelectionChange = () => scheduleUpdate();

    for (const view of views) {
      view.contentDOM.addEventListener("mouseup", onMouseUp);
      view.contentDOM.addEventListener("keyup", onKeyUp);
      view.scrollDOM.addEventListener("scroll", onMouseUp, { passive: true });
    }
    container?.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);

    const onResize = () => {
      if (hasSelection) updateActionPosition();
    };
    window.addEventListener("resize", onResize);

    return () => {
      for (const view of views) {
        view.contentDOM.removeEventListener("mouseup", onMouseUp);
        view.contentDOM.removeEventListener("keyup", onKeyUp);
        view.scrollDOM.removeEventListener("scroll", onMouseUp);
      }
      container?.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("resize", onResize);
    };
  }, [
    layout,
    unifiedViewRef,
    splitViewRef,
    viewReadySignal,
    updateActionPosition,
    dismissAction,
    hasSelection,
  ]);

  useEffect(() => {
    if (!hasSelection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌥L / Alt+L — capture so the chord does not leak to the focused editor.
      if (!matchesShortcutEvent("workspace.insertToChat", e)) return;
      e.preventDefault();
      e.stopPropagation();
      runInsert();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [hasSelection, runInsert]);

  return (
    <div ref={containerRef} className="relative w-full min-h-0 flex flex-col overflow-visible">
      {children}
      <SelectionInsertAction
        open={hasSelection && !!chipPos}
        x={chipPos?.left ?? 0}
        y={chipPos?.top ?? 0}
        anchor="parent"
        placement="selection-top-right"
        shortcut={shortcutChordLabel("workspace.insertToChat")}
        label={t("common.addToChat")}
        onInsert={runInsert}
        onDismiss={dismissAction}
      />
    </div>
  );
}
