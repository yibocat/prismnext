// stores/theme-store.ts
// Central store for theme configuration and CSS generation.

import { create } from "zustand";
import {
  type ThemeConfig,
  getDefaultThemeConfig,
  generateThemeCSS,
} from "@/lib/theme/theme-generator";
import { migrateToThemePackConfig } from "@/lib/theme/theme-migrate";
import { settingsDesktop } from "@/lib/desktop-api/settings";

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
    set({ config, cssText });

    _pendingCSS = cssText;
    if (!_regenerateTimer) {
      _regenerateTimer = setTimeout(() => {
        _regenerateTimer = null;
        const latest = _pendingCSS;
        _pendingCSS = null;
        if (latest !== null) _injectCSS(latest);
      }, 16);
    }
  },

  loadConfig: async () => {
    try {
      const raw = await settingsDesktop.settingsGet();
      const saved = raw._themeConfig ?? {};
      const migrated = migrateToThemePackConfig({
        ...saved,
        themeColor: raw.themeColor,
      });
      get()._regenerate(migrated);

      if (!raw._themePackMigrated) {
        await settingsDesktop.settingsSet({
          _themeConfig: migrated,
          _themePackMigrated: true,
        });
      }
      return;
    } catch {
      // electron-store read failed — use defaults below
    }
    get()._regenerate(get().config);
  },

  saveConfig: async (config: ThemeConfig) => {
    get()._regenerate(config);
    try {
      await settingsDesktop.settingsSet({ _themeConfig: config });
    } catch {
      // Persist failed — state is still applied in-memory
    }
  },

  updateConfig: async (patch: Partial<ThemeConfig>) => {
    const config = { ...get().config, ...patch };
    await get().saveConfig(config);

    if (config.glassEffect) {
      const isDark = document.documentElement.classList.contains("dark");
      const effectiveMode = isDark ? "dark" : "light";
      try {
        await settingsDesktop.themeSetGlassMode(
          effectiveMode as "light" | "dark" | "system",
        );
      } catch {
        // Non-critical — glass still works with CSS vars alone
      }
    } else {
      try {
        await settingsDesktop.themeSetGlassMode("system");
      } catch {
        // Non-critical
      }
    }
  },
}));
