// prism-next/src/renderer/lib/editor-themes/registry.ts

import type { Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { createPrismHighlightStyle } from "./prism-theme";
import type { EditorSyntaxThemeDef, EditorSyntaxThemeId, ThemeMode } from "./types";

// ── Lazy-loaded community theme imports ──
// Each returns a Promise<Extension> for the given mode.
// Dynamic imports keep the renderer bundle lean.

type ThemeLoader = () => Promise<Extension>;

const communityLoaders: Record<string, { dark?: ThemeLoader; light?: ThemeLoader }> = {
  github: {
    dark: async () => {
      const m = await import("@fsegurai/codemirror-theme-github-dark");
      return m.githubDark;
    },
    light: async () => {
      const m = await import("@fsegurai/codemirror-theme-github-light");
      return m.githubLight;
    },
  },
  nord: {
    dark: async () => {
      const m = await import("@fsegurai/codemirror-theme-nord");
      return m.nord;
    },
  },
  monokai: {
    dark: async () => {
      const m = await import("@fsegurai/codemirror-theme-monokai");
      return m.monokai;
    },
  },
  dracula: {
    dark: async () => {
      const m = await import("@uiw/codemirror-theme-dracula");
      return m.dracula;
    },
  },
  "tokyo-night": {
    dark: async () => {
      const m = await import("@fsegurai/codemirror-theme-tokyo-night-storm");
      return m.tokyoNightStorm;
    },
  },
  "solarized-light": {
    light: async () => {
      const m = await import("@fsegurai/codemirror-theme-solarized-light");
      return m.solarizedLight;
    },
  },
};

// ── Theme Definitions ──

export const SYNTAX_THEMES: EditorSyntaxThemeDef[] = [
  {
    id: "prism",
    name: "Prism Next",
    description: "Auto-adapts to your app theme color. Always in harmony.",
    isDefault: true,
    getExtension: () => createPrismHighlightStyle(),
    hasNativeVariant: () => true,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Clean, familiar syntax colors from github.com.",
    getExtension: (_mode: ThemeMode) => {
      throw new Error("GitHub theme requires async resolution — use getThemeExtensionAsync");
    },
    hasNativeVariant: () => true,
  },
  {
    id: "nord",
    name: "Nord",
    description: "Arctic, bluish dark palette. Easy on the eyes.",
    getExtension: (mode: ThemeMode) => {
      if (mode === "dark") throw new Error("Nord theme requires async resolution");
      return createPrismHighlightStyle(); // Nord is dark-only, fallback to Prism Next for light
    },
    hasNativeVariant: (mode: ThemeMode) => mode === "dark",
  },
  {
    id: "one-dark",
    name: "One Dark",
    description: "Atom editor's classic dark theme.",
    getExtension: (mode: ThemeMode) => {
      if (mode === "dark") return oneDark;
      return createPrismHighlightStyle(); // fallback to Prism Next for light mode
    },
    hasNativeVariant: (mode: ThemeMode) => mode === "dark",
  },
  {
    id: "monokai",
    name: "Monokai",
    description: "Sublime Text classic — vibrant, high contrast.",
    getExtension: (mode: ThemeMode) => {
      if (mode === "dark") throw new Error("Monokai requires async resolution");
      return createPrismHighlightStyle();
    },
    hasNativeVariant: (mode: ThemeMode) => mode === "dark",
  },
  {
    id: "dracula",
    name: "Dracula",
    description: "Purple-dominant dark theme. Community favorite.",
    getExtension: (mode: ThemeMode) => {
      if (mode === "dark") throw new Error("Dracula requires async resolution");
      return createPrismHighlightStyle();
    },
    hasNativeVariant: (mode: ThemeMode) => mode === "dark",
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    description: "Deep night sky tones. Neovim community favorite.",
    getExtension: (mode: ThemeMode) => {
      if (mode === "dark") throw new Error("Tokyo Night requires async resolution");
      return createPrismHighlightStyle();
    },
    hasNativeVariant: (mode: ThemeMode) => mode === "dark",
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    description: "Precision warm-light palette. Academic classic.",
    getExtension: (mode: ThemeMode) => {
      if (mode === "light") throw new Error("Solarized Light requires async resolution");
      return createPrismHighlightStyle();
    },
    hasNativeVariant: (mode: ThemeMode) => mode === "light",
  },
];

// ── Lookup helpers ──

const themeMap = new Map<EditorSyntaxThemeId, EditorSyntaxThemeDef>(
  SYNTAX_THEMES.map((t) => [t.id, t])
);

export function getThemeDef(id: EditorSyntaxThemeId): EditorSyntaxThemeDef {
  return themeMap.get(id) ?? themeMap.get("prism")!;
}

export function getAllThemeDefs(): EditorSyntaxThemeDef[] {
  return SYNTAX_THEMES;
}

/**
 * Resolves a theme extension, handling async community theme loading.
 * For Prism Next and oneDark (synchronous), returns immediately.
 * For community themes, lazy-loads and caches the extension.
 */
const extensionCache = new Map<string, Extension>();

export async function getThemeExtensionAsync(
  themeId: EditorSyntaxThemeId,
  mode: ThemeMode
): Promise<Extension> {
  const cacheKey = `${themeId}:${mode}`;
  const cached = extensionCache.get(cacheKey);
  if (cached) return cached;

  const def = getThemeDef(themeId);

  // Prism Next: synchronous
  if (themeId === "prism") {
    const ext = createPrismHighlightStyle();
    extensionCache.set(cacheKey, ext);
    return ext;
  }

  // oneDark dark mode: synchronous
  if (themeId === "one-dark" && mode === "dark") {
    extensionCache.set(cacheKey, oneDark);
    return oneDark;
  }

  // Fallback variants (no native variant for this mode)
  if (!def.hasNativeVariant(mode)) {
    const fallback = createPrismHighlightStyle();
    extensionCache.set(cacheKey, fallback);
    return fallback;
  }

  // Community theme async load
  const loader = communityLoaders[themeId]?.[mode];
  if (!loader) {
    const fallback = createPrismHighlightStyle();
    extensionCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const ext = await loader();
    extensionCache.set(cacheKey, ext);
    return ext;
  } catch (err) {
    console.error(`Failed to load theme "${themeId}" for ${mode} mode:`, err);
    const fallback = createPrismHighlightStyle();
    extensionCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Synchronous getter — only works for Prism Next and oneDark (dark).
 * Community themes return null (caller must use async path).
 */
export function getThemeExtensionSync(
  themeId: EditorSyntaxThemeId,
  mode: ThemeMode
): Extension | null {
  const cacheKey = `${themeId}:${mode}`;
  const cached = extensionCache.get(cacheKey);
  if (cached) return cached;

  if (themeId === "prism") {
    const ext = createPrismHighlightStyle();
    extensionCache.set(cacheKey, ext);
    return ext;
  }

  if (themeId === "one-dark" && mode === "dark") {
    extensionCache.set(cacheKey, oneDark);
    return oneDark;
  }

  const def = getThemeDef(themeId);
  if (!def.hasNativeVariant(mode)) {
    const fallback = createPrismHighlightStyle();
    extensionCache.set(cacheKey, fallback);
    return fallback;
  }

  return null; // must load async
}
