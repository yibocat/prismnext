// prism-next/src/main/prompts/context.ts

import * as path from "node:path";
import * as fs from "node:fs";
import type { PromptContext } from "./types";
import type { WorkspaceFolder } from "../../shared/workbench/workspace-folder";
import { createLogger } from "../app/logger";
import { readWorkbenchJson } from "../workbench/identity";
import { projectAgentsMdRel } from "../../shared/workbench/paths";

const log = createLogger("prompt-context", "agent");

/** Safely read workspace dirs, returning [] on any error. */
function readWorkspaceDirsSafe(projectRoot: string): WorkspaceFolder[] {
  try {
    const folders = readWorkbenchJson(projectRoot)?.workspace?.folders;
    if (Array.isArray(folders) && folders.length > 0) {
      return folders as WorkspaceFolder[];
    }
    // No configured folders → []. Never invent a manuscript/main.tex here:
    // the workspace-folders and latex-workspace modules would otherwise assert
    // paths that do not exist on disk.
    return [];
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

/** Options for per-turn prompt assembly. */
export interface BuildPromptContextOptions {
  // Reserved for future per-turn scoping; project rules are always global.
}

/**
 * Build the full PromptContext for a given project.
 * Called in the chat:send handler before composing the prompt.
 */
export async function buildPromptContext(
  projectRoot?: string,
  _options?: BuildPromptContextOptions,
): Promise<PromptContext> {
  const ctx: PromptContext = { projectRoot };

  if (projectRoot) {
    ctx.workspaceDirs = readWorkspaceDirsSafe(projectRoot);
    log.info(
      `Workspace dirs loaded: ${ctx.workspaceDirs.length} folder(s)`,
      { dirs: ctx.workspaceDirs.map((d) => `${d.name} (${d.function})`) },
    );

    ctx.agentsMdContent =
      readFileIfExists(path.join(projectRoot, projectAgentsMdRel())) ?? undefined;
  }

  try {
    const { getSettings } = await import("../services/settings");
    const settings = getSettings() as Record<string, unknown>;
    const userPrompt = settings.agentSystemPrompt as string | undefined;
    ctx.userCustomPrompt = userPrompt || undefined;

    if (projectRoot) {
      const { getPromptProjectRules } = await import("../services/rules-sync");
      const allRules = getPromptProjectRules(projectRoot);
      if (allRules.length > 0) {
        ctx.customRules = allRules;
      }
    }
  } catch {
    // settings may not be available during early startup
  }

  return ctx;
}
