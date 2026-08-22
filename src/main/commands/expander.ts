// prism-next/src/main/commands/expander.ts
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import type { ParsedCommand } from "./types";
import { getSettings } from "../app/settings";
import {
  buildPermissionRulesFromSettings,
  resolvePermissionAction,
  resolvePermissionMode,
} from "../../shared/permissions/modes";

const MAX_SHELL_OUTPUT = 10_240; // 10KB
const SHELL_TIMEOUT_MS = 5_000;

/**
 * Expand a command template by substituting placeholders.
 *
 * Supported placeholders:
 *   $ARGUMENTS  → all text after command name
 *   $1..$9      → positional args
 *   @path/file  → file content (relative to projectRoot, code-fenced)
 *   !`cmd`      → shell command stdout
 */
export function expandTemplate(
  template: string,
  parsed: ParsedCommand,
  projectRoot: string,
): string {
  let result = template;

  // $ARGUMENTS
  result = result.replace(/\$ARGUMENTS/g, parsed.args.ARGUMENTS);

  // $1..$9
  for (let i = 1; i <= 9; i++) {
    const val = parsed.args[`$${i}` as `$${number}`] || "";
    result = result.replace(new RegExp(`\\$${i}\\b`, "g"), val);
  }

  // @path references — read file content, wrap in code fence
  result = result.replace(/@(\S+)/g, (_match: string, filePath: string) => {
    return resolveFileRef(filePath, projectRoot);
  });

  // !`cmd` shell expansion — execute and replace with stdout
  result = result.replace(/!`([^`]+)`/g, (_match: string, cmd: string) => {
    return execShellCommand(cmd.trim(), projectRoot);
  });

  return result;
}

/** Whether a slash-command shell snippet may run during template expand. */
export function resolveCommandShellExpansionAction(
  command: string,
  projectRoot: string,
): "allow" | "deny" {
  const settings = getSettings() as Record<string, unknown>;
  const mode = resolvePermissionMode(settings.permissionMode as string | undefined);
  const rules = buildPermissionRulesFromSettings(settings);
  const action = resolvePermissionAction(
    mode,
    "bash",
    "build",
    {
      projectRoot,
      bashCommand: command,
      bashCwd: projectRoot,
    },
    rules,
  );
  return action === "allow" ? "allow" : "deny";
}

function resolveFileRef(filePath: string, projectRoot: string): string {
  const abs = resolve(projectRoot, filePath);

  // Security: restrict to project root
  if (!abs.startsWith(resolve(projectRoot))) {
    return `[Error: file path escapes project root: ${filePath}]`;
  }

  if (!existsSync(abs)) {
    return `[Error: file not found: ${filePath}]`;
  }

  try {
    const content = readFileSync(abs, "utf-8");
    const ext = filePath.split(".").pop() || "";
    return `\`\`\`${ext}\n${content}\n\`\`\``;
  } catch (err: any) {
    return `[Error: could not read ${filePath}: ${err.message}]`;
  }
}

function execShellCommand(cmd: string, projectRoot: string): string {
  if (resolveCommandShellExpansionAction(cmd, projectRoot) !== "allow") {
    return "[Error: permission denied for shell expansion in slash command]";
  }
  try {
    const stdout = execSync(cmd, {
      timeout: SHELL_TIMEOUT_MS,
      maxBuffer: MAX_SHELL_OUTPUT,
      encoding: "utf-8",
      cwd: projectRoot,
    });
    return stdout.slice(0, MAX_SHELL_OUTPUT);
  } catch (err: any) {
    const msg = err.stderr || err.message || String(err);
    return `[Error: ${msg.trim().slice(0, 500)}]`;
  }
}
