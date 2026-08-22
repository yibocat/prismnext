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
  agentResolvePermission: forwardDesktop("agentResolvePermission"),
  agentReassignDirectory: forwardDesktop("agentReassignDirectory"),
  agentListRules: forwardDesktop("agentListRules"),
  agentSetRuleEnabled: forwardDesktop("agentSetRuleEnabled"),
  agentDeleteRule: forwardDesktop("agentDeleteRule"),
  agentInstallRule: forwardDesktop("agentInstallRule"),
  agentListSkills: forwardDesktop("agentListSkills"),
  agentInstallSkill: forwardDesktop("agentInstallSkill"),
  agentDeleteSkill: forwardDesktop("agentDeleteSkill"),
  agentReinstallSkill: forwardDesktop("agentReinstallSkill"),
  agentCheckSkillUpdates: forwardDesktop("agentCheckSkillUpdates"),
  agentHomeSkillsDir: forwardDesktop("agentHomeSkillsDir"),
  agentReadBundledSkillMd: forwardDesktop("agentReadBundledSkillMd"),
  agentListSkillLibrarySources: forwardDesktop("agentListSkillLibrarySources"),
  agentFetchSkillLibraryCatalog: forwardDesktop("agentFetchSkillLibraryCatalog"),
  agentInstallLibraryCatalogItem: forwardDesktop("agentInstallLibraryCatalogItem"),
  agentInstallAllFromLibrarySource: forwardDesktop("agentInstallAllFromLibrarySource"),
  agentAddSkillLibrarySource: forwardDesktop("agentAddSkillLibrarySource"),
  agentSetSkillLibrarySourceConnected: forwardDesktop("agentSetSkillLibrarySourceConnected"),
  agentRemoveSkillLibrarySource: forwardDesktop("agentRemoveSkillLibrarySource"),
  subagentsList: forwardDesktop("subagentsList"),
  subagentsGetDetail: forwardDesktop("subagentsGetDetail"),
  subagentsSaveCustom: forwardDesktop("subagentsSaveCustom"),
  subagentsListRosterReferrers: forwardDesktop("subagentsListRosterReferrers"),
  subagentsDeleteCustom: forwardDesktop("subagentsDeleteCustom"),
  orchestratorsGetDetail: forwardDesktop("orchestratorsGetDetail"),
  orchestratorsSaveCustom: forwardDesktop("orchestratorsSaveCustom"),
};
