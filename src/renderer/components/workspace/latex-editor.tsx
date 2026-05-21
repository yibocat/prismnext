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

const placeholder = "% Open a file to start editing\n";

export function LatexEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const fileContents = useDocumentStore((s) => s.fileContents);
  const refreshFileContent = useDocumentStore((s) => s.refreshFileContent);

  // Load file content when active file changes
  useEffect(() => {
    if (activeFileId) {
      refreshFileContent(activeFileId);
    }
  }, [activeFileId, refreshFileContent]);

  // Get current document text
  const docText = activeFileId
    ? (fileContents.get(activeFileId)?.content ?? placeholder)
    : placeholder;

  useEffect(() => {
    if (!containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const state = EditorState.create({
      doc: docText,
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
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [isDark, docText]);

  return (
    <div ref={containerRef} className="h-full overflow-auto [&_.cm-editor]:h-full" />
  );
}
