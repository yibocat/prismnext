// src/main/cli/context-resolver.ts
// Resolves project-level context components from the filesystem.
// Called by CliManager.ensureProcess() before spawning an agent process.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContextComponent, ResolvedContext } from "../agents/types";
import { APP_SYSTEM_PROMPT, buildAugmentedPath } from "./app-shell";

/**
 * Resolve the requested context components from the project directory.
 * Only components listed in `components` are populated; others are left
 * undefined to avoid unnecessary filesystem access.
 */
export function resolveContext(
  cwd: string,
  components: ContextComponent[],
): ResolvedContext {
  const ctx: ResolvedContext = { appSystemPrompt: getAppSystemPrompt() };

  // Read project-level toggle config — disabled components are skipped
  const toggles = readProjectToggles(cwd);

  for (const comp of components) {
    // Skip if explicitly disabled in project settings
    if (toggles[comp] === false) continue;

    switch (comp) {
      case "rules": {
        const claudeMd = findUpClaudeMd(cwd);
        if (claudeMd) {
          try {
            ctx.rules = readFileSync(claudeMd, "utf-8");
          } catch {}
        }
        break;
      }
      case "skills": {
        const skillsDir = join(cwd, ".prismnext", "agent-config", "claude", "skills");
        if (existsSync(skillsDir)) ctx.skillsDir = skillsDir;
        break;
      }
      case "mcp": {
        const mcpPath = join(cwd, ".prismnext", "agent-config", "claude", "mcp.json");
        if (existsSync(mcpPath)) ctx.mcpConfig = mcpPath;
        break;
      }
      case "plugins": {
        const pluginsDir = join(cwd, ".prismnext", "agent-config", "claude", "plugins");
        if (existsSync(pluginsDir)) ctx.pluginsDir = pluginsDir;
        break;
      }
      case "venv": {
        const venvPath = join(cwd, ".venv");
        if (existsSync(venvPath)) ctx.venvPath = venvPath;
        break;
      }
      case "path": {
        ctx.augmentedPath = buildAugmentedPath(cwd);
        break;
      }
    }
  }

  return ctx;
}

/** Walk up from `cwd` to find the nearest CLAUDE.md file. */
function findUpClaudeMd(cwd: string): string | null {
  let dir = cwd;
  while (true) {
    const candidate = join(dir, "CLAUDE.md");
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, "..");
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

/** Read project-level context component toggles from .prismnext/settings.json.
 *  Returns an empty object (all enabled) if the file or agent config is absent. */
function readProjectToggles(cwd: string): Record<string, boolean> {
  try {
    const settingsPath = join(cwd, ".prismnext", "settings.json");
    if (existsSync(settingsPath)) {
      const raw = readFileSync(settingsPath, "utf-8");
      const data = JSON.parse(raw);
      return data?.agent?.contextComponents || {};
    }
  } catch {}
  return {}; // absent = all enabled
}

/** Read the custom system prompt from electron-store (App settings).
 *  Falls back to the built-in APP_SYSTEM_PROMPT from app-shell.ts. */
function getAppSystemPrompt(): string {
  try {
    // Dynamic require avoids circular dependency (settings.ts imports nothing from cli/)
    const { getSettings } = require("../services/settings");
    const custom = (getSettings() as any).agentSystemPrompt;
    if (custom && typeof custom === "string" && custom.trim()) {
      return custom;
    }
  } catch {}
  return APP_SYSTEM_PROMPT;
}
