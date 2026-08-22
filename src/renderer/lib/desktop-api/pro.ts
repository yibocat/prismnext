/**
 * Pro license desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by pro-license-store.
 */

import { forwardDesktop } from "./forward";

export const proDesktop = {
  proGetLicense: forwardDesktop("proGetLicense"),
  proActivate: forwardDesktop("proActivate"),
  proClearLicense: forwardDesktop("proClearLicense"),
};
