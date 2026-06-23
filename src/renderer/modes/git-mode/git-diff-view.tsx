import { useEffect, useRef, useMemo } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { unifiedMergeView } from "@codemirror/merge";
import { useTheme } from "next-themes";
import { getLanguageLoader } from "@/lib/editor/language-mappings";
import { editorChromeTheme } from "@/lib/editor-themes/editor-chrome";
import { getThemeExtensionSync, getThemeExtensionAsync } from "@/lib/editor-themes/registry";
import { diffDisplayTheme, diffDisplayThemeExtra, contentMetricsTheme } from "@/lib/editor-themes/diff-overrides";
import { useSettingsStore } from "@/stores/settings-store";
import type { EditorSyntaxThemeId } from "@/lib/editor-themes/types";
import { DEFAULT_SYNTAX_THEME } from "@/lib/editor-themes/types";

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

  const editorSyntaxTheme =
    (useSettingsStore((s) => s.settings.editorSyntaxTheme) as EditorSyntaxThemeId | undefined)
    ?? DEFAULT_SYNTAX_THEME;

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
        editorChromeTheme,
        contentMetricsTheme,
        diffDisplayTheme,
        diffDisplayThemeExtra,
        EditorView.theme({
          "&": {
            fontFamily: "var(--font-editor)",
            fontSize: "var(--font-editor-size)",
          },
          ".cm-content": {
            fontFamily: "var(--font-editor)",
            fontSize: "var(--font-editor-size)",
          },
          ".cm-gutters": {
            fontFamily: "var(--font-editor)",
            fontSize: "var(--font-editor-size)",
          },
        }),
        themeCompartment.of(
          getThemeExtensionSync(editorSyntaxTheme, isDark ? "dark" : "light") ?? [],
        ),
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
    const view = viewRef.current;
    if (!view) return;
    const mode = isDark ? "dark" as const : "light" as const;

    const syncExt = getThemeExtensionSync(editorSyntaxTheme, mode);
    if (syncExt) {
      view.dispatch({ effects: themeCompartment.reconfigure(syncExt) });
      return;
    }

    getThemeExtensionAsync(editorSyntaxTheme, mode).then((ext) => {
      if (viewRef.current === view) {
        view.dispatch({ effects: themeCompartment.reconfigure(ext) });
      }
    });
  }, [isDark, editorSyntaxTheme]);

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
