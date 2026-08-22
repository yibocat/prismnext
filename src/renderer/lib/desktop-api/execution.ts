/**
 * Execution desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by project-lifecycle for project-switch running-job checks.
 */

import { forwardDesktop } from "./forward";

export const executionDesktop = {
  executionListRunning: forwardDesktop("executionListRunning"),
};
