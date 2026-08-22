/**
 * Project desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by document-store and use-project-open.
 */

import { forwardDesktop } from "./forward";

export const projectDesktop = {
  projectCheck: forwardDesktop("projectCheck"),
  projectCreate: forwardDesktop("projectCreate"),
  projectOpen: forwardDesktop("projectOpen"),
  projectEnsure: forwardDesktop("projectEnsure"),
  projectActivate: forwardDesktop("projectActivate"),
  projectClose: forwardDesktop("projectClose"),
};
