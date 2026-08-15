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
import { MY_CONTENT_TEAM_ID, PROJECT_DEFAULT_TEAM_ID } from "@shared/teams/types";

export type SettingsPanelSlot =
  | { kind: "placeholder"; title: string; description?: string }
  | { kind: "workspace-folder"; scope: WorkspaceFolderScope; mode: "edit"; index: number }
  | { kind: "workspace-folder"; scope: WorkspaceFolderScope; mode: "new" }
  | { kind: "ai-provider"; mode: "new" }
  | { kind: "ai-provider"; mode: "edit"; providerId: string }
  | { kind: "ai-provider"; mode: "builtin-key"; providerId: string }
  | { kind: "agent-expert"; mode: "new" }
  | { kind: "agent-expert"; mode: "edit"; expertId: string; title?: string }
  /** Pack-provided (bundled / store / Pro) — identity read-only; overrides only. */
  | { kind: "agent-expert"; mode: "installed"; expertId: string; title?: string }
  | { kind: "agent-orchestrator"; mode: "new" }
  | { kind: "agent-orchestrator"; mode: "edit"; orchestratorId: string; title?: string }
  /** Pack-provided (bundled / store / Pro) — identity read-only. */
  | { kind: "agent-orchestrator"; mode: "installed"; orchestratorId: string; title?: string }
  | { kind: "prompt-markdown"; doc: "system-prompt" | "agents-md" }
  | { kind: "prompt-stack-preview" }
  | { kind: "research-brief"; focusSection?: string }
  | { kind: "agent-tools" }
  | { kind: "knowledge-modules" }
  | { kind: "builtin-commands" }
  | { kind: "rule-markdown"; mode: "new" }
  | { kind: "rule-markdown"; mode: "edit"; ruleId: string; title?: string }
  | { kind: "custom-command"; mode: "new"; targetTeamId?: string }
  | {
      kind: "custom-command";
      mode: "edit";
      commandId: string;
      title?: string;
      teamId?: string;
    }
  /**
   * Edit one writable team's mcp.json.
   * - Settings → MCP: omit targetTeamId so TeamPicker can switch teams.
   * - Team detail: pass targetTeamId (+ lockTarget) to edit that team only.
   */
  | { kind: "mcp-json"; targetTeamId?: string; lockTarget?: boolean }
  | { kind: "mcp-catalog"; targetTeamId?: string }
  | { kind: "mcp-paste-json"; targetTeamId?: string }
  | {
      kind: "mcp-server";
      serverName: string;
      title?: string;
      /** Owning team (writable → edit; pack → read-only preview). */
      teamId?: string;
      readOnly?: boolean;
    }
  | { kind: "skill-markdown"; mode: "new"; targetTeamId?: string }
  | {
      kind: "skill-markdown";
      mode: "edit";
      skillId: string;
      title?: string;
      /** Owning team for save target (defaults to project.local). */
      teamId?: string;
      absPath?: string;
    }
  | { kind: "skill-markdown"; mode: "preview-bundled"; skillId: string; title?: string; absPath?: string }
  | { kind: "skill-library" }
  | { kind: "team-detail"; teamId: string; title?: string }
  /** Create a custom (non-store) team — app or project scope. */
  | { kind: "team-create"; scope?: "app" | "project" }
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
      if (!slot.title) return tt("settings.slots.command", "Command");
      return slot.title.startsWith("/") ? slot.title : `/${slot.title}`;
    }
    case "mcp-json":
      return tt("settings.slots.mcpJson", "mcp.json");
    case "mcp-catalog":
      return tt("settings.slots.installMcp", "Install MCP");
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
      if (slot.teamId === MY_CONTENT_TEAM_ID) {
        return slot.title ?? tt("settings.teams.myContentTeam", "Common Team");
      }
      if (slot.teamId === PROJECT_DEFAULT_TEAM_ID) {
        return slot.title ?? tt("settings.teams.projectLocalTeam", "Project Team");
      }
      return slot.title ?? tt("settings.slots.packDetail", "Team details");
    case "team-create":
      return tt("settings.slots.newTeam", "New team");
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
