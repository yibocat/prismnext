// prism-next/src/renderer/lib/editor-themes/types.ts

import type { Extension } from "@codemirror/state";

export type ThemeMode = "dark" | "light";

export interface EditorSyntaxThemeDef {
  /** Unique identifier, persisted to settings */
  id: EditorSyntaxThemeId;
  /** Display name in the card picker */
  name: string;
  /** Short description for tooltip */
  description: string;
  /** Whether this theme is the default (Prism Next) */
  isDefault?: boolean;
  /** Returns the CM6 syntax highlighting extension for the given mode */
  getExtension: (mode: ThemeMode) => Extension;
  /** Whether this theme has a native variant for the given mode (false = falls back to Prism Next) */
  hasNativeVariant: (mode: ThemeMode) => boolean;
}

export type EditorSyntaxThemeId =
  | "prism"
  | "github"
  | "nord"
  | "one-dark"
  | "monokai"
  | "dracula"
  | "tokyo-night"
  | "solarized-light";

export const DEFAULT_SYNTAX_THEME: EditorSyntaxThemeId = "prism";
