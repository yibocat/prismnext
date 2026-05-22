import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Compartment, EditorState, Prec, Transaction } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  scrollPastEnd,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentMore,
  indentLess,
  toggleComment,
} from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { oneDark, oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { defaultHighlightStyle } from "@codemirror/language";
import { useTheme } from "next-themes";
import {
  search,
  highlightSelectionMatches,
  SearchQuery,
  setSearchQuery as setSearchQueryEffect,
  findNext,
  findPrevious,
} from "@codemirror/search";
import { latex } from "codemirror-lang-latex";
import { unifiedMergeView, getChunks, acceptChunk, rejectChunk } from "@codemirror/merge";
import { useDocumentStore } from "@/stores/document-store";
import { useChangesStore, type ProposedChange } from "@/stores/changes-store";
import { useCompileStore, compileCurrentDocument, compileOnSave } from "@/stores/compile-store";
import { ClaudeChatDrawer } from "../claude-chat/claude-chat-drawer";
import { ChatErrorBoundary } from "../claude-chat/error-boundary";
import { ProposedChangesPanel } from "../claude-chat/proposed-changes-panel";
import { EditorToolbar } from "./editor-toolbar";
import { SearchPanel } from "./search-panel";
import { ChevronUpIcon, ChevronDownIcon, CheckIcon, XIcon } from "lucide-react";

const editorStateCache = new Map<string, { cursor: number; scrollTop: number }>();

export function clearEditorStateCache(): void {
  editorStateCache.clear();
}

function wrapSelection(view: EditorView, cmd: string): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const wrapped = `\\${cmd}{${selected}}`;
  const cursorPos = selected ? from + wrapped.length : from + cmd.length + 2;
  view.dispatch({
    changes: { from, to, insert: wrapped },
    selection: { anchor: cursorPos },
  });
  return true;
}

const cmBaseTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
    color: "var(--foreground)",
    backgroundColor: "var(--background)",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-gutters": {
    paddingRight: "4px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    paddingLeft: "8px",
    paddingRight: "4px",
  },
  ".cm-content": {
    paddingLeft: "8px",
    paddingRight: "12px",
  },
  ".cm-searchMatch": {
    backgroundColor: "#facc15 !important",
    color: "#000 !important",
    borderRadius: "2px",
    boxShadow: "0 0 0 1px #eab308",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "#f97316 !important",
    color: "#fff !important",
    borderRadius: "2px",
    boxShadow: "0 0 0 2px #ea580c",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgba(100, 150, 255, 0.3)",
  },
  // Merge view (from claude-prism)
  ".cm-mergeView": {
    height: "100%",
  },
  ".cm-changedLine": {
    backgroundColor: "rgba(34, 197, 94, 0.08) !important",
  },
  ".cm-deletedChunk": {
    backgroundColor: "rgba(239, 68, 68, 0.12) !important",
    paddingLeft: "6px",
    position: "relative",
  },
  ".cm-insertedLine": {
    backgroundColor: "rgba(34, 197, 94, 0.15) !important",
  },
  ".cm-deletedLine": {
    backgroundColor: "rgba(239, 68, 68, 0.15) !important",
  },
  ".cm-changedText": {
    backgroundColor: "rgba(34, 197, 94, 0.25) !important",
  },
  ".cm-chunkButtons": {
    position: "absolute",
    insetInlineEnd: "5px",
    top: "2px",
    zIndex: "10",
  },
  ".cm-chunkButtons button": {
    border: "none",
    cursor: "pointer",
    color: "white",
    margin: "0 2px",
    borderRadius: "3px",
    padding: "2px 8px",
    fontSize: "12px",
    lineHeight: "1.4",
  },
  ".cm-chunkButtons button[name=accept]": {
    backgroundColor: "#22c55e",
  },
  ".cm-chunkButtons button[name=reject]": {
    backgroundColor: "#ef4444",
  },
  ".cm-changeGutter": { width: "3px", minWidth: "3px" },
  ".cm-changedLineGutter": { backgroundColor: "#22c55e" },
  ".cm-deletedLineGutter": { backgroundColor: "#ef4444" },
});

export function LatexEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const mergeCompartmentRef = useRef(new Compartment());
  const isSearchOpenRef = useRef(false);
  const isMergeActiveRef = useRef(false);
  const pendingChangeRef = useRef<ProposedChange | null>(null);
  const currentFileIdRef = useRef<string | null>(null);

  // Only subscribe to file IDs, not content
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const jumpTarget = useDocumentStore((s) => s.jumpTarget);

  const { resolvedTheme } = useTheme();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);

  const activeFile = files.find((f) => f.id === activeFileId);
  const isTextFile =
    activeFile?.type === "tex" ||
    activeFile?.type === "style" ||
    activeFile?.type === "other";

  // ─── Proposed changes ───
  const proposedChanges = useChangesStore((s) => s.changes);
  const activeFileChange = useMemo(() => {
    if (!activeFile) return null;
    return proposedChanges.find((c) => c.filePath === activeFile.relativePath) ?? null;
  }, [proposedChanges, activeFile]);

  const [mergeChunkInfo, setMergeChunkInfo] = useState({ total: 0, current: 0 });
  const hasNavigatedRef = useRef(false);

  // ─── Diff overview ruler (VSCode-style scrollbar markers) ───
  const overviewMarkers = useMemo(() => {
    if (!isMergeActiveRef.current && mergeChunkInfo.total === 0) return [];
    const view = viewRef.current;
    if (!view) return [];
    const result = getChunks(view.state);
    if (!result || result.chunks.length === 0) return [];
    const docLen = view.state.doc.length || 1;
    return result.chunks.map((ch) => ({
      top: (ch.fromB / docLen) * 100,
      height: Math.max(((ch.toB - ch.fromB) / docLen) * 100, 0.5),
    }));
  }, [mergeChunkInfo]);

  // Chunk navigation
  const goToChunk = useCallback((index: number) => {
    const view = viewRef.current;
    if (!view) return;
    const result = getChunks(view.state);
    if (!result || index < 0 || index >= result.chunks.length) return;
    const chunk = result.chunks[index];
    view.dispatch({
      selection: { anchor: chunk.fromB },
      effects: EditorView.scrollIntoView(chunk.fromB, { y: "center" }),
    });
    view.focus();
    hasNavigatedRef.current = true;
  }, []);

  // ─── Merge accept/reject handlers ───
  const handleAcceptAllRef = useRef<() => void>(() => {});
  const handleRejectAllRef = useRef<() => void>(() => {});

  handleAcceptAllRef.current = async () => {
    const change = activeFileChange;
    if (!change) return;

    if (isMergeActiveRef.current) {
      const view = viewRef.current;
      isMergeActiveRef.current = false;
      setMergeChunkInfo({ total: 0, current: 0 });
      if (view) {
        useDocumentStore.getState().setContent(activeFileId!, view.state.doc.toString());
        view.dispatch({ effects: mergeCompartmentRef.current.reconfigure([]) });
      }
      pendingChangeRef.current = null;
    }

    try {
      await useChangesStore.getState().acceptChange(change.id);
      useCompileStore.getState().scheduleAutoCompile();
    } catch (err) {
      console.error("[merge] acceptAll failed:", err);
    }
  };

  handleRejectAllRef.current = async () => {
    const change = activeFileChange;
    if (!change) return;

    if (isMergeActiveRef.current) {
      const view = viewRef.current;
      isMergeActiveRef.current = false;
      setMergeChunkInfo({ total: 0, current: 0 });
      if (view) {
        view.dispatch({ effects: mergeCompartmentRef.current.reconfigure([]) });
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: change.oldContent },
          annotations: Transaction.addToHistory.of(false),
        });
        useDocumentStore.getState().setContent(activeFileId!, change.oldContent);
      }
      pendingChangeRef.current = null;
    }

    try {
      await useChangesStore.getState().rejectChange(change.id);
      useCompileStore.getState().scheduleAutoCompile();
    } catch (err) {
      console.error("[merge] rejectAll failed:", err);
    }
  };

  const acceptCurrentChunk = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const result = getChunks(view.state);
    const idx = mergeChunkInfo.current - 1;
    if (!result || idx < 0 || idx >= result.chunks.length) return;
    acceptChunk(view, result.chunks[idx].fromB);
    afterChunkAction(view, idx);
  }, [mergeChunkInfo]);

  const rejectCurrentChunk = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const result = getChunks(view.state);
    const idx = mergeChunkInfo.current - 1;
    if (!result || idx < 0 || idx >= result.chunks.length) return;
    rejectChunk(view, result.chunks[idx].fromB);
    afterChunkAction(view, idx);
  }, [mergeChunkInfo]);

  const afterChunkAction = useCallback((view: EditorView, prevIdx: number) => {
    const remaining = getChunks(view.state);
    // Auto-resolve is handled by the updateListener (single source of truth).
    // Here we just navigate to the next remaining chunk after accept/reject.
    if (remaining && remaining.chunks.length > 0) {
      const nextIdx = Math.min(prevIdx, remaining.chunks.length - 1);
      const next = remaining.chunks[nextIdx];
      view.dispatch({
        selection: { anchor: next.fromB },
        effects: EditorView.scrollIntoView(next.fromB, { y: "center" }),
      });
    }
    view.focus();
  }, []);

  // Keep refs in sync
  useEffect(() => {
    isSearchOpenRef.current = isSearchOpen;
    currentFileIdRef.current = activeFileId;
  }, [isSearchOpen, activeFileId]);

  // ─── Create/destroy EditorView on file switch ───
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isTextFile || !activeFileId) return;

    // Get content from store directly (not via subscription)
    const currentContent = useDocumentStore.getState().getContent(activeFileId);

    const compileKeymap = Prec.highest(
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            // Trigger compilation
            compileCurrentDocument();
            return true;
          },
        },
        {
          key: "Mod-s",
          run: () => {
            // Save current file then compile
            const id = currentFileIdRef.current;
            if (id) {
              useDocumentStore.getState().saveFile(id).then(() => {
                compileOnSave();
              });
            }
            return true;
          },
        },
        {
          key: "Mod-f",
          run: () => {
            setIsSearchOpen(true);
            return true;
          },
        },
        {
          key: "Escape",
          run: () => {
            if (isSearchOpenRef.current) {
              setIsSearchOpen(false);
              return true;
            }
            return false;
          },
        },
        {
          key: "Mod-b",
          run: (view) => wrapSelection(view, "textbf"),
        },
        {
          key: "Mod-i",
          run: (view) => wrapSelection(view, "textit"),
        },
        {
          key: "Mod-/",
          run: toggleComment,
        },
        {
          key: "Mod-y",
          run: () => {
            if (isMergeActiveRef.current) {
              handleAcceptAllRef.current();
              return true;
            }
            return false;
          },
        },
        {
          key: "Mod-n",
          run: () => {
            if (isMergeActiveRef.current) {
              handleRejectAllRef.current();
              return true;
            }
            return false;
          },
        },
      ]),
    );

    const state = EditorState.create({
      doc: currentContent,
      extensions: [
        compileKeymap,
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([
          { key: "Tab", run: indentMore, shift: indentLess },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        latex(),
        themeCompartmentRef.current.of(
          resolvedTheme === "dark"
            ? [oneDark, syntaxHighlighting(oneDarkHighlightStyle)]
            : [syntaxHighlighting(defaultHighlightStyle)],
        ),
        search(),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        scrollPastEnd(),
        mergeCompartmentRef.current.of([]),
        cmBaseTheme,
        EditorView.updateListener.of((update) => {
          // During merge, track chunk position and auto-resolve
          if (isMergeActiveRef.current) {
            const result = getChunks(update.state);
            if (result) {
              const total = result.chunks.length;
              let current = 0;
              const cursorPos = update.state.selection.main.head;
              for (let i = 0; i < result.chunks.length; i++) {
                if (cursorPos >= result.chunks[i].fromB) current = i + 1;
              }
              setMergeChunkInfo({ total, current: Math.min(Math.max(1, current), total) });

              if (total === 0) {
                const change = pendingChangeRef.current;
                if (change) {
                  setTimeout(() => {
                    const v = viewRef.current;
                    if (!v || !isMergeActiveRef.current) return;
                    if (pendingChangeRef.current !== change) return;
                    isMergeActiveRef.current = false;
                    setMergeChunkInfo({ total: 0, current: 0 });
                    const finalContent = v.state.doc.toString();
                    v.dispatch({ effects: mergeCompartmentRef.current.reconfigure([]) });
                    if (finalContent === change.oldContent) {
                      useDocumentStore.getState().setContent(activeFileId!, change.oldContent);
                      useChangesStore.getState().rejectChange(change.id);
                    } else {
                      useDocumentStore.getState().setContent(activeFileId!, finalContent);
                      useChangesStore.getState().acceptChange(change.id);
                    }
                    useCompileStore.getState().scheduleAutoCompile();
                    pendingChangeRef.current = null;
                  }, 0);
                }
              }
            }
            return; // skip normal listener during merge
          }

          if (update.docChanged) {
            const id = currentFileIdRef.current;
            if (id) {
              useDocumentStore.getState().setContent(id, update.state.doc.toString());
              useCompileStore.getState().scheduleAutoCompile();
            }
          }
          // Emit selection changes for chat context
          if (update.selectionSet && update.state.selection.main) {
            const { from, to } = update.state.selection.main;
            if (from !== to) {
              useDocumentStore.getState().setSelectionRange({ start: from, end: to });
            } else {
              useDocumentStore.getState().setSelectionRange(null);
            }
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;
    // Expose editor view globally for toolbar
    (window as any).__cmEditorView = view;

    // If there's a pending change for this file, activate merge view now.
    // This is needed because the merge useEffect runs before view creation
    // and won't re-fire since activeFileChange hasn't changed.
    const currentChange = useChangesStore.getState().getChangeForFile(
      files.find((f) => f.id === activeFileId)?.relativePath ?? "",
    );
    if (currentChange && !isMergeActiveRef.current) {
      console.log("[merge] activating on view creation for", currentChange.filePath);
      pendingChangeRef.current = currentChange;
      isMergeActiveRef.current = true;
      try {
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: currentChange.newContent,
          },
          effects: mergeCompartmentRef.current.reconfigure(
            unifiedMergeView({
              original: currentChange.oldContent,
              highlightChanges: true,
              gutter: true,
              mergeControls: true,
            }),
          ),
          annotations: Transaction.addToHistory.of(false),
        });
        requestAnimationFrame(() => goToChunk(0));
      } catch (err) {
        console.error("[merge] view-creation activation failed:", err);
        isMergeActiveRef.current = false;
        pendingChangeRef.current = null;
        // Fallback: show new content
        try {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: currentChange.newContent },
            annotations: Transaction.addToHistory.of(false),
          });
          useDocumentStore.getState().setContent(activeFileId!, currentChange.newContent);
        } catch (e2) {
          console.error("[merge] fallback failed:", e2);
        }
      }
    }

    // Restore per-file cursor + scroll from cache
    const cached = editorStateCache.get(activeFileId);
    if (cached) {
      const pos = Math.min(cached.cursor, view.state.doc.length);
      view.dispatch({ selection: { anchor: pos, head: pos } });
      requestAnimationFrame(() => {
        view.scrollDOM.scrollTop = cached.scrollTop;
      });
    }

    return () => {
      // Deactivate merge on file switch — leave change pending for review later
      if (isMergeActiveRef.current) {
        isMergeActiveRef.current = false;
        pendingChangeRef.current = null;
      }
      editorStateCache.set(activeFileId, {
        cursor: view.state.selection.main.head,
        scrollTop: view.scrollDOM.scrollTop,
      });
      view.destroy();
      viewRef.current = null;
    };
  }, [activeFileId, isTextFile]); // Don't include resolvedTheme here

  // ─── Theme switching ───
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const extensions =
      resolvedTheme === "dark"
        ? [oneDark, syntaxHighlighting(oneDarkHighlightStyle)]
        : [syntaxHighlighting(defaultHighlightStyle)];
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(extensions),
    });
  }, [resolvedTheme]);

  // ─── Merge view activation/deactivation ───
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isTextFile) {
      console.log("[merge] skip — no view or not text file", { hasView: !!view, isTextFile });
      return;
    }

    if (activeFileChange && !isMergeActiveRef.current) {
      console.log("[merge] activating for", activeFileChange.filePath, {
        oldLen: activeFileChange.oldContent.length,
        newLen: activeFileChange.newContent.length,
      });
      // Close search panel — results are invalid after content replacement
      setIsSearchOpen(false);
      setSearchQuery("");
      pendingChangeRef.current = activeFileChange;
      isMergeActiveRef.current = true;
      hasNavigatedRef.current = false;
      try {
        const scrollTop = view.scrollDOM.scrollTop;
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: activeFileChange.newContent,
          },
          effects: mergeCompartmentRef.current.reconfigure(
            unifiedMergeView({
              original: activeFileChange.oldContent,
              highlightChanges: true,
              gutter: true,
              mergeControls: true,
            }),
          ),
          annotations: Transaction.addToHistory.of(false),
        });
        view.scrollDOM.scrollTop = scrollTop;
        requestAnimationFrame(() => goToChunk(0));
        console.log("[merge] activated successfully");
      } catch (err) {
        console.error("[merge] activation failed:", err);
        isMergeActiveRef.current = false;
        pendingChangeRef.current = null;
        // Fallback: show new content in editor without merge diff
        try {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: activeFileChange!.newContent },
            annotations: Transaction.addToHistory.of(false),
          });
          useDocumentStore.getState().setContent(activeFileId!, activeFileChange!.newContent);
          console.log("[merge] fallback: editor updated to new content (no diff)");
        } catch (e2) {
          console.error("[merge] fallback also failed:", e2);
        }
      }
    } else if (
      activeFileChange &&
      isMergeActiveRef.current &&
      (pendingChangeRef.current?.id !== activeFileChange.id ||
       pendingChangeRef.current?.newContent !== activeFileChange.newContent)
    ) {
      console.log("[merge] updating for stacked edit", activeFileChange.id);
      pendingChangeRef.current = activeFileChange;
      try {
        const scrollTop = view.scrollDOM.scrollTop;
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: activeFileChange.newContent,
          },
          effects: mergeCompartmentRef.current.reconfigure(
            unifiedMergeView({
              original: activeFileChange.oldContent,
              highlightChanges: true,
              gutter: true,
              mergeControls: true,
            }),
          ),
          annotations: Transaction.addToHistory.of(false),
        });
        view.scrollDOM.scrollTop = scrollTop;
      } catch (err) {
        console.error("[merge] update failed:", err);
        // Fallback: update editor content without merge
        try {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: activeFileChange!.newContent },
            annotations: Transaction.addToHistory.of(false),
          });
          useDocumentStore.getState().setContent(activeFileId!, activeFileChange!.newContent);
        } catch (e2) {
          console.error("[merge] update fallback also failed:", e2);
        }
      }
    } else if (!activeFileChange && isMergeActiveRef.current) {
      console.log("[merge] deactivating (external)");
      // Restore editor content to match document store (cross-tab resolution)
      const storeContent = useDocumentStore.getState().getContent(activeFileId!) ?? "";
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: storeContent },
        effects: mergeCompartmentRef.current.reconfigure([]),
        annotations: Transaction.addToHistory.of(false),
      });
      isMergeActiveRef.current = false;
      pendingChangeRef.current = null;
    }
  }, [activeFileChange, isTextFile, goToChunk]);

  // ─── Global keyboard shortcuts (works even when editor loses focus) ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isMergeActiveRef.current) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "y" && !e.shiftKey) {
        e.preventDefault();
        handleAcceptAllRef.current();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        handleRejectAllRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ─── Search query effect ───
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (!searchQuery) {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    const query = new SearchQuery({
      search: searchQuery,
      caseSensitive: false,
    });
    view.dispatch({ effects: setSearchQueryEffect.of(query) });
    if (searchQuery) findNext(view);

    const doc = view.state.doc.toString();
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    const matches = doc.match(regex);
    setMatchCount(matches?.length ?? 0);
    setCurrentMatch(matches && matches.length > 0 ? 1 : 0);
  }, [searchQuery]);

  // ─── Handle jump-to-position from outline ───
  useEffect(() => {
    if (jumpTarget === null) return;
    const view = viewRef.current;
    if (!view) return;
    const pos = Math.min(jumpTarget, view.state.doc.length);
    view.dispatch({
      selection: { anchor: pos },
      effects: [
        EditorView.scrollIntoView(pos, { y: "center" }),
      ],
    });
    view.focus();
    // Clear the jump target
    useDocumentStore.setState({ jumpTarget: null });
  }, [jumpTarget]);

  // ─── Sync content when file content changes externally (file switch) ───
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeFileId) return;
    if (isMergeActiveRef.current) return; // don't overwrite merge view

    const content = useDocumentStore.getState().getContent(activeFileId);
    const currentContent = view.state.doc.toString();

    // Only update if content is different (file switch or external change)
    if (currentContent !== content && currentFileIdRef.current === activeFileId) {
      const cursorPos = Math.min(view.state.selection.main.head, content.length);
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: content },
        selection: { anchor: cursorPos },
      });
    }
  }, [activeFileId]); // Don't subscribe to content changes

  const handleFindNext = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      findNext(view);
      view.focus();
    }
  }, []);

  const handleFindPrevious = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      findPrevious(view);
      view.focus();
    }
  }, []);

  if (!isTextFile) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="drag-region flex h-[var(--height-editor-placeholder)] shrink-0 items-center justify-center border-border border-b bg-muted/30">
          <span className="font-medium text-muted-foreground text-[length:var(--font-toolbar-label)]">Editor</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground text-[length:var(--font-placeholder)]">
            {activeFileId ? "Preview not available" : "No file selected"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <EditorToolbar />
      {isSearchOpen && (
        <SearchPanel
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onClose={() => {
            setIsSearchOpen(false);
            setSearchQuery("");
            viewRef.current?.focus();
          }}
          onFindNext={handleFindNext}
          onFindPrevious={handleFindPrevious}
          matchCount={matchCount}
          currentMatch={currentMatch}
        />
      )}
      {/* Proposed changes panel */}
      {activeFileChange && (
        <ProposedChangesPanel
          change={activeFileChange}
          changeIndex={proposedChanges.findIndex(
            (c) => c.filePath === activeFile?.relativePath,
          )}
          totalChanges={proposedChanges.length}
          onAccept={() => handleAcceptAllRef.current()}
          onReject={() => handleRejectAllRef.current()}
        />
      )}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />
        {/* Diff overview ruler (VSCode-style right-edge markers) */}
        {activeFileChange && overviewMarkers.length > 0 && (
          <div className="absolute top-0 right-0 z-10 h-full w-[6px] pointer-events-none">
            {overviewMarkers.map((m, i) => (
              <div
                key={i}
                className="absolute right-0 w-full bg-green-500/50"
                style={{ top: `${m.top}%`, height: `${m.height}%` }}
              />
            ))}
          </div>
        )}
        {/* Chunk navigator (shown during merge) */}
        {activeFileChange && mergeChunkInfo.total > 0 && hasNavigatedRef.current && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-background/95 px-2 py-1 shadow-lg backdrop-blur-sm">
            <span className="px-1 font-mono text-muted-foreground text-[length:var(--font-toolbar-label)]">
              {mergeChunkInfo.current}/{mergeChunkInfo.total}
            </span>
            <div className="mx-0.5 h-4 w-px bg-border" />
            <button
              onClick={() => {
                const idx = mergeChunkInfo.current <= 1
                  ? mergeChunkInfo.total - 1
                  : mergeChunkInfo.current - 2;
                goToChunk(idx);
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronUpIcon className="size-3.5" />
            </button>
            <button
              onClick={() => {
                const idx = mergeChunkInfo.current >= mergeChunkInfo.total
                  ? 0
                  : mergeChunkInfo.current;
                goToChunk(idx);
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronDownIcon className="size-3.5" />
            </button>
            <div className="mx-0.5 h-4 w-px bg-border" />
            <button
              onClick={acceptCurrentChunk}
              className="rounded p-0.5 text-green-500 hover:bg-green-500/10"
              title="Accept chunk"
            >
              <CheckIcon className="size-3.5" />
            </button>
            <button
              onClick={rejectCurrentChunk}
              className="rounded p-0.5 text-red-500 hover:bg-red-500/10"
              title="Reject chunk"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        )}
        <ChatErrorBoundary>
          <ClaudeChatDrawer />
        </ChatErrorBoundary>
      </div>
    </div>
  );
}
