/**
 * In-app browser desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by browser-store.
 */

import { forwardDesktop } from "./forward";

export const browserDesktop = {
  browserInit: forwardDesktop("browserInit"),
  browserSaveBookmarks: forwardDesktop("browserSaveBookmarks"),
  browserSaveRecent: forwardDesktop("browserSaveRecent"),
};
