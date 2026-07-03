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
    const settingsPath = path.join(prismDir, "settings.json");
    if (!fs.existsSync(settingsPath)) return [];
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    if (Array.isArray(raw.workspaceDirs) && raw.workspaceDirs.length > 0) {
      return raw.workspaceDirs;
    }
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

/** Options for per-turn prompt assembly (orchestrator-scoped rules, etc.). */
export interface BuildPromptContextOptions {
  /** Orchestrator/expert profile rule names. Empty/undefined = all enabled always rules. */
  ruleAllowlist?: string[];
}

/**
 * Build the full PromptContext for a given project.
 * Called in the chat:send handler before composing the prompt.
 */
export async function buildPromptContext(
  projectRoot?: string,
  options?: BuildPromptContextOptions,
): Promise<PromptContext> {
  const ctx: PromptContext = { projectRoot };

  if (projectRoot) {
    const prismDir = path.join(projectRoot, ".prismnext");

    ctx.workspaceDirs = readWorkspaceDirsSafe(prismDir);
    log.info(
      `Workspace dirs loaded: ${ctx.workspaceDirs.length} folder(s)`,
      { dirs: ctx.workspaceDirs.map((d) => `${d.name} (${d.function})`) },
    );

    ctx.agentsMdContent =
      readFileIfExists(path.join(prismDir, "agent", "AGENTS.md")) ?? undefined;
  }

  try {
    const { getSettings } = await import("../services/settings");
    const settings = getSettings() as Record<string, unknown>;
    const userPrompt = settings.agentSystemPrompt as string | undefined;
    ctx.userCustomPrompt = userPrompt || undefined;

    if (projectRoot) {
      const { getPromptProjectRules } = await import("../services/rules-sync");
      const allRules = getPromptProjectRules(projectRoot, {
        allowlist: options?.ruleAllowlist,
      });
      if (allRules.length > 0) {
        ctx.customRules = allRules;
        if (options?.ruleAllowlist?.length) {
          log.info(
            `Project rules scoped to agent profile: ${allRules.length}/${options.ruleAllowlist.length} matched`,
            { names: allRules.map((r) => r.name) },
          );
        }
      }
    }
  } catch {
    // settings may not be available during early startup
  }

  return ctx;
}
