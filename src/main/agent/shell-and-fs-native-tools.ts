/**
 * ToolHost wrappers for shell and filesystem mutation tools:
 * - bash
 * - delete
 * - move
 * - project-rule-write
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { execSync } from "node:child_process";
import { TOOL_NAMES } from "../../shared/tool-names";
import { BUILTIN_TOOLS } from "../tools/index";
import { buildOpencodeToolDescription } from "../tools/tool-description";
import {
  resolveProjectRuleWrite,
  type ProjectRuleWriteMode,
} from "../../shared/project-rule-md";
import type { NativeToolDefinition, ToolExecuteContext } from "./tool-host";

export type RunBashFn = (args: {
  sessionId: string;
  chatTabId?: string;
  toolCallId: string;
  command: string;
  cwd: string;
  projectRoot?: string;
}) => Promise<{ output: string; exitCode: number; cwd: string; executionId: string }>;

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v.trim() : "";
}

function descriptionFor(name: string): string {
  const meta = BUILTIN_TOOLS.find((tool) => tool.name === name);
  return meta ? buildOpencodeToolDescription(meta) : name;
}

function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function gitTopLevel(startDir: string): string | undefined {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: startDir,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function isGitTracked(gitRoot: string, relPath: string): boolean {
  try {
    execSync(`git ls-files --error-unmatch -- ${shellQuote(relPath)}`, {
      cwd: gitRoot,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function resolvePathInProject(raw: string, projectRoot: string): string {
  return isAbsolute(raw) ? raw : join(projectRoot, raw);
}

function deleteFile(filePath: string): void {
  const gitRoot = gitTopLevel(dirname(filePath));
  if (gitRoot) {
    const rel = relative(gitRoot, filePath);
    if (rel && !rel.startsWith("..") && isGitTracked(gitRoot, rel)) {
      execSync(`git rm -f -- ${shellQuote(rel)}`, {
        cwd: gitRoot,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return;
    }
  }
  unlinkSync(filePath);
}

function moveFile(src: string, dst: string): void {
  const dstDir = dirname(dst);
  if (!existsSync(dstDir)) {
    mkdirSync(dstDir, { recursive: true });
  }

  const gitRoot = gitTopLevel(dirname(src));
  if (gitRoot) {
    const relSrc = relative(gitRoot, src);
    const relDst = relative(gitRoot, dst);
    if (
      relSrc
      && !relSrc.startsWith("..")
      && relDst
      && !relDst.startsWith("..")
      && isGitTracked(gitRoot, relSrc)
    ) {
      execSync(`git mv -f -- ${shellQuote(relSrc)} ${shellQuote(relDst)}`, {
        cwd: gitRoot,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return;
    }
  }
  renameSync(src, dst);
}

export function createShellAndFsNativeTools(deps?: {
  runBash?: RunBashFn;
}): NativeToolDefinition[] {
  const runBash = deps?.runBash ?? (async (args) => {
    const { runAiBashJob } = await import("../services/ai-bash-runner");
    return runAiBashJob(args);
  });

  return [
    {
      name: TOOL_NAMES.bash,
      description: descriptionFor(TOOL_NAMES.bash),
      async execute(args, ctx: ToolExecuteContext) {
        const command = str(args, "command");
        if (!command) return { ok: false, error: "missing_command" };

        const cwd = str(args, "cwd") || ctx.projectRoot;
        const result = await runBash({
          sessionId: ctx.runtimeSessionId,
          chatTabId: ctx.tabId,
          toolCallId: ctx.toolCallId,
          command,
          cwd,
          projectRoot: ctx.projectRoot,
        });
        return result;
      },
    },
    {
      name: TOOL_NAMES.delete,
      description: descriptionFor(TOOL_NAMES.delete),
      async execute(args, ctx: ToolExecuteContext) {
        const raw = str(args, "path") || str(args, "filePath") || str(args, "file");
        if (!raw) return { ok: false, error: "missing_path" };

        const absPath = resolvePathInProject(raw, ctx.projectRoot);
        if (!existsSync(absPath)) {
          return { ok: false, error: "file_not_found", path: raw };
        }

        try {
          deleteFile(absPath);
          return { success: true, path: raw };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, error: message };
        }
      },
    },
    {
      name: TOOL_NAMES.move,
      description: descriptionFor(TOOL_NAMES.move),
      async execute(args, ctx: ToolExecuteContext) {
        const rawSrc = str(args, "source") || str(args, "from") || str(args, "sourcePath");
        const rawDst = str(args, "destination") || str(args, "to") || str(args, "destinationPath");
        if (!rawSrc || !rawDst) {
          return { ok: false, error: "missing_source_or_destination" };
        }

        const absSrc = resolvePathInProject(rawSrc, ctx.projectRoot);
        const absDst = resolvePathInProject(rawDst, ctx.projectRoot);
        if (!existsSync(absSrc)) {
          return { ok: false, error: "source_not_found", source: rawSrc };
        }

        try {
          moveFile(absSrc, absDst);
          return { success: true, source: rawSrc, destination: rawDst };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, error: message };
        }
      },
    },
    {
      name: TOOL_NAMES.projectRuleWrite,
      description: descriptionFor(TOOL_NAMES.projectRuleWrite),
      async execute(args, ctx: ToolExecuteContext) {
        const name = str(args, "name");
        const description = str(args, "description");
        const body = str(args, "body");
        const modeRaw = str(args, "mode").toLowerCase() || "create";
        const mode = (modeRaw === "replace" || modeRaw === "append" ? modeRaw : "create") as ProjectRuleWriteMode;
        const apply = str(args, "apply") || "always";

        const ruleDir = join(ctx.projectRoot, ".prismnext", "agent", "rules", name);
        const ruleFile = join(ruleDir, "RULE.md");

        let existingContent: string | null = null;
        if (existsSync(ruleFile)) {
          try {
            existingContent = readFileSync(ruleFile, "utf-8");
          } catch {
            existingContent = null;
          }
        }

        const resolved = resolveProjectRuleWrite({
          existingContent,
          name,
          description,
          body,
          mode,
          apply,
        });

        if (!resolved.ok) {
          return { ok: false, error: resolved.error };
        }

        try {
          mkdirSync(ruleDir, { recursive: true });
          writeFileSync(ruleFile, resolved.content, "utf-8");
          return {
            success: true,
            name,
            mode: resolved.mode,
            path: `.prismnext/agent/rules/${name}/RULE.md`,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, error: message };
        }
      },
    },
  ];
}
