/**
 * Workbench desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by document-store and workbench-store.
 */

import { forwardDesktop } from "./forward";

export const workbenchDesktop = {
  workbenchOpenFolder: forwardDesktop("workbenchOpenFolder"),
  workbenchGetState: forwardDesktop("workbenchGetState"),
  workbenchSetDefault: forwardDesktop("workbenchSetDefault"),
  workbenchSetDefaultFromFolder: forwardDesktop("workbenchSetDefaultFromFolder"),
  workbenchRemoveProject: forwardDesktop("workbenchRemoveProject"),
  workbenchUpdateDisplayName: forwardDesktop("workbenchUpdateDisplayName"),
  workbenchReorderProjects: forwardDesktop("workbenchReorderProjects"),
};
