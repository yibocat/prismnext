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

function applyGlassDocumentFlag(enabled: boolean): void {
  document.documentElement.dataset.glass = enabled ? "on" : "off";
}

function opaqueWindowBackgroundCss(): string {
  return document.documentElement.classList.contains("dark") ? "#2c2c2c" : "#ffffff";
}

interface ThemeState {
  config: ThemeConfig;
  cssText: string;
  /** False until `loadConfig` finishes — do not apply native glass before this. */
  hydrated: boolean;
  loadConfig: () => Promise<void>;
  saveConfig: (config: ThemeConfig) => Promise<void>;
  updateConfig: (patch: Partial<ThemeConfig>) => Promise<void>;
  syncNativeGlass: () => void;
  _regenerate: (config: ThemeConfig) => void;
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  config: getDefaultThemeConfig(),
  cssText: generateThemeCSS(getDefaultThemeConfig()),
  hydrated: false,

  syncNativeGlass: () => {
    const { glassEffect } = get().config;
    applyGlassDocumentFlag(glassEffect);
    void settingsDesktop
      .themeApplyGlass({
        enabled: glassEffect,
        opaqueBackground: opaqueWindowBackgroundCss(),
      })
      .catch(() => {});
  },

  _regenerate: (config: ThemeConfig) => {
    const cssText = generateThemeCSS(config);
    set({ config, cssText });
    applyGlassDocumentFlag(config.glassEffect);

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
      set({ hydrated: true });
      get().syncNativeGlass();

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
    set({ hydrated: true });
    get().syncNativeGlass();
  },

  saveConfig: async (config: ThemeConfig) => {
    get()._regenerate(config);
    get().syncNativeGlass();
    try {
      await settingsDesktop.settingsSet({ _themeConfig: config });
    } catch {
      // Persist failed — state is still applied in-memory
    }
  },

  updateConfig: async (patch: Partial<ThemeConfig>) => {
    const config = { ...get().config, ...patch };
    await get().saveConfig(config);
  },
}));
