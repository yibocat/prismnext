import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
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
import { useTheme } from "next-themes";
import { useDocumentStore } from "@/stores/document-store";

export function LatexEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const refreshFileContent = useDocumentStore((s) => s.refreshFileContent);
  const jumpTarget = useDocumentStore((s) => s.jumpTarget);

  // Load file content when active file changes
  useEffect(() => {
    if (activeFileId) {
      refreshFileContent(activeFileId);
    }
  }, [activeFileId, refreshFileContent]);

  // Create/destroy editor on file switch
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy old editor
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    // Get initial content
    const content = activeFileId
      ? (useDocumentStore.getState().fileContents.get(activeFileId)?.content ?? "")
      : "";

    const setContent = useDocumentStore.getState().setContent;
    const currentFileId = activeFileId;

    const state = EditorState.create({
      doc: content || "% Open a file to start editing\n",
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        drawSelection(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        latex(),
        syntaxHighlighting(defaultHighlightStyle),
        isDark ? oneDark : [],
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
        // Sync content back to document store on changes
        EditorView.updateListener.of((update) => {
          if (update.docChanged && currentFileId) {
            setContent(currentFileId, update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [activeFileId, isDark]);

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
    <div ref={containerRef} className="h-full overflow-auto [&_.cm-editor]:h-full" />
  );
}
