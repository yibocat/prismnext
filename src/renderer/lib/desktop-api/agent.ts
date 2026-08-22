/**
 * Agent desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by chat-store, settings-store (effort catalog), and checkpoint-store.
 */

import { forwardDesktop } from "./forward";

export const agentDesktop = {
  agentSend: forwardDesktop("agentSend"),
  agentCancel: forwardDesktop("agentCancel"),
  agentCancelSubagent: forwardDesktop("agentCancelSubagent"),
  agentDispose: forwardDesktop("agentDispose"),
  agentLoadSession: forwardDesktop("agentLoadSession"),
  agentRenameSession: forwardDesktop("agentRenameSession"),
  agentUpsertTurnMeta: forwardDesktop("agentUpsertTurnMeta"),
  agentUpsertPlanArtifact: forwardDesktop("agentUpsertPlanArtifact"),
  agentAppendPlanDecision: forwardDesktop("agentAppendPlanDecision"),
  agentMarkPlanArtifactDiscarded: forwardDesktop("agentMarkPlanArtifactDiscarded"),
  agentResolvePlanSuggest: forwardDesktop("agentResolvePlanSuggest"),
  agentGetModelEffort: forwardDesktop("agentGetModelEffort"),
  agentTruncateToTurn: forwardDesktop("agentTruncateToTurn"),
  agentUndoTruncate: forwardDesktop("agentUndoTruncate"),
};
