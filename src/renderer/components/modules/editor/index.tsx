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
import { saveViewerPosition, loadViewerPosition } from "@/lib/viewer-position";
import { useTabContext } from "@/lib/tab-context";

const log = createLogger("editor");

const mergeCompartment = new Compartment();

export function LatexEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isMergeActiveRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const { tab, isActive } = useTabContext();
  const fileId = tab.kind === "file" || tab.kind === "texworkspace" ? tab.fileId : null;
  const isTexworkspace = tab.kind === "texworkspace";

  const refreshFileContent = useDocumentStore((s) => s.refreshFileContent);
  const jumpTarget = useDocumentStore((s) => s.jumpTarget);
  const jumpToLine = useDocumentStore((s) => s.jumpToLine);
  const requestJumpToLine = useDocumentStore((s) => s.requestJumpToLine);
  const changes = useChangesStore((s) => s.changes);
  const contentVersion = useDocumentStore((s) => s.contentVersion);

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
    if (isTexworkspace) compileCurrentDocument();
  }, [activeChange, deactivateMerge, isTexworkspace]);

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
    if (isTexworkspace) compileCurrentDocument();
  }, [activeChange, fileId, isTexworkspace]);

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
      ? (useDocumentStore.getState().openedContents.get(fileId)?.content ?? "")
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
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              if (currentFileId) {
                const isTexworkspace = useRightPanelStore.getState().tabs.find(
                  (t) => t.id === useRightPanelStore.getState().activeTabId,
                )?.kind === "texworkspace";
                useDocumentStore.getState().saveFile(currentFileId).then(() => {
                  if (isTexworkspace) compileCurrentDocument();
                });
              }
              return true;
            },
          },
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

    if (isActive) {
      view.focus();
    }
    if (currentFileId && isActive) useDocumentStore.getState().setActiveFile(currentFileId);

    // Restore saved cursor / scroll position from a previous session
    if (currentFileId) {
      const saved = loadViewerPosition(currentFileId);
      if (saved) {
        if (saved.cursorPos != null && saved.cursorPos <= view.state.doc.length) {
          view.dispatch({ selection: { anchor: saved.cursorPos } });
        }
        if (saved.scrollTop != null && saved.scrollTop > 0) {
          const st = saved.scrollTop; // narrow for closure
          requestAnimationFrame(() => {
            view.scrollDOM.scrollTop = st;
          });
        }
      }
    }

    const handleFocus = () => {
      if (currentFileId) useDocumentStore.getState().setActiveFile(currentFileId);
    };
    const handleBlur = () => {
      useDocumentStore.getState().setActiveFile("");
    };
    view.contentDOM.addEventListener("focus", handleFocus);
    view.contentDOM.addEventListener("blur", handleBlur);

    return () => {
      // Save position one last time before destroying the editor
      if (currentFileId) {
        saveViewerPosition(currentFileId, {
          cursorPos: view.state.selection.main.head,
          scrollTop: view.scrollDOM.scrollTop,
        });
      }
      view.contentDOM.removeEventListener("focus", handleFocus);
      view.contentDOM.removeEventListener("blur", handleBlur);
      view.destroy();
      viewRef.current = null;
    };
  }, [fileId]);

  // ─── Periodic position save (cross-session persistence) ───

  useEffect(() => {
    if (!fileId) return;
    const timer = setInterval(() => {
      const view = viewRef.current;
      if (!view || isMergeActiveRef.current) return;
      saveViewerPosition(fileId, {
        cursorPos: view.state.selection.main.head,
        scrollTop: view.scrollDOM.scrollTop,
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [fileId]);

  // ─── Focus management: focus when tab becomes active, blur when inactive ───

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (isActive) {
      view.focus();
      if (fileId) useDocumentStore.getState().setActiveFile(fileId);
    } else {
      // Blur only if this editor currently owns focus (prevents hidden editors
      // from capturing keyboard events while another tab is active)
      if (view.contentDOM.contains(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }
    }
  }, [isActive]);

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

  // ── Reload editor content when external changes update the active file ──
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !fileId || isMergeActiveRef.current) return;
    const storeContent = useDocumentStore.getState().openedContents.get(fileId)?.content;
    if (storeContent === undefined) return;
    // Only update if content actually differs — skip dirty files (editor owns truth)
    if (view.state.doc.toString() === storeContent) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: storeContent },
      annotations: Transaction.addToHistory.of(false),
    });
  }, [contentVersion]);

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

  // TOC/Labels/Citations jump-to-line
  useEffect(() => {
    if (jumpToLine === null || !viewRef.current) return;
    const { fileId: targetFileId, line } = jumpToLine;
    const view = viewRef.current;

    // First switch to the target file if different
    if (targetFileId !== fileId) {
      useDocumentStore.getState().setActiveFile(targetFileId);
      // Wait for the file to load, then jump
      const checkLoaded = setInterval(() => {
        const state = useDocumentStore.getState();
        if (state.activeFileId !== targetFileId) return;
        const content = state.openedContents.get(targetFileId)?.content;
        if (content === undefined) return;
        clearInterval(checkLoaded);

        // Convert line number to document position
        const targetView = viewRef.current;
        if (!targetView) return;
        const docLines = targetView.state.doc.toString().split("\n");
        let pos = 0;
        for (let i = 0; i < Math.min(line - 1, docLines.length); i++) {
          pos += docLines[i].length + 1; // +1 for newline
        }
        pos = Math.min(pos, targetView.state.doc.length);
        targetView.dispatch({
          selection: { anchor: pos },
          effects: [EditorView.scrollIntoView(pos, { y: "center" })],
        });
        useDocumentStore.setState({ jumpToLine: null });
      }, 50);
      return () => clearInterval(checkLoaded);
    }

    // Same file — jump directly
    const docLines = view.state.doc.toString().split("\n");
    let pos = 0;
    for (let i = 0; i < Math.min(line - 1, docLines.length); i++) {
      pos += docLines[i].length + 1;
    }
    pos = Math.min(pos, view.state.doc.length);
    view.dispatch({
      selection: { anchor: pos },
      effects: [EditorView.scrollIntoView(pos, { y: "center" })],
    });
    useDocumentStore.setState({ jumpToLine: null });
  }, [jumpToLine, fileId]);

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
