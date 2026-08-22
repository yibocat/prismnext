/**
 * Project desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by document-store, use-project-open, and workspace-config-store.
 */

import { forwardDesktop } from "./forward";

export const projectDesktop = {
  projectCheck: forwardDesktop("projectCheck"),
  projectCreate: forwardDesktop("projectCreate"),
  projectOpen: forwardDesktop("projectOpen"),
  projectEnsure: forwardDesktop("projectEnsure"),
  projectActivate: forwardDesktop("projectActivate"),
  projectClose: forwardDesktop("projectClose"),
  workspaceGetConfig: forwardDesktop("workspaceGetConfig"),
  workspaceUpdateConfig: forwardDesktop("workspaceUpdateConfig"),
};
