/**
 * Git hosting desktop port (`gh` CLI).
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 */

import { forwardDesktop } from "./forward";

export const gitHostingDesktop = {
  gitHostingAuthStatus: forwardDesktop("gitHostingAuthStatus"),
  gitHostingPrCreate: forwardDesktop("gitHostingPrCreate"),
  gitHostingPrViewWeb: forwardDesktop("gitHostingPrViewWeb"),
};
