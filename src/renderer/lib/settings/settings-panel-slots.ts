/**
 * Settings editor pane — slot types for the settings RightArea.
 *
 * Product model:
 * - Center settings list: browse categories, toggles, summaries, launch actions.
 * - Settings RightArea: focused editors (forms, API keys, profile sheets, wizards).
 *
 * Main list actions call `openSettingsPanel({ kind, ... })` to mount an editor here.
 */

import { useSettingsStore } from "@/stores/settings-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { getProvider } from "@/lib/providers";
import { i18n } from "@/lib/i18n";
import type { WorkspaceFolderScope } from "@/lib/settings/workspace-template";

export type SettingsPanelSlot =
  | { kind: "placeholder"; title: string; description?: string }
  | { kind: "workspace-folder"; scope: WorkspaceFolderScope; mode: "edit"; index: number }
  | { kind: "workspace-folder"; scope: WorkspaceFolderScope; mode: "new" }
  | { kind: "ai-provider"; mode: "new" }
  | { kind: "ai-provider"; mode: "edit"; providerId: string }
  | { kind: "ai-provider"; mode: "builtin-key"; providerId: string }
  | { kind: "agent-expert"; mode: "new" }
  | { kind: "agent-expert"; mode: "edit"; expertId: string; title?: string }
  | { kind: "agent-expert"; mode: "customize-builtin"; expertId: string; title?: string }
  | { kind: "agent-orchestrator"; mode: "new" }
  | { kind: "agent-orchestrator"; mode: "edit"; orchestratorId: string; title?: string }
  | { kind: "agent-orchestrator"; mode: "customize-builtin"; orchestratorId: string; title?: string }
  | { kind: "prompt-markdown"; doc: "system-prompt" | "agents-md" }
  | { kind: "prompt-stack-preview" }
  | { kind: "research-brief"; focusSection?: string }
  | { kind: "agent-tools" }
  | { kind: "knowledge-modules" }
  | { kind: "builtin-commands" }
  | { kind: "rule-markdown"; mode: "new" }
  | { kind: "rule-markdown"; mode: "edit"; ruleId: string; title?: string }
  | { kind: "custom-command"; mode: "new" }
  | { kind: "custom-command"; mode: "edit"; commandId: string; title?: string }
  | { kind: "mcp-json" }
  | { kind: "mcp-catalog" }
  | { kind: "mcp-paste-json" }
  | { kind: "mcp-server"; serverName: string; title?: string }
  | { kind: "skill-markdown"; mode: "new" }
  | { kind: "skill-markdown"; mode: "edit"; skillId: string; title?: string }
  | { kind: "skill-markdown"; mode: "preview-bundled"; skillId: string; title?: string; absPath?: string }
  | { kind: "skill-library" }
  | { kind: "team-detail"; teamId: string; title?: string }
  | { kind: "shortcuts" }
  | { kind: "logs" }
  | { kind: "permission-rules"; field: "allowed-paths" | "allow-rules" | "deny-rules" };

function tt(key: string, fallback: string): string {
  return i18n.t(key, { defaultValue: fallback });
}

export function settingsPanelSlotTitle(slot: SettingsPanelSlot | null): string | null {
  if (!slot) return null;
  switch (slot.kind) {
    case "placeholder":
      return slot.title;
    case "workspace-folder": {
      if (slot.mode === "new") {
        return slot.scope === "project"
          ? tt("settings.slots.addFolder", "Add folder")
          : tt("settings.slots.addTemplateFolder", "Add template folder");
      }
      const dirs =
        slot.scope === "project"
          ? useWorkspaceConfigStore.getState().workspaceDirs
          : useSettingsStore.getState().settings.defaultWorkspaceDirs ?? [];
      return dirs[slot.index]?.name ?? tt("settings.slots.folder", "Folder");
    }
    case "ai-provider": {
      if (slot.mode === "new") return tt("settings.slots.addProvider", "Add provider");
      if (slot.mode === "builtin-key") {
        return getProvider(slot.providerId)?.name ?? tt("settings.slots.apiKey", "API key");
      }
      const custom = useSettingsStore
        .getState()
        .settings.aiCustomProviders?.find((cp) => cp.id === slot.providerId);
      return custom?.name ?? tt("settings.slots.provider", "Provider");
    }
    case "agent-expert": {
      if (slot.mode === "new") return tt("settings.slots.newExpert", "New expert");
      return slot.title ?? tt("settings.slots.expert", "Expert");
    }
    case "agent-orchestrator": {
      if (slot.mode === "new") return tt("settings.slots.newOrchestrator", "New orchestrator");
      return slot.title ?? tt("settings.slots.orchestrator", "Orchestrator");
    }
    case "prompt-markdown": {
      if (slot.doc === "system-prompt") return tt("settings.slots.systemPrompt", "System prompt");
      return tt("settings.slots.agentsMd", "AGENTS.md");
    }
    case "prompt-stack-preview":
      return tt("settings.slots.promptStackPreview", "Prompt stack preview");
    case "research-brief":
      return tt("settings.slots.researchBrief", "Research brief");
    case "agent-tools":
      return tt("settings.slots.agentTools", "Agent tools");
    case "knowledge-modules":
      return tt("settings.slots.knowledgeModules", "Knowledge modules");
    case "builtin-commands":
      return tt("settings.slots.builtinCommands", "Built-in commands");
    case "rule-markdown": {
      if (slot.mode === "new") return tt("settings.slots.newRule", "New rule");
      return slot.title ?? slot.ruleId;
    }
    case "custom-command": {
      if (slot.mode === "new") return tt("settings.slots.newCommand", "New command");
      return slot.title ? `/${slot.title}` : tt("settings.slots.command", "Command");
    }
    case "mcp-json":
      return tt("settings.slots.mcpJson", "mcp.json");
    case "mcp-catalog":
      return tt("settings.slots.mcpCatalog", "MCP catalog");
    case "mcp-paste-json":
      return tt("settings.slots.addFromJson", "Add from JSON");
    case "mcp-server":
      return slot.title ?? slot.serverName;
    case "skill-markdown": {
      if (slot.mode === "new") return tt("settings.slots.createSkill", "Create skill");
      return slot.title ?? slot.skillId;
    }
    case "skill-library":
      return tt("settings.slots.installSkills", "Install skills");
    case "team-detail":
      return slot.title ?? tt("settings.slots.packDetail", "Team details");
    case "shortcuts":
      return tt("settings.slots.shortcuts", "Shortcuts");
    case "logs":
      return tt("settings.slots.logs", "Logs");
    case "permission-rules": {
      switch (slot.field) {
        case "allowed-paths":
          return tt("settings.permissions.allowedPaths", "Allowed paths");
        case "allow-rules":
          return tt("settings.permissions.allowRules", "Allow rules");
        case "deny-rules":
          return tt("settings.permissions.denyRules", "Deny rules");
      }
    }
    default:
      return null;
  }
}
