// prism-next/src/renderer/components/modules/settings/editor-theme-picker.tsx

import { useMemo } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import { getAllThemeDefs } from "@/lib/editor-themes/registry";
import type { EditorSyntaxThemeId, EditorSyntaxThemeDef } from "@/lib/editor-themes/types";
import { DEFAULT_SYNTAX_THEME } from "@/lib/editor-themes/types";

// Color palettes for preview bars — hardcoded per theme for the card thumbnails
const THEME_PREVIEW_COLORS: Record<EditorSyntaxThemeId, {
  dark: { keyword: string; string: string; comment: string; bg: string };
  light: { keyword: string; string: string; comment: string; bg: string };
}> = {
  prism: {
    dark:  { keyword: "#a78bfa", string: "#34d399", comment: "#6b7280", bg: "#111127" },
    light: { keyword: "#7c3aed", string: "#059669", comment: "#9ca3af", bg: "#fafafa" },
  },
  github: {
    dark:  { keyword: "#ff7b72", string: "#a5d6ff", comment: "#8b949e", bg: "#0d1117" },
    light: { keyword: "#cf222e", string: "#0a3069", comment: "#6e7781", bg: "#ffffff" },
  },
  nord: {
    dark:  { keyword: "#81a1c1", string: "#a3be8c", comment: "#616e88", bg: "#2e3440" },
    light: { keyword: "#5e81ac", string: "#a3be8c", comment: "#616e88", bg: "#eceff4" },
  },
  "one-dark": {
    dark:  { keyword: "#c678dd", string: "#98c379", comment: "#5c6370", bg: "#282c34" },
    light: { keyword: "#c678dd", string: "#98c379", comment: "#5c6370", bg: "#282c34" },
  },
  monokai: {
    dark:  { keyword: "#f92672", string: "#e6db74", comment: "#75715e", bg: "#272822" },
    light: { keyword: "#f92672", string: "#e6db74", comment: "#75715e", bg: "#272822" },
  },
  dracula: {
    dark:  { keyword: "#ff79c6", string: "#f1fa8c", comment: "#6272a4", bg: "#282a36" },
    light: { keyword: "#ff79c6", string: "#f1fa8c", comment: "#6272a4", bg: "#282a36" },
  },
  "tokyo-night": {
    dark:  { keyword: "#9d7cd8", string: "#9ece6a", comment: "#565f89", bg: "#1a1b26" },
    light: { keyword: "#9d7cd8", string: "#9ece6a", comment: "#565f89", bg: "#1a1b26" },
  },
  "solarized-light": {
    dark:  { keyword: "#268bd2", string: "#2aa198", comment: "#93a1a1", bg: "#fdf6e3" },
    light: { keyword: "#268bd2", string: "#2aa198", comment: "#93a1a1", bg: "#fdf6e3" },
  },
};

function MiniPreviewBar({
  mode,
  colors,
  isFallback,
}: {
  mode: "dark" | "light";
  colors: { keyword: string; string: string; comment: string; bg: string };
  isFallback: boolean;
}) {
  return (
    <div
      className="flex-1 h-7 rounded-[3px] flex items-center px-1.5 gap-[2px] relative overflow-hidden"
      style={{
        backgroundColor: colors.bg,
        border: mode === "light" ? "1px solid rgba(0,0,0,0.1)" : "none",
      }}
    >
      {isFallback ? (
        <span className="text-[7px] text-muted-foreground absolute inset-0 flex items-center justify-center">
          ↳ Prism Next
        </span>
      ) : (
        <>
          <span
            className="inline-block h-[2px] rounded-sm"
            style={{ width: "8px", backgroundColor: colors.keyword }}
          />
          <span
            className="inline-block h-[2px] rounded-sm"
            style={{ width: "8px", backgroundColor: colors.string }}
          />
          <span
            className="inline-block h-[2px] rounded-sm"
            style={{ width: "8px", backgroundColor: colors.comment }}
          />
        </>
      )}
      <span className="absolute top-0.5 right-1.5 text-[7px] opacity-40">
        {mode === "dark" ? "🌙" : "☀️"}
      </span>
    </div>
  );
}

function SyntaxThemeCard({
  theme,
  isSelected,
  onSelect,
}: {
  theme: EditorSyntaxThemeDef;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const preview = THEME_PREVIEW_COLORS[theme.id];
  const darkNative = theme.hasNativeVariant("dark");
  const lightNative = theme.hasNativeVariant("light");

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative rounded-lg p-2.5 text-left transition-all cursor-pointer",
        "border-2",
        isSelected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-primary/40 hover:bg-muted/50",
      )}
    >
      {/* Checkmark badge when selected */}
      {isSelected && (
        <span className="absolute top-1.5 right-1.5 size-4 rounded-full bg-primary flex items-center justify-center">
          <CheckIcon className="size-2.5 text-primary-foreground" strokeWidth={3} />
        </span>
      )}

      {/* Theme name */}
      <p className="text-[11px] font-semibold mb-2">
        {theme.isDefault && <span className="mr-1">⭐</span>}
        {theme.name}
      </p>

      {/* Preview bars: dark + light */}
      <div className="flex gap-1.5">
        <MiniPreviewBar mode="dark" colors={preview.dark} isFallback={!darkNative} />
        <MiniPreviewBar mode="light" colors={preview.light} isFallback={!lightNative} />
      </div>

      {/* Auto-adapts label for Prism Next */}
      {theme.isDefault && (
        <p className="text-[9px] text-primary/70 mt-1.5 text-center">
          Auto-adapts to app theme
        </p>
      )}
    </button>
  );
}

export function EditorThemePicker() {
  const editorSyntaxTheme = useSettingsStore((s) => s.settings.editorSyntaxTheme) ?? DEFAULT_SYNTAX_THEME;
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const themes = useMemo(() => getAllThemeDefs(), []);

  return (
    <div>
      <h3 className="text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
        Editor
      </h3>
      <div className="rounded-lg border border-border px-4 divide-y divide-border">
        <div className="py-2.5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[length:var(--font-size-13)] font-medium">
                Editor Syntax Theme
              </p>
              <p className="text-[length:var(--font-size-12)] text-muted-foreground mt-0.5">
                Choose how code and LaTeX syntax is colored.
                Editor background always matches your app theme.
              </p>
            </div>
          </div>

          {/* Theme card grid */}
          <div className="grid grid-cols-3 gap-2.5 mt-3">
            {themes.map((theme) => (
              <SyntaxThemeCard
                key={theme.id}
                theme={theme}
                isSelected={theme.id === editorSyntaxTheme}
                onSelect={() =>
                  updateSettings({ editorSyntaxTheme: theme.id })
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
