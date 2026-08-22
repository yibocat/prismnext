/**
 * App updater desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by About and the sidebar update affordance.
 */

import { forwardDesktop } from "./forward";

export const updatesDesktop = {
  updateCheck: forwardDesktop("updateCheck"),
  updateStatus: forwardDesktop("updateStatus"),
  updateDownload: forwardDesktop("updateDownload"),
  updateInstall: forwardDesktop("updateInstall"),
  updateIgnore: forwardDesktop("updateIgnore"),
  updateUnignore: forwardDesktop("updateUnignore"),
  onUpdateProgress: forwardDesktop("onUpdateProgress"),
  onUpdateChanged: forwardDesktop("onUpdateChanged"),
  aboutGetVersions: forwardDesktop("aboutGetVersions"),
};
