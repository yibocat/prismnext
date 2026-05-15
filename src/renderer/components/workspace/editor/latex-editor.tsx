import { useCallback, useEffect, useRef, useState } from "react";
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
import { useDocumentStore } from "@/stores/document-store";
import { EditorToolbar } from "./editor-toolbar";
import { SearchPanel } from "./search-panel";

function getActiveFileContent(): string {
  const state = useDocumentStore.getState();
  const activeFile = state.files.find((f) => f.id === state.activeFileId);
  return activeFile?.content ?? "";
}

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
});

export function LatexEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const isSearchOpenRef = useRef(false);

  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const setContent = useDocumentStore((s) => s.setContent);

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

  // Keep ref in sync
  useEffect(() => {
    isSearchOpenRef.current = isSearchOpen;
  }, [isSearchOpen]);

  // ─── Create/destroy EditorView on file switch ───
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isTextFile) return;

    const currentContent = getActiveFileContent();

    const compileKeymap = Prec.highest(
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            // Compile will be wired in Step 4
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
        cmBaseTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) setContent(update.state.doc.toString());
        }),
      ],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;

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
      editorStateCache.set(activeFileId, {
        cursor: view.state.selection.main.head,
        scrollTop: view.scrollDOM.scrollTop,
      });
      view.destroy();
      viewRef.current = null;
    };
  }, [activeFileId, isTextFile]);

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

  // ─── Sync content when it changes externally ───
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isTextFile) return;
    const content = activeFile?.content ?? "";
    const currentContent = view.state.doc.toString();
    if (currentContent !== content) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: content },
      });
    }
  }, [activeFile?.content, isTextFile]);

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
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Preview not available
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <EditorToolbar editorView={viewRef} />
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
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
