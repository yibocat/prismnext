import { useEffect, useRef, useMemo, useCallback, useState } from "react";
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
import { editorChromeTheme, editorTypographyTheme } from "@/lib/editor-themes/editor-chrome";
import { getThemeExtensionSync, getThemeExtensionAsync } from "@/lib/editor-themes/registry";
import { diffDisplayTheme, diffDisplayThemeExtra, contentMetricsTheme } from "@/lib/editor-themes/diff-overrides";
import { useSettingsStore } from "@/stores/settings-store";
import type { EditorSyntaxThemeId } from "@/lib/editor-themes/types";
import { DEFAULT_SYNTAX_THEME } from "@/lib/editor-themes/types";
import { unifiedMergeView, getChunks } from "@codemirror/merge";
import { Transaction } from "@codemirror/state";
import { useTheme } from "next-themes";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useChangesStore } from "@/stores/changes-store";
import { useChatStore } from "@/stores/chat-store";
import { usePermissionStore } from "@/stores/permission-store";
import { createLogger } from "@/services/logger";
import { getLanguageLoader } from "@/lib/editor/language-mappings";
import { ChangesBar } from "./changes-bar";
import { saveViewerPosition, loadViewerPosition } from "@/lib/editor/viewer-position";
import { useTabContext } from "@/lib/workspace/tab-context";
import { CodeMirrorInsertHost } from "./codemirror-insert-host";

const log = createLogger("code-editor");

const mergeCompartment = new Compartment();

export function CodeEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [viewEpoch, setViewEpoch] = useState(0);
  const isMergeActiveRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const editorSyntaxTheme =
    (useSettingsStore((s) => s.settings.editorSyntaxTheme) as EditorSyntaxThemeId | undefined)
    ?? DEFAULT_SYNTAX_THEME;

  const { tab, isActive } = useTabContext();
  const fileId = tab.kind === "file" || tab.kind === "texworkspace" ? tab.fileId : null;
  const filePath = tab.filePath ?? "";
  const ext = (() => {
    const dot = filePath.lastIndexOf(".");
    return dot === -1 ? "" : filePath.slice(dot).toLowerCase();
  })();

  const changes = useChangesStore((s) => s.changes);
  const contentVersion = useDocumentStore((s) => s.contentVersion);
  // true when file content has been fetched into openedContents (no IPC pending)
  const contentLoaded = useDocumentStore((s) =>
    fileId ? s.openedContents.has(fileId) : true,
  );

  const activeChange = useMemo(() => {
    if (!fileId) return null;
    return changes.find((c) => c.filePath === fileId) ?? null;
  }, [changes, fileId]);

  const activeTabId = useChatStore((s) => s.activeTabId);
  const permissions = usePermissionStore((s) => s.permissions);
  const changesBarMode = useMemo(() => {
    if (!activeChange) return "review" as const;
    const hasPermission = permissions.some(
      (p) => p.tabId === activeTabId && p.toolCallId === activeChange.id,
    );
    return hasPermission ? ("permission" as const) : ("review" as const);
  }, [permissions, activeTabId, activeChange]);

  const totalChanges = changes.length;
  const changeIndex = useMemo(() => {
    if (!activeChange) return 0;
    const idx = changes.findIndex((c) => c.id === activeChange.id);
    return Math.max(0, idx);
  }, [changes, activeChange]);

  const themeCompartment = useMemo(() => new Compartment(), []);
  const languageCompartment = useMemo(() => new Compartment(), []);

  const deactivateMerge = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    isMergeActiveRef.current = false;
    view.dispatch({ effects: mergeCompartment.reconfigure([]) });
  }, []);

  const handleAcceptCurrent = useCallback(async () => {
    if (!activeChange) return;
    const tabId = useChatStore.getState().activeTabId;
    const permissionStore = usePermissionStore.getState();
    const permission = permissionStore.getPermissionForTool(tabId, activeChange.id);
    if (permission) {
      await window.electronAPI.chatAnswerPermission(permission.id, true);
      permissionStore.markToolResolved(tabId, activeChange.id);
      permissionStore.clearPermission(permission.id);
      useChangesStore.getState().removeChange(activeChange.id);
    } else {
      await useChangesStore.getState().acceptChange(activeChange.id);
    }
    deactivateMerge();
  }, [activeChange, deactivateMerge]);

  const handleRejectCurrent = useCallback(async () => {
    if (!activeChange) return;
    const docId = fileId;
    const oldContent = activeChange.oldContent;
    if (docId) {
      useDocumentStore.getState().setContent(docId, oldContent);
    }
    const tabId = useChatStore.getState().activeTabId;
    const permissionStore = usePermissionStore.getState();
    const permission = permissionStore.getPermissionForTool(tabId, activeChange.id);
    if (permission) {
      await window.electronAPI.chatAnswerPermission(permission.id, false);
      permissionStore.markToolResolved(tabId, activeChange.id);
      permissionStore.clearPermission(permission.id);
    }
    await useChangesStore.getState().rejectChange(activeChange.id);
    const view = viewRef.current;
    if (view) {
      isMergeActiveRef.current = false;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: oldContent },
        effects: mergeCompartment.reconfigure([]),
        annotations: Transaction.addToHistory.of(false),
      });
    }
  }, [activeChange, fileId]);

  // Create / destroy editor on file switch
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
      doc: hasChange ? change!.newContent : (content || ""),
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        drawSelection(),
        highlightActiveLine(),
        editorTypographyTheme,
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
                useDocumentStore.getState().saveFile(currentFileId);
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
              const tabId = useChatStore.getState().activeTabId;
              const permissionStore = usePermissionStore.getState();
              const permission = permissionStore.getPermissionForTool(tabId, ch.id);
              const accept = permission
                ? window.electronAPI.chatAnswerPermission(permission.id, true).then(() => {
                    permissionStore.markToolResolved(tabId, ch.id);
                    permissionStore.clearPermission(permission.id);
                    useChangesStore.getState().removeChange(ch.id);
                  })
                : useChangesStore.getState().acceptChange(ch.id);
              accept.then(() => {
                const view = viewRef.current;
                if (view) {
                  isMergeActiveRef.current = false;
                  view.dispatch({ effects: mergeCompartment.reconfigure([]) });
                }
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
              const docId = currentFileId;
              if (docId && ch) {
                useDocumentStore.getState().setContent(docId, ch.oldContent);
              }
              const tabId = useChatStore.getState().activeTabId;
              const permissionStore = usePermissionStore.getState();
              const permission = permissionStore.getPermissionForTool(tabId, ch.id);
              const reject = (permission
                ? window.electronAPI.chatAnswerPermission(permission.id, false).then(() => {
                    permissionStore.markToolResolved(tabId, ch.id);
                    permissionStore.clearPermission(permission.id);
                  })
                : Promise.resolve()
              ).then(() => useChangesStore.getState().rejectChange(ch.id));
              reject.then(() => {
                const view = viewRef.current;
                if (view) {
                  isMergeActiveRef.current = false;
                  view.dispatch({ effects: mergeCompartment.reconfigure([]) });
                }
              });
              return true;
            },
          },
        ]),
        // Start with empty language — loaded async below
        languageCompartment.of([]),
        editorChromeTheme,
        contentMetricsTheme,
        diffDisplayTheme,
        diffDisplayThemeExtra,
        themeCompartment.of(
          getThemeExtensionSync(editorSyntaxTheme, isDark ? "dark" : "light") ?? [],
        ),
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
                    const tabId = useChatStore.getState().activeTabId;
                    const permissionStore = usePermissionStore.getState();
                    const permission = permissionStore.getPermissionForTool(tabId, ch.id);
                    if (permission) {
                      window.electronAPI.chatAnswerPermission(permission.id, true).then(() => {
                        permissionStore.markToolResolved(tabId, ch.id);
                        permissionStore.clearPermission(permission.id);
                        useChangesStore.getState().removeChange(ch.id);
                      });
                    } else {
                      useChangesStore.getState().acceptChange(ch.id);
                    }
                  } else if (finalContent === ch.oldContent) {
                    const tabId = useChatStore.getState().activeTabId;
                    const permissionStore = usePermissionStore.getState();
                    const permission = permissionStore.getPermissionForTool(tabId, ch.id);
                    if (permission) {
                      window.electronAPI.chatAnswerPermission(permission.id, false).then(() => {
                        permissionStore.markToolResolved(tabId, ch.id);
                        permissionStore.clearPermission(permission.id);
                        useChangesStore.getState().rejectChange(ch.id);
                      });
                    } else {
                      useChangesStore.getState().rejectChange(ch.id);
                    }
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
    setViewEpoch((n) => n + 1);

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

    // ─── Async language loading ───
    const langLoader = getLanguageLoader(ext);
    if (langLoader) {
      langLoader()
        .then((langExtension) => {
          if (viewRef.current === view && langExtension) {
            view.dispatch({ effects: languageCompartment.reconfigure(langExtension) });
          }
        })
        .catch((err) => {
          log.error(`Failed to load language for "${ext}":`, err);
        });
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

  // ─── Focus management: focus when tab becomes active, blur when inactive ───

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (isActive) {
      view.focus();
      if (fileId) useDocumentStore.getState().setActiveFile(fileId);
    } else {
      if (view.contentDOM.contains(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }
    }
  }, [isActive]);

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

  // ─── Language reload when extension changes ───
  // (edge case: same fileId but different ext, handled by the full destroy/recreate above)

  // ─── Theme change — reconfigure syntax theme via compartment ───
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const mode = isDark ? "dark" as const : "light" as const;

    // Try sync first (Prism, oneDark fallback)
    const syncExt = getThemeExtensionSync(editorSyntaxTheme, mode);
    if (syncExt) {
      view.dispatch({ effects: themeCompartment.reconfigure(syncExt) });
      return;
    }

    // Async load for community themes
    getThemeExtensionAsync(editorSyntaxTheme, mode).then((ext) => {
      if (viewRef.current === view) {
        view.dispatch({ effects: themeCompartment.reconfigure(ext) });
      }
    });
  }, [isDark, editorSyntaxTheme]);

  // Track activeChange identity to detect stacked edits
  const activeChangeIdRef = useRef<string | null>(null);

  // Merge view activation
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

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
    if (view.state.doc.toString() === storeContent) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: storeContent },
      annotations: Transaction.addToHistory.of(false),
    });
  }, [contentVersion]);

  return (
    <CodeMirrorInsertHost
      viewRef={viewRef}
      filePath={filePath}
      fileId={fileId ?? undefined}
      source="editor"
      sourceTabId={tab.id}
      enabled={isActive && !!fileId}
      viewReadySignal={viewEpoch}
    >
      <div className="flex h-full flex-col min-h-0">
      {/* Subtle loading bar while file content is being fetched from disk */}
      {!contentLoaded && fileId && (
        <div className="h-0.5 w-full bg-muted overflow-hidden shrink-0">
          <div className="h-full w-1/3 bg-primary rounded-r-full"
            style={{ animation: "loading-bar 1.2s ease-in-out infinite" }} />
        </div>
      )}
      {activeChange && (
        <ChangesBar
          change={activeChange}
          changeIndex={changeIndex}
          totalChanges={totalChanges}
          mode={changesBarMode}
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
    </CodeMirrorInsertHost>
  );
}
