// prism-next/src/renderer/lib/editor-themes/editor-chrome.ts

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
  "&.cm-focused .cm-selectionBackground, & .cm-selectionBackground, & ::selection": {
    backgroundColor: "var(--editor-selection) !important",
    color: "var(--editor-fg) !important",
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
