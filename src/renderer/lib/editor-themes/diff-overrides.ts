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
 *   • Word-level tokens:  deeper saturated background, NO underline, NO border
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
const DEL_BG = "var(--editor-diff-deleted-bg, rgba(248,81,81,0.12))";
const INS_BG = "var(--editor-diff-inserted-bg, rgba(52,211,110,0.12))";
const DEL_TEXT = "var(--editor-diff-deleted-text, rgba(248,81,81,0.18))";
const INS_TEXT = "var(--editor-diff-inserted-text, rgba(52,211,110,0.18))";

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

/* ── Deleted lines / chunks: one clean reddish background ── */
.cm-editor .cm-content .cm-deletedChunk,
.cm-editor .cm-content .cm-deletedLine {
  background: ${DEL_BG} !important;
}

/* ── Changed / inserted lines: one clean greenish background ── */
.cm-editor .cm-content .cm-changedLine,
.cm-editor .cm-content .cm-insertedLine,
.cm-editor .cm-content .cm-inlineChangedLine {
  background: ${INS_BG} !important;
}

/* ── Word-level deleted tokens: deeper red, no underline ── */
.cm-editor .cm-content .cm-deletedText {
  background: ${DEL_TEXT} !important;
  border-radius: 2px;
}

/* ── Word-level changed tokens: deeper green, NO underline ──
     Uses 'background' shorthand to kill the merge baseTheme's
     linear-gradient underline at bottom/100% 2px.                ── */
.cm-editor .cm-content .cm-changedText {
  background: ${INS_TEXT} !important;
  border-radius: 2px;
}

/* ── Gutter markers ── */
.cm-editor .cm-content .cm-deletedLineGutter {
  background: ${DEL_BG} !important;
}
.cm-editor .cm-content .cm-changedLineGutter {
  background: ${INS_BG} !important;
}
.cm-editor .cm-content .cm-mergeSpacer {
  display: none !important;
}
`;

let styleElement: HTMLStyleElement | null = null;

/** Inject the diff override CSS into the document. Idempotent. */
export function injectDiffOverrides(): void {
  if (styleElement) return;
  if (typeof document === "undefined") return;
  styleElement = document.createElement("style");
  styleElement.id = "prism-diff-overrides";
  styleElement.textContent = DIFF_CSS;
  document.head.appendChild(styleElement);
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
      ".cm-changedLine, .cm-inlineChangedLine": {
        border: "none !important",
        outline: "none !important",
        boxShadow: "none !important",
        background: `${INS_BG} !important`,
        padding: "0 !important",
        borderRadius: "0 !important",
      },

      // ── Word-level deleted — deeper red ──
      ".cm-deletedText": {
        background: `${DEL_TEXT} !important`,
        borderRadius: "2px",
        border: "none !important",
        outline: "none !important",
        textDecoration: "none !important",
      },

      // ── Word-level changed — deeper green, NO underline ──
      //     Targeting .cm-changedText AND overriding inside ins/del
      //     to beat community themes that set background:transparent.
      ".cm-changedText": {
        background: `${INS_TEXT} !important`,
        borderRadius: "2px",
        border: "none !important",
        outline: "none !important",
        textDecoration: "none !important",
      },

      // ── Gutter ──
      ".cm-deletedLineGutter": {
        background: `${DEL_BG} !important`,
      },
      ".cm-changedLineGutter": {
        background: `${INS_BG} !important`,
      },
      ".cm-mergeSpacer": {
        display: "none !important",
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
