/**
 * OS shell desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 */

import { forwardDesktop } from "./forward";

export const shellDesktop = {
  shellShowItemInFolder: forwardDesktop("shellShowItemInFolder"),
};
