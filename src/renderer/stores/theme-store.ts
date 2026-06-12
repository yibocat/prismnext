// stores/theme-store.ts
// Central store for theme configuration and CSS generation.

import { create } from "zustand";
import {
  type ThemeConfig,
  getDefaultThemeConfig,
  generateThemeCSS,
} from "@/lib/theme/theme-generator";

// Debounce state for _regenerate — batches rapid CSS injections (e.g. slider drags)
// into at most one DOM update per frame to avoid style-recalc thrashing.
let _pendingCSS: string | null = null;
let _regenerateTimer: ReturnType<typeof setTimeout> | null = null;

function _injectCSS(cssText: string): void {
  try {
    let styleEl = document.getElementById("prism-theme") as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "prism-theme";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = cssText;
  } catch (e) {
    console.error("[theme-store] Failed to inject theme CSS:", e);
  }
}

interface ThemeState {
  config: ThemeConfig;
  cssText: string;
  loadConfig: () => Promise<void>;
  saveConfig: (config: ThemeConfig) => Promise<void>;
  updateConfig: (patch: Partial<ThemeConfig>) => Promise<void>;
  _regenerate: (config: ThemeConfig) => void;
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  config: getDefaultThemeConfig(),
  cssText: generateThemeCSS(getDefaultThemeConfig()),

  _regenerate: (config: ThemeConfig) => {
    const cssText = generateThemeCSS(config);
    // Update Zustand state immediately — consumers read from here for UI
    set({ config, cssText });

    // Debounce the actual DOM style injection.
    // Rapid calls (e.g. slider drag at 60fps) batch into one injection per frame,
    // preventing style-recalculation thrashing.
    _pendingCSS = cssText;
    if (!_regenerateTimer) {
      _regenerateTimer = setTimeout(() => {
        _regenerateTimer = null;
        const latest = _pendingCSS;
        _pendingCSS = null;
        if (latest !== null) _injectCSS(latest);
      }, 16); // ~1 frame at 60fps
    }
  },

  loadConfig: async () => {
    try {
      const raw = await window.electronAPI.settingsGet();
      // Migrate legacy themeColor if present — just use defaults with the primary color
      if ((raw as any).themeColor && !(raw as any)._themeMigrated) {
        const defaults = getDefaultThemeConfig();
        const legacy = (raw as any).themeColor as string;
        const primaryMap: Record<string, string> = {
          "academic-blue": "blue",
          "teal": "teal",
          "ink-green": "green",
          "rose": "rose",
          "violet": "violet",
          "amber": "amber",
          "mono": "blue",
        };
        const migrated: ThemeConfig = {
          ...defaults,
          primaryColor: primaryMap[legacy] ?? defaults.primaryColor,
          glassEffect: (raw as any).glassEffect ?? defaults.glassEffect,
          glassIntensity: (raw as any).glassIntensity ?? defaults.glassIntensity,
        };
        get()._regenerate(migrated);
        await window.electronAPI.settingsSet({ _themeMigrated: true });
        return;
      }

      if ((raw as any)._themeConfig) {
        const saved = (raw as any)._themeConfig as ThemeConfig;
        get()._regenerate(saved);
        return;
      }
    } catch {
      // electron-store read failed — use defaults below
    }
    // Always inject the style tag with current config (saved or default)
    get()._regenerate(get().config);
  },

  saveConfig: async (config: ThemeConfig) => {
    get()._regenerate(config);
    try {
      await window.electronAPI.settingsSet({ _themeConfig: config });
    } catch {
      // Persist failed — state is still applied in-memory
    }
  },

  updateConfig: async (patch: Partial<ThemeConfig>) => {
    const config = { ...get().config, ...patch };
    await get().saveConfig(config);

    // Sync native vibrancy to match the effective theme mode.
    // Theme mode (dark/light/system) is managed by next-themes ThemeProvider,
    // not by ThemeConfig. Detect effective mode from the DOM:
    // next-themes adds .dark class to <html> based on user choice or system preference.
    if (config.glassEffect) {
      const isDark = document.documentElement.classList.contains("dark");
      const effectiveMode = isDark ? "dark" : "light";
      try {
        await window.electronAPI.themeSetGlassMode(
          effectiveMode as "light" | "dark" | "system"
        );
      } catch {
        // Non-critical — glass still works with CSS vars alone
      }
    } else {
      // Glass off: revert to default vibrancy (system-following)
      try {
        await window.electronAPI.themeSetGlassMode("system");
      } catch {
        // Non-critical
      }
    }
  },
}));
