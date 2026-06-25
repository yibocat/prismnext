// prism-next/src/renderer/lib/editor-themes/diff-overrides.ts

import { EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";

/**
 * ── UNIFIED DIFF DISPLAY THEME ──
 *
 * Every theme (Prism, GitHub, Nord, One Dark, Monokai, Dracula, Tokyo Night,
 * Solarized Light) must render git diffs IDENTICALLY:
 *
 *   • Deleted lines:     single clean reddish background, NO strikethrough
 *   • Changed/inserted:   single clean greenish background
 *   • Git diff view:      line-level only (no word-level overlay)
 *   • Editor merge view:  word-level tokens optional (deeper saturated bg)
 *   • Gutter markers:     solid colour, no decoration
 *   • NO borders, NO outlines, NO box-shadows, NO gradients, NO extras
 *
 * We enforce this with TWO layers:
 *
 *  1. An external <style> element (injectDiffOverrides) — kills everything
 *     with !important on ALL background shorthand (not just background-color),
 *     so the CM6 merge baseTheme gradient-underline is destroyed.
 *
 *  2. A CM6 Prec.highest EditorView.theme extension — same rules inside
 *     CM6's scoped StyleModule, beating even community themes that ship
 *     their own !important diff rules (GitHub, Nord, etc.).
 *
 * Why the `background` shorthand matters:
 *   CM6 merge's baseTheme creates the "underline" via
 *   `background: linear-gradient(...) bottom/100% 2px no-repeat`.
 *   `background-color` does NOT override `background-image` (the gradient).
 *   Using the `background` shorthand resets ALL sub-properties including
 *   background-image → gradient is gone.
 */

// ─── CSS custom property fallbacks ───
const DEL_BG = "var(--editor-diff-deleted-bg, rgba(248,81,81,0.18))";
const INS_BG = "var(--editor-diff-inserted-bg, rgba(52,211,110,0.18))";
const DEL_TEXT = "var(--editor-diff-deleted-text, rgba(248,81,81,0.24))";
const INS_TEXT = "var(--editor-diff-inserted-text, rgba(52,211,110,0.24))";
const DEL_FG = "var(--editor-diff-deleted-fg, oklch(0.72 0.17 25))";
const INS_FG = "var(--editor-diff-inserted-fg, oklch(0.78 0.15 145))";
const HATCH = "color-mix(in oklch, var(--muted) 35%, transparent)";

// ────────────────────────────────────────────────────────────
// Layer 1: External <style> element
// ────────────────────────────────────────────────────────────

const DIFF_CSS = `
/* ── ZERO ALL decorative cruft on every diff element + children ── */
.cm-editor .cm-content del,
.cm-editor .cm-content del *,
.cm-editor .cm-content ins,
.cm-editor .cm-content ins *,
.cm-editor .cm-content .cm-deletedLine,
.cm-editor .cm-content .cm-deletedLine *,
.cm-editor .cm-content .cm-insertedLine,
.cm-editor .cm-content .cm-insertedLine *,
.cm-editor .cm-content .cm-deletedText,
.cm-editor .cm-content .cm-deletedText *,
.cm-editor .cm-content .cm-changedText,
.cm-editor .cm-content .cm-changedText *,
.cm-editor .cm-content .cm-deletedChunk,
.cm-editor .cm-content .cm-deletedChunk *,
.cm-editor .cm-content .cm-changedLine,
.cm-editor .cm-content .cm-changedLine *,
.cm-editor .cm-content .cm-inlineChangedLine,
.cm-editor .cm-content .cm-inlineChangedLine *,
.cm-editor .cm-content .cm-deletedLineGutter,
.cm-editor .cm-content .cm-changedLineGutter,
.cm-editor .cm-content .cm-mergeChunkStart,
.cm-editor .cm-content .cm-mergeChunkEnd {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  text-decoration: none !important;
}

/* ── Line-level: zero padding + border-radius — kills community-theme
     padding:1px 3px and borderRadius:3px that cause adjacent diff lines
     to visually overlap / create gaps at rounded corners. ── */
.cm-editor .cm-content .cm-deletedLine,
.cm-editor .cm-content .cm-insertedLine,
.cm-editor .cm-content .cm-changedLine,
.cm-editor .cm-content .cm-inlineChangedLine,
.cm-editor .cm-content .cm-deletedChunk {
  padding: 0 !important;
  border-radius: 0 !important;
}

/*
 * Diff colors — semantics
 * ─────────────────────
 * UNIFIED (one pane, inline old→new):
 *   Red  = deletions (cm-deletedLine/Chunk, deletedLineGutter)
 *   Green = insertions & modifications (cm-insertedLine, cm-changedLine, changedLineGutter)
 *
 * SPLIT (merge-a = old left, merge-b = new right):
 *   Left  = red (removed/changed-from-old)
 *   Right = green (added/changed-to-new)
 */

/* ── Git diff: line-level paint (Decoration.line + unified deletion chunk) ── */
.git-diff-view .cm-line.git-diff-line-del {
  background: ${DEL_BG} !important;
}
.git-diff-view .cm-line.git-diff-line-ins {
  background: ${INS_BG} !important;
}
.git-diff-view .cm-deletedChunk {
  background: ${DEL_BG} !important;
  background-image: none !important;
  box-sizing: border-box !important;
}
/* Inner CM merge marks — transparent; line/chunk is the only colored layer */
.git-diff-view .cm-line .cm-insertedLine,
.git-diff-view .cm-line ins.cm-insertedLine,
.git-diff-view .cm-line .cm-deletedLine,
.git-diff-view .cm-line del.cm-deletedLine,
.git-diff-view .cm-line .cm-changedLine,
.git-diff-view .cm-line .cm-inlineChangedLine,
.git-diff-view .cm-line .cm-changedText,
.git-diff-view .cm-line .cm-deletedText,
.git-diff-view .cm-deletedChunk .cm-deletedLine,
.git-diff-view .cm-deletedChunk del,
.git-diff-view .cm-deletedChunk .cm-deletedText,
.git-diff-view .cm-deletedChunk span {
  background: transparent !important;
  background-image: none !important;
  border: none !important;
}
.git-diff-view .cm-deletedLineGutter,
.git-diff-view .cm-changedLineGutter,
.git-diff-view .cm-inlineChangedLineGutter {
  background: transparent !important;
}

/* ── Gutter UX — accent bar on left of line numbers (Cursor-style) ── */
.git-diff-view .cm-lineNumbers .cm-gutterElement.git-diff-gutter-row-del {
  background: ${DEL_BG} !important;
  color: ${DEL_FG} !important;
  border-left: 3px solid ${DEL_FG} !important;
}
.git-diff-view .cm-lineNumbers .cm-gutterElement.git-diff-gutter-row-ins {
  background: ${INS_BG} !important;
  color: ${INS_FG} !important;
  border-left: 3px solid ${INS_FG} !important;
}
/* CM merge change column — hidden; accent lives on line-number left edge */
.git-diff-view .cm-changeGutter {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  flex: 0 0 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  overflow: hidden !important;
}
/* Bridge gap between gutter and highlighted code */
.git-diff-view .cm-content {
  padding-left: 0 !important;
  padding-right: 0 !important;
}
.git-diff-view .cm-line {
  padding-left: 0 !important;
  padding-right: 4px !important;
}
.git-diff-view .cm-content .cm-changedLine,
.git-diff-view .cm-content .cm-inlineChangedLine,
.git-diff-view .cm-content ins.cm-insertedLine,
.git-diff-view .cm-content del.cm-deletedLine {
  display: block !important;
  width: 100% !important;
  box-sizing: border-box !important;
}
.git-diff-view .cm-lineNumbers .cm-gutterElement {
  padding-left: 8px !important;
  padding-right: 8px !important;
  box-sizing: border-box !important;
}
/*
 * @fsegurai themes (GitHub, Nord, Monokai, Tokyo Night, Solarized) add
 * padding-right + border-right on .cm-gutters → dark vertical gap before code.
 */
.git-diff-view .cm-editor .cm-gutters,
.git-diff-view .cm-gutters {
  padding-left: 0 !important;
  padding-right: 0 !important;
  border-right: none !important;
  border-left: none !important;
  margin: 0 !important;
}

/* ── Split alignment spacers — diagonal hatch (VS Code / Cursor) ── */
.git-diff-split .cm-mergeSpacer {
  display: block !important;
  width: 100% !important;
  box-sizing: border-box !important;
  margin: 0 !important;
  border: none !important;
  /* Height is set inline by MergeView — do not override */
  min-height: 0 !important;
  max-height: none !important;
  background-color: color-mix(in oklch, var(--muted) 12%, var(--editor-bg, var(--background))) !important;
  background-image: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 5px,
    ${HATCH} 5px,
    ${HATCH} 6px
  ) !important;
}

/* Unified only — split MergeView needs spacers to align panes */
.git-diff-unified .cm-mergeSpacer {
  display: none !important;
}

/* ── Collapsed unchanged — simple per-pane fold strip (CM native) ── */
.git-diff-view .cm-collapsedLines {
  display: block !important;
  box-sizing: border-box !important;
  min-height: 28px !important;
  line-height: 1.35 !important;
  padding: 8px 12px !important;
  margin: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  border: none !important;
  border-radius: 0 !important;
  font-size: var(--font-size-12, 12px) !important;
  font-weight: 400 !important;
  color: var(--muted-foreground) !important;
  background: color-mix(in oklch, var(--muted) 80%, var(--background)) !important;
  cursor: pointer !important;
}
.git-diff-view .cm-collapsedLines::before,
.git-diff-view .cm-collapsedLines::after {
  content: none !important;
  display: none !important;
}

.git-diff-split {
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
}
.git-diff-split .cm-mergeView {
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
  box-sizing: border-box !important;
}
.git-diff-split .cm-mergeViewEditors {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  position: relative !important;
}
/* Center split divider — visible column boundary */
.git-diff-split .cm-mergeViewEditors::before {
  content: "" !important;
  position: absolute !important;
  left: 50% !important;
  top: 0 !important;
  bottom: 0 !important;
  width: 1px !important;
  margin-left: -0.5px !important;
  background: var(--border) !important;
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--border) 40%, transparent) !important;
  pointer-events: none !important;
  z-index: 4 !important;
}
.git-diff-split .cm-mergeViewEditor {
  flex: 1 1 0 !important;
  min-width: 0 !important;
  max-width: 50% !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
.git-diff-split .cm-editor {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: hidden !important;
}
.git-diff-split .cm-mergeView .cm-scroller {
  overflow-x: auto !important;
  overflow-y: visible !important;
  max-width: 100% !important;
  width: 100% !important;
}

/* Inline split — full vertical height; outer list scrolls vertically */
.git-diff-split--inline .cm-mergeView {
  height: auto !important;
  max-height: none !important;
  overflow-y: visible !important;
}
.git-diff-split--inline .cm-mergeViewEditors {
  height: auto !important;
}

/* Fill-pane split — scroll inside viewer tab */
.git-diff-split--fill .cm-mergeView {
  height: 100% !important;
  max-height: 100% !important;
  overflow-y: auto !important;
}
.git-diff-split--fill .cm-mergeView .cm-scroller {
  overflow-y: auto !important;
}
`;

let styleElement: HTMLStyleElement | null = null;

/** Inject the diff override CSS into the document. Idempotent; updates on change. */
export function injectDiffOverrides(): void {
  if (typeof document === "undefined") return;
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = "prism-diff-overrides";
    document.head.appendChild(styleElement);
  }
  styleElement.textContent = DIFF_CSS;
}

/** Remove the injected CSS (cleanup). */
export function removeDiffOverrides(): void {
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }
}

// ────────────────────────────────────────────────────────────
// Layer 2: CM6 Prec.highest theme — beats scoped community themes
// ────────────────────────────────────────────────────────────

/**
 * A CM6 theme extension at absolute highest precedence that applies
 * the SAME unified diff rules from within CM6's StyleModule.
 *
 * Because this runs at Prec.highest, it is ordered LAST in the
 * merged stylesheet.  Combined with !important it overrides even
 * community themes that ship their own !important diff rules
 * (GitHub's `ins.cm-insertedLine .cm-changedText { background:
 * transparent !important }` etc.).
 */
export const diffDisplayTheme = Prec.highest(
  EditorView.theme(
    {
      // ── Kill all decorations on every diff element ──
      "del, del *, ins, ins *": {
        border: "none !important",
        outline: "none !important",
        boxShadow: "none !important",
        textDecoration: "none !important",
      },
      ".cm-deletedLine, .cm-deletedLine *": {
        border: "none !important",
        outline: "none !important",
        boxShadow: "none !important",
        textDecoration: "none !important",
        background: `${DEL_BG} !important`,
        padding: "0 !important",
        borderRadius: "0 !important",
      },
      ".cm-insertedLine, .cm-insertedLine *": {
        border: "none !important",
        outline: "none !important",
        boxShadow: "none !important",
        textDecoration: "none !important",
        background: `${INS_BG} !important`,
        padding: "0 !important",
        borderRadius: "0 !important",
      },
      ".cm-deletedChunk": {
        border: "none !important",
        outline: "none !important",
        boxShadow: "none !important",
        background: `${DEL_BG} !important`,
        padding: "0 !important",
        borderRadius: "0 !important",
      },
      /* Unified default: changed/inserted = green; split merge-a overrides below */
      ".cm-changedLine, .cm-inlineChangedLine": {
        border: "none !important",
        outline: "none !important",
        boxShadow: "none !important",
        background: `${INS_BG} !important`,
        padding: "0 !important",
        borderRadius: "0 !important",
      },
      "&.cm-merge-a .cm-changedLine, &.cm-merge-a .cm-inlineChangedLine": {
        background: `${DEL_BG} !important`,
      },
      "&.cm-merge-b .cm-insertedLine": {
        background: `${INS_BG} !important`,
      },

      // ── Word-level deleted — deeper red ──
      ".cm-deletedText": {
        background: `${DEL_TEXT} !important`,
        borderRadius: "2px",
        border: "none !important",
        outline: "none !important",
        textDecoration: "none !important",
      },
      "&.cm-merge-a .cm-deletedText, &.cm-merge-a .cm-changedText": {
        background: `${DEL_TEXT} !important`,
      },

      // ── Word-level changed — deeper green (unified + split right) ──
      ".cm-changedText": {
        background: `${INS_TEXT} !important`,
        borderRadius: "2px",
        border: "none !important",
        outline: "none !important",
        textDecoration: "none !important",
      },

      // ── Gutter: unified = del red / change green; split = per-pane ──
      ".cm-deletedLineGutter": {
        background: `${DEL_BG} !important`,
      },
      ".cm-changedLineGutter, .cm-inlineChangedLineGutter": {
        background: `${INS_BG} !important`,
      },
      "&.cm-merge-a .cm-changedLineGutter": {
        background: `${DEL_BG} !important`,
      },
      "&.cm-merge-b .cm-changedLineGutter": {
        background: `${INS_BG} !important`,
      },
    },
    { dark: false } // applies to both light and dark, theme handles vars
  )
);

// ────────────────────────────────────────────────────────────
// Additional high-specificity overrides for stubborn community themes
// ────────────────────────────────────────────────────────────

/**
 * Some @fsegurai themes use very specific selectors like
 * `ins.cm-insertedLine .cm-changedText { background: transparent !important }`
 * that can slip past the generic rules above when both use !important
 * and CM6 scoping gives the community theme the same specificity.
 *
 * This second theme doubles down on those exact selectors so that
 * Prec.highest ordering breaks the tie in our favour.
 */
export const diffDisplayThemeExtra = Prec.highest(
  EditorView.theme(
    {
      // Override @fsegurai's transparent background on changed text inside inserted lines
      "ins.cm-insertedLine .cm-changedText": {
        background: `${INS_TEXT} !important`,
        border: "none !important",
        textDecoration: "none !important",
        padding: "0 !important",
        borderRadius: "0 !important",
      },
      // Override @fsegurai's transparent background on deleted/changed text inside deleted lines
      "del.cm-deletedLine .cm-deletedText, del.cm-deletedLine .cm-changedText": {
        background: `${DEL_TEXT} !important`,
        border: "none !important",
        textDecoration: "none !important",
        padding: "0 !important",
        borderRadius: "0 !important",
      },
      // Override @fsegurai's !important backgrounds on line-level elements
      "ins.cm-insertedLine, ins.cm-insertedLine:not(:has(.cm-changedText))": {
        background: `${INS_BG} !important`,
        border: "none !important",
        padding: "0 !important",
        borderRadius: "0 !important",
      },
      "del.cm-deletedLine, del.cm-deletedLine:not(:has(.cm-deletedText))": {
        background: `${DEL_BG} !important`,
        border: "none !important",
        padding: "0 !important",
        borderRadius: "0 !important",
      },
      // Kill borders + padding + radius that @fsegurai themes add
      ".cm-insertedLine, .cm-deletedLine": {
        border: "none !important",
        padding: "0 !important",
        borderRadius: "0 !important",
      },
    },
    { dark: false }
  )
);

// ────────────────────────────────────────────────────────────
// Content metrics — force uniform font-size / line-height / font-family
// ────────────────────────────────────────────────────────────

/**
 * All @fsegurai community themes hardcode their own font metrics:
 *
 *   generalContent = {
 *     fontSize: '14px',
 *     fontFamily: 'JetBrains Mono, Consolas, monospace',
 *     lineHeight: '1.6',
 *   }
 *   generalGutter = {
 *     fontSize: '0.9em',
 *     fontWeight: '500',
 *     lineHeight: '1.78',
 *   }
 *
 * This Prec.highest theme overrides EVERYTHING back to our CSS
 * custom properties, so switching between Prism / GitHub / Nord /
 * Monokai / etc. never causes the text to jump, resize, or reflow.
 */
export const contentMetricsTheme = Prec.highest(
  EditorView.theme(
    {
      // Editor root — font family + size from CSS vars
      "&": {
        fontFamily: "var(--font-editor) !important",
        fontSize: "var(--font-editor-size) !important",
      },
      // Content area — also set family/size + kill any line-height override
      ".cm-content": {
        fontFamily: "var(--font-editor) !important",
        fontSize: "var(--font-editor-size) !important",
        lineHeight: "var(--editor-line-height, normal) !important",
      },
      // Gutter — reset the 0.9em / 1.78 nonsense
      ".cm-gutters": {
        fontFamily: "var(--font-editor) !important",
        fontSize: "var(--font-editor-size) !important",
        fontWeight: "normal !important",
        lineHeight: "var(--editor-line-height, normal) !important",
      },
      // Fold gutter elements inherit gutter font size from community themes
      ".cm-foldGutter .cm-gutterElement": {
        fontSize: "inherit !important",
        lineHeight: "inherit !important",
      },
      // Gutter line-number spans
      ".cm-lineNumbers .cm-gutterElement": {
        fontSize: "inherit !important",
        lineHeight: "inherit !important",
      },
    },
    { dark: false }
  )
);

/** Beat @fsegurai community themes — gutter gap, content padding, diff line inset. */
export const diffLayoutTheme = Prec.highest(
  EditorView.theme(
    {
      ".cm-gutters": {
        paddingLeft: "0 !important",
        paddingRight: "0 !important",
        borderRight: "none !important",
        borderLeft: "none !important",
        margin: "0 !important",
      },
      ".cm-changeGutter": {
        width: "0 !important",
        minWidth: "0 !important",
        maxWidth: "0 !important",
        flex: "0 0 0 !important",
        padding: "0 !important",
        margin: "0 !important",
        border: "none !important",
        overflow: "hidden !important",
      },
      ".cm-content": {
        paddingLeft: "0 !important",
        paddingRight: "0 !important",
      },
      ".cm-line": {
        paddingLeft: "0 !important",
        paddingRight: "4px !important",
      },
      ".cm-changedLine, .cm-inlineChangedLine, .cm-insertedLine, .cm-deletedLine, .cm-deletedChunk": {
        padding: "0 !important",
        margin: "0 !important",
        borderRadius: "0 !important",
        border: "none !important",
      },
      "ins.cm-insertedLine, del.cm-deletedLine": {
        padding: "0 !important",
        margin: "0 !important",
        border: "none !important",
        borderRadius: "0 !important",
        display: "block !important",
        width: "100% !important",
        boxSizing: "border-box !important",
      },
      ".cm-changedLine, .cm-inlineChangedLine": {
        display: "block !important",
        width: "100% !important",
        boxSizing: "border-box !important",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        paddingLeft: "8px !important",
        paddingRight: "8px !important",
        boxSizing: "border-box !important",
      },
    },
    { dark: false },
  ),
);

/** Git diff — line-level only; paint on `.cm-line` + unified `.cm-deletedChunk`. */
export const gitDiffDisplayTheme = Prec.highest(
  EditorView.theme(
    {
      ".cm-line.git-diff-line-del": {
        background: `${DEL_BG} !important`,
      },
      ".cm-line.git-diff-line-ins": {
        background: `${INS_BG} !important`,
      },
      ".cm-deletedChunk": {
        background: `${DEL_BG} !important`,
        backgroundImage: "none !important",
        border: "none !important",
        padding: "0 !important",
        borderRadius: "0 !important",
      },
      ".cm-line .cm-insertedLine, .cm-line ins.cm-insertedLine, .cm-line .cm-deletedLine, .cm-line del.cm-deletedLine, .cm-line .cm-changedLine, .cm-line .cm-inlineChangedLine": {
        border: "none !important",
        outline: "none !important",
        boxShadow: "none !important",
        textDecoration: "none !important",
        background: "transparent !important",
        backgroundImage: "none !important",
        padding: "0 !important",
        borderRadius: "0 !important",
      },
      ".cm-line .cm-changedText, .cm-line .cm-deletedText, .cm-deletedChunk .cm-deletedLine, .cm-deletedChunk del, .cm-deletedChunk .cm-deletedText, .cm-deletedChunk span": {
        background: "transparent !important",
        backgroundImage: "none !important",
        border: "none !important",
        textDecoration: "none !important",
      },
      ".cm-deletedLineGutter, .cm-changedLineGutter, .cm-inlineChangedLineGutter": {
        background: "transparent !important",
      },
    },
    { dark: false },
  ),
);

/** Split MergeView panes — clip long lines inside each half; beat CM merge baseTheme. */
export const splitMergePaneTheme = Prec.highest(
  EditorView.theme(
    {
      "&": {
        width: "100% !important",
        maxWidth: "100% !important",
        minWidth: "0 !important",
      },
      ".cm-scroller": {
        overflowX: "auto !important",
        overflowY: "visible !important",
        maxWidth: "100% !important",
      },
    },
    { dark: false },
  ),
);
