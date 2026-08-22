/**
 * Native dialog desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 */

import { forwardDesktop } from "./forward";

export const dialogDesktop = {
  dialogOpenFolder: forwardDesktop("dialogOpenFolder"),
};
