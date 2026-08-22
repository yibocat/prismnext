// src/main/app/glass-vibrancy.ts
// Maps app theme mode to native OS vibrancy/acrylic material.
// Called from IPC handler whenever the user changes theme or glass settings.

import { BrowserWindow, nativeTheme } from "electron";

export type VibrancyMode = "light" | "dark" | "system";

/**
 * Set the native window vibrancy/acrylic material to match the app theme.
 * - macOS: `win.setVibrancy("dark" | "light")`
 * - Windows: `win.setBackgroundMaterial("acrylic" | "mica")`
 * - Linux: no-op (no native blur support)
 */
export function setVibrancyForTheme(
  win: BrowserWindow,
  mode: VibrancyMode,
): void {
  const isDark =
    mode === "system"
      ? nativeTheme.shouldUseDarkColors
      : mode === "dark";

  if (process.platform === "darwin") {
    // Electron 35's setVibrancy only accepts material types (titlebar, content,
    // under-window, …), not the old "dark"/"light" values — those were removed
    // and silently ignored, so the vibrancy effect never applied. "under-window"
    // is the standard translucent material that automatically adapts to the
    // system light/dark appearance, matching the original dark/light intent.
    win.setVibrancy("under-window");
  } else if (process.platform === "win32") {
    win.setBackgroundMaterial(isDark ? "acrylic" : "mica");
  }
  // Linux: no-op
}
