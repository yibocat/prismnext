import { useEffect, useRef, useMemo } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { unifiedMergeView } from "@codemirror/merge";
import { oneDark } from "@codemirror/theme-one-dark";
import { useTheme } from "next-themes";
import { getLanguageLoader } from "@/lib/language-mappings";

interface GitDiffViewProps {
  oldContent: string;
  newContent: string;
  filePath: string;
}

export function GitDiffView({ oldContent, newContent, filePath }: GitDiffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const currentFileKeyRef = useRef<string>("");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const themeCompartment = useMemo(() => new Compartment(), []);
  const languageCompartment = useMemo(() => new Compartment(), []);

  const ext = (() => {
    const dot = filePath.lastIndexOf(".");
    return dot === -1 ? "" : filePath.slice(dot).toLowerCase();
  })();

  const isBinary =
    oldContent === "[Binary file]" || newContent === "[Binary file]";

  // Create / destroy CodeMirror view when props change
  useEffect(() => {
    if (isBinary) {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      return;
    }

    if (!containerRef.current) return;

    // Skip re-creation if nothing changed (React strict mode guard)
    const fileKey = `${filePath}::${oldContent.length}::${newContent.length}`;
    if (currentFileKeyRef.current === fileKey && viewRef.current) return;
    currentFileKeyRef.current = fileKey;

    // Destroy previous view
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const state = EditorState.create({
      doc: newContent,
      extensions: [
        lineNumbers(),
        syntaxHighlighting(defaultHighlightStyle),
        themeCompartment.of(isDark ? oneDark : []),
        languageCompartment.of([]),
        EditorView.lineWrapping,
        EditorState.readOnly.of(true),
        EditorState.tabSize.of(2),
        unifiedMergeView({
          original: oldContent,
          highlightChanges: true,
          gutter: true,
          mergeControls: false,
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    // Async language loading
    const langLoader = getLanguageLoader(ext);
    if (langLoader) {
      langLoader()
        .then((langExtension) => {
          if (viewRef.current === view && langExtension) {
            view.dispatch({
              effects: languageCompartment.reconfigure(langExtension),
            });
          }
        })
        .catch(() => {
          // Silently ignore language loading failures
        });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [oldContent, newContent, filePath]);

  // Sync theme changes reactively
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(isDark ? oneDark : []),
    });
  }, [isDark]);

  if (isBinary) {
    return (
      <div className="flex items-center justify-center h-24 text-muted-foreground text-sm rounded">
        Binary file — diff not available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="git-diff-view h-full overflow-auto rounded"
    />
  );
}
