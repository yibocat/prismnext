// prism-next/src/renderer/lib/editor-themes/editor-chrome.ts

import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * EditorView.theme() extension that bridges CM6's editor chrome (background,
 * gutters, selection, cursor, active line, matching brackets) to the app's
 * CSS custom properties.
 *
 * This extension is ALWAYS applied and never reconfigured. It reads live
 * CSS variables, so it automatically tracks app theme / primary color changes.
 */
export const editorChromeTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--editor-bg)",
    color: "var(--editor-fg)",
  },
  // Gutter: seamless with editor — no border, same background
  ".cm-gutters": {
    backgroundColor: "var(--editor-gutter-bg)",
    color: "var(--editor-gutter-fg)",
    borderRight: "none",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--editor-cursor)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--editor-active-line)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--editor-active-line)",
  },
  ".cm-matchingBracket": {
    backgroundColor: "var(--editor-selection)",
    outline: "1px solid var(--editor-cursor)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
  },
  ".cm-tooltip-autocomplete": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--editor-selection)",
    color: "var(--primary)",
  },
});

/**
 * Selection chrome at highest precedence — beats community syntax themes (e.g.
 * GitHub Light sets `color` on `.cm-content ::selection`, flattening token colors)
 * and CM drawSelection's focused `Highlight` fallback. Native ::selection stays
 * transparent; only `.cm-selectionBackground` paints the highlight layer.
 */
export const editorSelectionTheme = Prec.highest(
  EditorView.theme({
    ".cm-line": {
      "& ::selection, &::selection": {
        backgroundColor: "transparent !important",
        color: "unset !important",
        WebkitTextFillColor: "unset !important",
      },
    },
    ".cm-content": {
      "& ::selection, &::selection": {
        backgroundColor: "transparent !important",
        color: "unset !important",
        WebkitTextFillColor: "unset !important",
      },
      // drawSelection ships `Highlight !important` here — breaks light-mode syntax colors
      "& :focus::selection, & :focus ::selection": {
        backgroundColor: "transparent !important",
        color: "unset !important",
        WebkitTextFillColor: "unset !important",
      },
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, &.cm-focused .cm-selectionBackground, & .cm-selectionBackground":
      {
        backgroundColor: "var(--editor-selection) !important",
      },
  }),
);

/** Font family/size from Appearance → Editor (CSS vars on :root). */
export const editorTypographyTheme = EditorView.theme({
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
