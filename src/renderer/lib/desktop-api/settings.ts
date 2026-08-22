/**
 * Settings desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by settings-store. Theme / prompt-panel callers are not on this port yet.
 */

import { forwardDesktop } from "./forward";

export const settingsDesktop = {
  settingsGet: forwardDesktop("settingsGet"),
  settingsSet: forwardDesktop("settingsSet"),
};
