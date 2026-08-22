/**
 * Workbench desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by document-store (open / close focus). workbench-store is not on this port yet.
 */

import { forwardDesktop } from "./forward";

export const workbenchDesktop = {
  workbenchOpenFolder: forwardDesktop("workbenchOpenFolder"),
  workbenchGetState: forwardDesktop("workbenchGetState"),
};
