import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commandRegistry } from "../commands/registry";
import { ALL_MODULES } from "../prompts/modules";
import { listProjectRules } from "./rules-sync";
import { listProjectSkills } from "./skills-sync";
/** Shared editor picklists for Expert / Orchestrator settings forms. */
export interface AgentEditorOptions {
  skills: Array<{ id: string; name: string; description: string; enabled: boolean }>;
  mcpServers: Array<{ name: string }>;
  modules: Array<{
    key: string;
    label: string;
    description: string;
    selectableInProfile: boolean;
  }>;
  commands: Array<{ name: string; description: string; enabled: boolean }>;
  rules: Array<{ name: string }>;
}

export function getAgentEditorOptions(projectRoot: string): AgentEditorOptions {
  commandRegistry.setProjectRoot(projectRoot);
  commandRegistry.reload();

  const skills = listProjectSkills(projectRoot).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    enabled: s.enabled,
  }));

  const mcpServers: Array<{ name: string }> = [];
  const mcpPath = join(projectRoot, ".prismnext", "agent", "mcp.json");
  if (existsSync(mcpPath)) {
    try {
      const raw = JSON.parse(readFileSync(mcpPath, "utf-8")) as {
        mcpServers?: Record<string, unknown>;
      };
      if (raw.mcpServers && typeof raw.mcpServers === "object") {
        for (const name of Object.keys(raw.mcpServers)) {
          mcpServers.push({ name });
        }
      }
    } catch {
      // ignore
    }
  }

  const modules = ALL_MODULES.filter((m) => m.profileOnly).map((m) => ({
    key: m.key,
    label: m.label,
    description: m.description,
    selectableInProfile: true,
  }));

  const commands = commandRegistry.list().map((c) => ({
    name: c.name,
    description: c.description,
    enabled: c.enabled,
  }));

  const rules: Array<{ name: string }> = [];
  for (const rule of listProjectRules(projectRoot)) {
    if (rule.enabled && rule.name.trim()) {
      rules.push({ name: rule.name.trim() });
    }
  }

  return { skills, mcpServers, modules, commands, rules };
}
