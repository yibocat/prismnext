// Electron 43 native glass — sidebar vibrancy / mica, not the Electron 35
// dark/light material stubs (removed; they were silently ignored).

import { BrowserWindow, nativeTheme } from "electron";
import { getSettings } from "./settings";

export type ApplyGlassPayload = {
  enabled: boolean;
  /** Hex / CSS color for the opaque window fill when glass is off. */
  opaqueBackground?: string;
};

const OPAQUE_LIGHT = "#ffffff";
const OPAQUE_DARK = "#2c2c2c";

export function opaqueWindowBackgroundFromSettings(): string {
  const theme = getSettings().theme ?? "dark";
  const dark =
    theme === "dark" ||
    (theme === "system" && nativeTheme.shouldUseDarkColors);
  return dark ? OPAQUE_DARK : OPAQUE_LIGHT;
}

export function readPersistedGlassEffect(): boolean {
  const raw = getSettings()._themeConfig;
  if (
    raw &&
    typeof raw === "object" &&
    typeof (raw as { glassEffect?: unknown }).glassEffect === "boolean"
  ) {
    return (raw as { glassEffect: boolean }).glassEffect;
  }
  return false;
}

function invalidateShadowSafe(win: BrowserWindow): void {
  try {
    win.invalidateShadow();
  } catch {
    // Linux / older typings — ignore
  }
}

/** Apply or strip native desktop glass on an existing window (Electron 43 APIs). */
export function applyNativeGlass(
  win: BrowserWindow,
  options: ApplyGlassPayload,
): void {
  if (win.isDestroyed()) return;

  const enabled = options.enabled;
  const opaque =
    options.opaqueBackground?.trim() || opaqueWindowBackgroundFromSettings();

  if (process.platform === "darwin") {
    if (enabled) {
      win.setBackgroundColor("#00000000");
      win.setVibrancy("sidebar");
    } else {
      win.setVibrancy(null);
      win.setBackgroundColor(opaque);
    }
    invalidateShadowSafe(win);
    return;
  }

  if (process.platform === "win32") {
    if (enabled) {
      win.setBackgroundColor("#00000000");
      win.setBackgroundMaterial("mica");
    } else {
      win.setBackgroundMaterial("none");
      win.setBackgroundColor(opaque);
    }
    return;
  }

  win.setBackgroundColor(enabled ? "#00000000" : opaque);
}
