// prism-next/src/main/prompts/context.ts

import * as path from "node:path";
import * as fs from "node:fs";
import type { PromptContext } from "./types";
import type { WorkspaceFolder } from "../../renderer/types/workspace";
import { createLogger } from "../services/logger";

const log = createLogger("prompt-context", "agent");

/** Safely read workspace dirs, returning [] on any error. */
function readWorkspaceDirsSafe(prismDir: string): WorkspaceFolder[] {
  try {
    // Inline to avoid circular dependency — workspace-config.ts
    // may import from prompts in the future.
    const settingsPath = path.join(prismDir, "settings.json");
    if (!fs.existsSync(settingsPath)) return [];
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    if (Array.isArray(raw.workspaceDirs) && raw.workspaceDirs.length > 0) {
      return raw.workspaceDirs;
    }
    // Default for fresh projects
    return [
      { function: "manuscript", name: "manuscript", mainTex: "main.tex" },
    ] as WorkspaceFolder[];
  } catch {
    return [];
  }
}

/** Safely read a file, returning null on any error. */
function readFileIfExists(absPath: string): string | null {
  try {
    if (fs.existsSync(absPath)) {
      return fs.readFileSync(absPath, "utf-8");
    }
  } catch {}
  return null;
}

/**
 * Build the full PromptContext for a given project.
 * Called in the chat:send handler before composing the prompt.
 */
export async function buildPromptContext(
  projectRoot?: string,
): Promise<PromptContext> {
  const ctx: PromptContext = { projectRoot };

  if (projectRoot) {
    const prismDir = path.join(projectRoot, ".prismnext");

    // Workspace folder config
    ctx.workspaceDirs = readWorkspaceDirsSafe(prismDir);
    log.info(
      `Workspace dirs loaded: ${ctx.workspaceDirs.length} folder(s)`,
      { dirs: ctx.workspaceDirs.map((d) => `${d.name} (${d.function})`) },
    );

    // AGENTS.md — project-level instructions
    ctx.agentsMdContent =
      readFileIfExists(path.join(prismDir, "agent", "AGENTS.md")) ?? undefined;
  }

  // User custom prompt from app-level settings
  try {
    const { getSettings } = await import("../services/settings");
    const settings = getSettings() as Record<string, unknown>;
    const userPrompt = settings.agentSystemPrompt as string | undefined;
    ctx.userCustomPrompt = userPrompt || undefined;

    // Project custom rules from .prismnext/settings.json
    const allRules: Array<{ name: string; content: string }> = [];
    if (projectRoot) {
      const settingsPath = path.join(projectRoot, ".prismnext", "settings.json");
      try {
        if (fs.existsSync(settingsPath)) {
          const projectSettings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          const projectRules = projectSettings.customRules as Array<{ name: string; content: string; enabled?: boolean }> | undefined;
          if (Array.isArray(projectRules)) {
            for (const r of projectRules) {
              if (r.enabled !== false) {
                allRules.push({ name: r.name, content: r.content });
              }
            }
          }
        }
      } catch { /* best-effort */ }
    }

    if (allRules.length > 0) ctx.customRules = allRules;
  } catch {
    // settings may not be available during early startup
  }

  return ctx;
}
