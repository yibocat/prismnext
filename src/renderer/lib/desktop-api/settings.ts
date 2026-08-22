/**
 * Settings desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by settings-store, theme-store, and settings persist helpers in lib/.
 */

import { forwardDesktop } from "./forward";

export const settingsDesktop = {
  settingsGet: forwardDesktop("settingsGet"),
  settingsSet: forwardDesktop("settingsSet"),
  themeSetGlassMode: forwardDesktop("themeSetGlassMode"),
};
