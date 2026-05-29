import { useEffect, useRef, useMemo, useCallback } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  lineNumbers,
  highlightSpecialChars,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { latex } from "codemirror-lang-latex";
import { unifiedMergeView, getChunks } from "@codemirror/merge";
import { Transaction } from "@codemirror/state";
import { useTheme } from "next-themes";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useChangesStore } from "@/stores/changes-store";
import { compileCurrentDocument } from "@/stores/compile-store";
import { createLogger } from "@/services/logger";
import { ChangesBar } from "./changes-bar";

const log = createLogger("editor");

const mergeCompartment = new Compartment();

export function LatexEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isMergeActiveRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const fileId = activeTab?.kind === "file" || activeTab?.kind === "texworkspace" ? activeTab.fileId : null;

  const refreshFileContent = useDocumentStore((s) => s.refreshFileContent);
  const jumpTarget = useDocumentStore((s) => s.jumpTarget);
  const changes = useChangesStore((s) => s.changes);

  const activeChange = useMemo(() => {
    if (!fileId) return null;
    return changes.find((c) => c.filePath === fileId) ?? null;
  }, [changes, fileId]);

  const totalChanges = changes.length;
  const changeIndex = useMemo(() => {
    if (!activeChange) return 0;
    const idx = changes.findIndex((c) => c.id === activeChange.id);
    return Math.max(0, idx);
  }, [changes, activeChange]);

  const themeCompartment = useMemo(() => new Compartment(), []);

  const deactivateMerge = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    isMergeActiveRef.current = false;
    view.dispatch({ effects: mergeCompartment.reconfigure([]) });
  }, []);

  const handleAcceptCurrent = useCallback(async () => {
    if (!activeChange) return;
    await useChangesStore.getState().acceptChange(activeChange.id);
    deactivateMerge();
    compileCurrentDocument();
  }, [activeChange, deactivateMerge]);

  const handleRejectCurrent = useCallback(async () => {
    if (!activeChange) return;
    const docId = fileId;
    const oldContent = activeChange.oldContent;
    if (docId) {
      useDocumentStore.getState().setContent(docId, oldContent);
    }
    await useChangesStore.getState().rejectChange(activeChange.id);
    // Replace editor doc with oldContent after deactivating merge view
    const view = viewRef.current;
    if (view) {
      isMergeActiveRef.current = false;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: oldContent },
        effects: mergeCompartment.reconfigure([]),
        annotations: Transaction.addToHistory.of(false),
      });
    }
    compileCurrentDocument();
  }, [activeChange, fileId]);

  // Load file content when tab changes
  useEffect(() => {
    if (fileId) {
      refreshFileContent(fileId);
    }
  }, [fileId, refreshFileContent]);

  // Create/destroy editor on file switch
  useEffect(() => {
    if (!containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }
    isMergeActiveRef.current = false;

    const content = fileId
      ? (useDocumentStore.getState().fileContents.get(fileId)?.content ?? "")
      : "";

    const setContent = useDocumentStore.getState().setContent;
    const currentFileId = fileId;
    const change = useChangesStore.getState().getChangeForFile(fileId ?? "");
    const hasChange = !!change;

    const state = EditorState.create({
      doc: hasChange ? change!.newContent : (content || "% Open a file to start editing\n"),
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        drawSelection(),
        highlightActiveLine(),
        history(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
          {
            key: "Mod-y",
            run: () => {
              if (!isMergeActiveRef.current) return false;
              const ch = useChangesStore.getState().getChangeForFile(currentFileId ?? "");
              if (!ch) return false;
              useChangesStore.getState().acceptChange(ch.id).then(() => {
                const view = viewRef.current;
                if (view) {
                  isMergeActiveRef.current = false;
                  view.dispatch({ effects: mergeCompartment.reconfigure([]) });
                }
                compileCurrentDocument();
              });
              return true;
            },
          },
          {
            key: "Mod-n",
            run: () => {
              if (!isMergeActiveRef.current) return false;
              const ch = useChangesStore.getState().getChangeForFile(currentFileId ?? "");
              if (!ch) return false;
              const docId = fileId;
              if (docId && ch) {
                useDocumentStore.getState().setContent(docId, ch.oldContent);
              }
              useChangesStore.getState().rejectChange(ch.id).then(() => {
                const view = viewRef.current;
                if (view) {
                  isMergeActiveRef.current = false;
                  view.dispatch({ effects: mergeCompartment.reconfigure([]) });
                }
                compileCurrentDocument();
              });
              return true;
            },
          },
        ]),
        latex(),
        syntaxHighlighting(defaultHighlightStyle),
        themeCompartment.of(isDark ? oneDark : []),
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
        mergeCompartment.of(
          hasChange
            ? unifiedMergeView({
                original: change!.oldContent,
                highlightChanges: true,
                gutter: true,
                mergeControls: true,
              })
            : [],
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && currentFileId && !isMergeActiveRef.current) {
            setContent(currentFileId, update.state.doc.toString());
          }
          // Auto-resolve when all chunks accepted/rejected
          if (isMergeActiveRef.current) {
            const result = getChunks(update.state);
            if (result && result.chunks.length === 0) {
              const finalContent = update.state.doc.toString();
              const ch = useChangesStore.getState().getChangeForFile(currentFileId ?? "");
              if (ch) {
                setTimeout(() => {
                  deactivateMerge();
                  if (finalContent === ch.newContent) {
                    useChangesStore.getState().acceptChange(ch.id);
                  } else if (finalContent === ch.oldContent) {
                    useChangesStore.getState().rejectChange(ch.id);
                  }
                }, 0);
              }
            }
          }
        }),
      ],
    });

    if (hasChange) isMergeActiveRef.current = true;

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    view.focus();
    if (currentFileId) useDocumentStore.getState().setActiveFile(currentFileId);

    const handleFocus = () => {
      if (currentFileId) useDocumentStore.getState().setActiveFile(currentFileId);
    };
    const handleBlur = () => {
      useDocumentStore.getState().setActiveFile("");
    };
    view.contentDOM.addEventListener("focus", handleFocus);
    view.contentDOM.addEventListener("blur", handleBlur);

    return () => {
      view.contentDOM.removeEventListener("focus", handleFocus);
      view.contentDOM.removeEventListener("blur", handleBlur);
      view.destroy();
      viewRef.current = null;
    };
  }, [fileId]);

  // ✂── Theme change — reconfigure via compartment (no destroy/recreate) ──

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(isDark ? oneDark : []),
    });
  }, [isDark]);

  // Track activeChange identity to detect stacked edits (merged change replaces previous)
  const activeChangeIdRef = useRef<string | null>(null);

  // Merge view activation — matches archived latex-editor.tsx pattern
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Activate on new change OR when change identity changes (stacked edit merged)
    const changeId = activeChange?.id ?? null;
    const isNewChange = changeId !== null && changeId !== activeChangeIdRef.current;

    if (activeChange && (!isMergeActiveRef.current || isNewChange)) {
      activeChangeIdRef.current = changeId;
      isMergeActiveRef.current = true;
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: activeChange.newContent },
          effects: mergeCompartment.reconfigure(
            unifiedMergeView({
              original: activeChange.oldContent,
              highlightChanges: true,
              gutter: true,
              mergeControls: true,
            }),
          ),
          annotations: Transaction.addToHistory.of(false),
        });
      } catch (err) {
        log.error("merge activation failed", err);
        isMergeActiveRef.current = false;
      }
    } else if (!activeChange && isMergeActiveRef.current) {
      deactivateMerge();
    }
  }, [activeChange, deactivateMerge]);

  // SyncTeX jump-to-position
  useEffect(() => {
    if (jumpTarget === null || !viewRef.current) return;
    const view = viewRef.current;
    const pos = Math.min(jumpTarget, view.state.doc.length);
    view.dispatch({
      selection: { anchor: pos },
      effects: [EditorView.scrollIntoView(pos, { y: "center" })],
    });
    useDocumentStore.setState({ jumpTarget: null });
  }, [jumpTarget]);

  return (
    <div className="flex h-full flex-col min-h-0">
      {activeChange && (
        <ChangesBar
          change={activeChange}
          changeIndex={changeIndex}
          totalChanges={totalChanges}
          onAcceptAll={handleAcceptCurrent}
          onRejectAll={handleRejectCurrent}
          onPrevChange={totalChanges > 1 ? () => {
            const prevIdx = (changeIndex - 1 + changes.length) % changes.length;
            const prev = changes[prevIdx];
            useRightPanelStore.getState().openFile(prev.filePath, prev.filePath, prev.filePath.split("/").pop() || "");
          } : undefined}
          onNextChange={totalChanges > 1 ? () => {
            const nextIdx = (changeIndex + 1) % changes.length;
            const next = changes[nextIdx];
            useRightPanelStore.getState().openFile(next.filePath, next.filePath, next.filePath.split("/").pop() || "");
          } : undefined}
        />
      )}
      <div ref={containerRef} className="flex-1 overflow-auto [&_.cm-editor]:h-full" />
    </div>
  );
}
