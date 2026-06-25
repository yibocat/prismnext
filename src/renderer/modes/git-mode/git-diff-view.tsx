import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, drawSelection } from "@codemirror/view";
import { unifiedMergeView, MergeView } from "@codemirror/merge";
import { gitDiffLineNumbers, gitDiffGutterExtension } from "@/lib/git/diff-gutter";
import { gitDiffLineHighlights } from "@/lib/git/diff-line-highlights";
import { useTheme } from "next-themes";
import { getLanguageLoader } from "@/lib/editor/language-mappings";
import { editorChromeTheme } from "@/lib/editor-themes/editor-chrome";
import { getThemeExtensionSync, getThemeExtensionAsync } from "@/lib/editor-themes/registry";
import {
  diffLayoutTheme,
  contentMetricsTheme,
  splitMergePaneTheme,
  gitDiffDisplayTheme,
} from "@/lib/editor-themes/diff-overrides";
import { GitDiffInsertHost } from "./git-diff-insert-host";
import { useSettingsStore } from "@/stores/settings-store";
import { useGitDiffPrefsStore } from "@/stores/git-diff-prefs-store";
import {
  GIT_COLLAPSE_UNCHANGED,
  prepareDiffContents,
} from "@/lib/git/diff-display";
import type { EditorSyntaxThemeId } from "@/lib/editor-themes/types";
import { DEFAULT_SYNTAX_THEME } from "@/lib/editor-themes/types";
import { cn } from "@/lib/utils";

interface GitDiffViewProps {
  oldContent: string;
  newContent: string;
  filePath: string;
  /** Stretch to fill the git viewer pane (main diff tab). */
  fillViewport?: boolean;
}

/** Inline unified — natural height inside list scroller. */
const inlineUnifiedHeightTheme = EditorView.theme({
  "&": { height: "auto" },
  ".cm-editor": { height: "auto" },
  ".cm-scroller": { overflow: "visible" },
  ".cm-content": { minHeight: "auto" },
});

const fontTheme = EditorView.theme({
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
});

function attachSplitHorizontalScrollSync(merge: MergeView): () => void {
  const aEl = merge.a.scrollDOM;
  const bEl = merge.b.scrollDOM;
  let guard = false;

  const clamp = (el: HTMLElement) => {
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    if (el.scrollLeft > max) el.scrollLeft = max;
  };

  const onA = () => {
    if (guard) return;
    guard = true;
    clamp(aEl);
    bEl.scrollLeft = aEl.scrollLeft;
    guard = false;
  };
  const onB = () => {
    if (guard) return;
    guard = true;
    clamp(bEl);
    aEl.scrollLeft = bEl.scrollLeft;
    guard = false;
  };

  aEl.addEventListener("scroll", onA, { passive: true });
  bEl.addEventListener("scroll", onB, { passive: true });

  return () => {
    aEl.removeEventListener("scroll", onA);
    bEl.removeEventListener("scroll", onB);
  };
}

export function GitDiffView({
  oldContent,
  newContent,
  filePath,
  fillViewport = true,
}: GitDiffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const unifiedViewRef = useRef<EditorView | null>(null);
  const splitViewRef = useRef<MergeView | null>(null);
  const splitScrollCleanupRef = useRef<(() => void) | null>(null);
  const [viewEpoch, setViewEpoch] = useState(0);
  const currentFileKeyRef = useRef<string>("");

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const layout = useGitDiffPrefsStore((s) => s.layout);
  const wordWrap = useGitDiffPrefsStore((s) => s.wordWrap);
  const ignoreWhitespace = useGitDiffPrefsStore((s) => s.ignoreWhitespace);
  const isSplit = layout === "split";

  const editorSyntaxTheme =
    (useSettingsStore((s) => s.settings.editorSyntaxTheme) as EditorSyntaxThemeId | undefined)
    ?? DEFAULT_SYNTAX_THEME;

  const themeCompartment = useMemo(() => new Compartment(), []);
  const gitDiffChromeCompartment = useMemo(() => new Compartment(), []);
  const languageCompartment = useMemo(() => new Compartment(), []);
  const wordWrapCompartment = useMemo(() => new Compartment(), []);

  const gitDiffChromeExtensions = useMemo(
    () => [
      gitDiffDisplayTheme,
      gitDiffLineHighlights(),
      gitDiffGutterExtension(),
    ],
    [],
  );

  const ext = (() => {
    const dot = filePath.lastIndexOf(".");
    return dot === -1 ? "" : filePath.slice(dot).toLowerCase();
  })();

  const isBinary =
    oldContent === "[Binary file]" || newContent === "[Binary file]";

  const { oldContent: displayOld, newContent: displayNew } = useMemo(
    () => prepareDiffContents(oldContent, newContent, ignoreWhitespace),
    [oldContent, newContent, ignoreWhitespace],
  );

  const destroyViews = useCallback(() => {
    splitScrollCleanupRef.current?.();
    splitScrollCleanupRef.current = null;
    if (unifiedViewRef.current) {
      unifiedViewRef.current.destroy();
      unifiedViewRef.current = null;
    }
    if (splitViewRef.current) {
      splitViewRef.current.destroy();
      splitViewRef.current = null;
    }
  }, []);

  const baseExtensions = useCallback(
    () => [
      ...gitDiffLineNumbers(),
      drawSelection(),
      editorChromeTheme,
      contentMetricsTheme,
      diffLayoutTheme,
      ...(isSplit ? [splitMergePaneTheme] : []),
      fontTheme,
      themeCompartment.of(
        getThemeExtensionSync(editorSyntaxTheme, isDark ? "dark" : "light") ?? [],
      ),
      gitDiffChromeCompartment.of(gitDiffChromeExtensions),
      languageCompartment.of([]),
      wordWrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
      EditorState.readOnly.of(true),
      EditorState.tabSize.of(2),
      ...(!fillViewport && !isSplit ? [inlineUnifiedHeightTheme] : []),
    ],
    [
      editorSyntaxTheme,
      fillViewport,
      gitDiffChromeCompartment,
      gitDiffChromeExtensions,
      isDark,
      isSplit,
      languageCompartment,
      themeCompartment,
      wordWrap,
      wordWrapCompartment,
    ],
  );

  useEffect(() => {
    if (isBinary) {
      destroyViews();
      return;
    }
    if (!containerRef.current) return;

    const fileKey = `${filePath}::${layout}::${displayOld.length}::${displayNew.length}::${ignoreWhitespace}::${wordWrap}`;
    if (currentFileKeyRef.current === fileKey && (unifiedViewRef.current || splitViewRef.current)) {
      return;
    }
    currentFileKeyRef.current = fileKey;

    destroyViews();
    containerRef.current.innerHTML = "";

    if (isSplit) {
      const merge = new MergeView({
        a: { doc: displayOld, extensions: baseExtensions() },
        b: { doc: displayNew, extensions: baseExtensions() },
        parent: containerRef.current,
        highlightChanges: false,
        collapseUnchanged: GIT_COLLAPSE_UNCHANGED,
      });
      splitViewRef.current = merge;
      splitScrollCleanupRef.current = attachSplitHorizontalScrollSync(merge);
    } else {
      const state = EditorState.create({
        doc: displayNew,
        extensions: [
          ...baseExtensions(),
          unifiedMergeView({
            original: displayOld,
            highlightChanges: false,
            gutter: false,
            mergeControls: false,
            syntaxHighlightDeletions: false,
            collapseUnchanged: GIT_COLLAPSE_UNCHANGED,
          }),
        ],
      });
      const view = new EditorView({ state, parent: containerRef.current });
      unifiedViewRef.current = view;
    }

    setViewEpoch((n) => n + 1);

    const langLoader = getLanguageLoader(ext);
    if (langLoader) {
      langLoader()
        .then((langExtension) => {
          if (!langExtension) return;
          if (unifiedViewRef.current) {
            unifiedViewRef.current.dispatch({
              effects: languageCompartment.reconfigure(langExtension),
            });
          }
          if (splitViewRef.current) {
            const effect = languageCompartment.reconfigure(langExtension);
            splitViewRef.current.a.dispatch({ effects: effect });
            splitViewRef.current.b.dispatch({ effects: effect });
          }
        })
        .catch(() => {});
    }

    return () => {
      destroyViews();
    };
  }, [
    displayNew,
    displayOld,
    destroyViews,
    ext,
    filePath,
    fillViewport,
    ignoreWhitespace,
    isBinary,
    isSplit,
    layout,
    wordWrap,
    baseExtensions,
    languageCompartment,
  ]);

  useEffect(() => {
    const mode = isDark ? "dark" as const : "light" as const;
    const applyTheme = (ext: ReturnType<typeof getThemeExtensionSync>) => {
      if (unifiedViewRef.current) {
        unifiedViewRef.current.dispatch({ effects: themeCompartment.reconfigure(ext ?? []) });
      }
      if (splitViewRef.current) {
        const effect = themeCompartment.reconfigure(ext ?? []);
        splitViewRef.current.a.dispatch({ effects: effect });
        splitViewRef.current.b.dispatch({ effects: effect });
      }
    };

    const syncExt = getThemeExtensionSync(editorSyntaxTheme, mode);
    if (syncExt) {
      applyTheme(syncExt);
      return;
    }

    getThemeExtensionAsync(editorSyntaxTheme, mode).then((themeExt) => {
      applyTheme(themeExt);
    });
  }, [editorSyntaxTheme, isDark, themeCompartment]);

  useEffect(() => {
    const wrapExt = wordWrap ? EditorView.lineWrapping : [];
    if (unifiedViewRef.current) {
      unifiedViewRef.current.dispatch({
        effects: wordWrapCompartment.reconfigure(wrapExt),
      });
    }
    if (splitViewRef.current) {
      const effect = wordWrapCompartment.reconfigure(wrapExt);
      splitViewRef.current.a.dispatch({ effects: effect });
      splitViewRef.current.b.dispatch({ effects: effect });
    }
  }, [wordWrap, wordWrapCompartment]);

  if (isBinary) {
    return (
      <div className="flex items-center justify-center h-24 text-muted-foreground text-sm rounded">
        Binary file — diff not available
      </div>
    );
  }

  const rootClass = cn(
    "git-diff-view w-full min-w-0",
    isSplit ? "git-diff-split" : "git-diff-unified",
    isSplit && fillViewport && "git-diff-split--fill flex flex-col flex-1 min-h-0 h-full",
    isSplit && !fillViewport && "git-diff-split--inline",
    !isSplit && fillViewport && "flex flex-col flex-1 min-h-0 h-full",
  );

  return (
    <div className={rootClass}>
      <GitDiffInsertHost
        filePath={filePath}
        oldContent={displayOld}
        newContent={displayNew}
        layout={isSplit ? "split" : "unified"}
        unifiedViewRef={unifiedViewRef}
        splitViewRef={splitViewRef}
        viewReadySignal={viewEpoch}
      >
        <div
          ref={containerRef}
          className={cn(
            "min-w-0 max-w-full",
            isSplit && fillViewport && "flex-1 min-h-0 h-full overflow-x-hidden",
            isSplit && !fillViewport && "overflow-x-hidden",
            !isSplit && fillViewport && "flex-1 min-h-0 overflow-auto [&_.cm-editor]:h-full",
            !isSplit && !fillViewport && "overflow-visible [&_.cm-editor]:h-auto [&_.cm-scroller]:overflow-visible",
          )}
        />
      </GitDiffInsertHost>
    </div>
  );
}
