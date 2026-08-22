/**
 * Application-log desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by log-store.
 */

import { forwardDesktop } from "./forward";

export const logDesktop = {
  logFetch: forwardDesktop("logFetch"),
};
