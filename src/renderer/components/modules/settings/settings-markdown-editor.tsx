import { useEffect, useMemo, useRef } from "react";
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
import { useTheme } from "next-themes";
import { editorChromeTheme, editorTypographyTheme } from "@/lib/editor-themes/editor-chrome";
import { getThemeExtensionSync, getThemeExtensionAsync } from "@/lib/editor-themes/registry";
import type { EditorSyntaxThemeId } from "@/lib/editor-themes/types";
import { DEFAULT_SYNTAX_THEME } from "@/lib/editor-themes/types";
import { getLanguageLoader } from "@/lib/editor/language-mappings";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

interface SettingsMarkdownEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

export function SettingsMarkdownEditor({
  value,
  onChange,
  readOnly = false,
  className,
}: SettingsMarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const syncingRef = useRef(false);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const editorSyntaxTheme =
    (useSettingsStore((s) => s.settings.editorSyntaxTheme) as EditorSyntaxThemeId | undefined) ??
    DEFAULT_SYNTAX_THEME;

  const themeCompartment = useMemo(() => new Compartment(), []);
  const languageCompartment = useMemo(() => new Compartment(), []);
  const readOnlyCompartment = useMemo(() => new Compartment(), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        languageCompartment.of([]),
        editorChromeTheme,
        editorTypographyTheme,
        themeCompartment.of(
          getThemeExtensionSync(editorSyntaxTheme, isDark ? "dark" : "light") ?? [],
        ),
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingRef.current) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;

    void getLanguageLoader(".md")?.().then((lang) => {
        if (lang && viewRef.current === view) {
          view.dispatch({ effects: languageCompartment.reconfigure(lang) });
        }
      });

    void getThemeExtensionAsync(editorSyntaxTheme, isDark ? "dark" : "light").then((ext) => {
      if (ext && viewRef.current === view) {
        view.dispatch({ effects: themeCompartment.reconfigure(ext) });
      }
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial mount only
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)) });
  }, [readOnly, readOnlyCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const ext =
      getThemeExtensionSync(editorSyntaxTheme, isDark ? "dark" : "light") ?? [];
    view.dispatch({ effects: themeCompartment.reconfigure(ext) });
    void getThemeExtensionAsync(editorSyntaxTheme, isDark ? "dark" : "light").then((loaded) => {
      if (loaded && viewRef.current === view) {
        view.dispatch({ effects: themeCompartment.reconfigure(loaded) });
      }
    });
  }, [editorSyntaxTheme, isDark, themeCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    syncingRef.current = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
    syncingRef.current = false;
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full min-h-0 overflow-hidden [&_.cm-editor]:h-full", className)}
    />
  );
}
