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
import type { WorkspaceFolderScope } from "@/lib/settings/workspace-template";

export type SettingsPanelSlot =
  | { kind: "placeholder"; title: string; description?: string }
  | { kind: "workspace-folder"; scope: WorkspaceFolderScope; mode: "edit"; index: number }
  | { kind: "workspace-folder"; scope: WorkspaceFolderScope; mode: "new" }
  | { kind: "ai-provider"; mode: "new" }
  | { kind: "ai-provider"; mode: "edit"; providerId: string }
  | { kind: "ai-provider"; mode: "builtin-key"; providerId: string }
  | { kind: "agent-profile"; mode: "new" }
  | { kind: "agent-profile"; mode: "edit"; profileId: string; title?: string }
  | { kind: "agent-profile"; mode: "customize-builtin"; profileId: string; title?: string }
  | { kind: "prompt-markdown"; doc: "system-prompt" | "agents-md" | "assembled" }
  | { kind: "agent-tools" }
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
  | { kind: "skill-library" }
  | { kind: "shortcuts" }
  | { kind: "logs" };

export function settingsPanelSlotTitle(slot: SettingsPanelSlot | null): string | null {
  if (!slot) return null;
  switch (slot.kind) {
    case "placeholder":
      return slot.title;
    case "workspace-folder": {
      if (slot.mode === "new") {
        return slot.scope === "project" ? "Add folder" : "Add template folder";
      }
      const dirs =
        slot.scope === "project"
          ? useWorkspaceConfigStore.getState().workspaceDirs
          : useSettingsStore.getState().settings.defaultWorkspaceDirs ?? [];
      return dirs[slot.index]?.name ?? "Folder";
    }
    case "ai-provider": {
      if (slot.mode === "new") return "Add provider";
      if (slot.mode === "builtin-key") {
        return getProvider(slot.providerId)?.name ?? "API key";
      }
      const custom = useSettingsStore
        .getState()
        .settings.aiCustomProviders?.find((cp) => cp.id === slot.providerId);
      return custom?.name ?? "Provider";
    }
    case "agent-profile": {
      if (slot.mode === "new") return "New profile";
      return slot.title ?? "Profile";
    }
    case "prompt-markdown": {
      if (slot.doc === "system-prompt") return "System prompt";
      if (slot.doc === "agents-md") return "AGENTS.md";
      return "Prompt preview";
    }
    case "agent-tools":
      return "Agent tools";
    case "rule-markdown": {
      if (slot.mode === "new") return "New rule";
      return slot.title ?? slot.ruleId;
    }
    case "custom-command": {
      if (slot.mode === "new") return "New command";
      return slot.title ? `/${slot.title}` : "Command";
    }
    case "mcp-json":
      return "mcp.json";
    case "mcp-catalog":
      return "MCP catalog";
    case "mcp-paste-json":
      return "Add from JSON";
    case "mcp-server":
      return slot.title ?? slot.serverName;
    case "skill-markdown": {
      if (slot.mode === "new") return "Create skill";
      return slot.title ?? slot.skillId;
    }
    case "skill-library":
      return "Skill library";
    case "shortcuts":
      return "Shortcuts";
    case "logs":
      return "Logs";
    default:
      return null;
  }
}
