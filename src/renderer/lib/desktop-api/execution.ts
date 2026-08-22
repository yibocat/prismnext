/**
 * Execution desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by project-lifecycle and execution-store.
 */

import { forwardDesktop } from "./forward";

export const executionDesktop = {
  executionListRunning: forwardDesktop("executionListRunning"),
  executionReplay: forwardDesktop("executionReplay"),
  executionGet: forwardDesktop("executionGet"),
  executionFindByToolCallId: forwardDesktop("executionFindByToolCallId"),
  executionCancel: forwardDesktop("executionCancel"),
  onExecutionEvent: forwardDesktop("onExecutionEvent"),
};
