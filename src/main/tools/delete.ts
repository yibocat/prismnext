/**
 * # prism-delete — Custom file deletion tool
 *
 * OpenCode has no built-in `delete` tool.  Without this, the model falls back
 * to `bash rm`, which routes through the PTY bridge and shows a generic
 * "Shell command" permission gate.  This tool gives delete a first-class
 * identity: the model sees a dedicated `delete` tool, and the permission gate
 * shows "Delete file · filename.tex".
 *
 * ## Permission flow
 *
 * Like custom `bash`, OpenCode may invoke `execute()` before ACP permission:
 *
 * 1. `execute()` polls `<bridge>/<session>/<toolCallId>.permission.json`
 * 2. Main process emits PermissionGatePanel via `syncCustomToolPermissionFromToolCall`
 * 3. User clicks Allow → main writes `{ status: "approved" }`
 * 4. `execute()` proceeds with `git rm` (tracked) or `fs.unlinkSync`
 *
 * IMPORTANT: Self-contained — copied to OpenCode's tools directory (Bun runtime).
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { terminalBridgeRoot } from "./bridge-paths";
import {
  PERMISSION_TIMEOUT_MS,
  pollUntilToolCallId,
  waitForPermission,
} from "./permission-bridge-poll";

const BRIDGE_ROOT = terminalBridgeRoot();

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

/** Delete from disk; for tracked files use `git rm` so branch switches don't silently restore. */
function deleteFileAtPath(filePath: string): void {
  const gitRoot = gitTopLevel(path.dirname(filePath));
  if (gitRoot) {
    const rel = path.relative(gitRoot, filePath);
    if (rel && !rel.startsWith("..") && isGitTracked(gitRoot, rel)) {
      execSync(`git rm -f -- ${shellQuote(rel)}`, {
        cwd: gitRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return;
    }
  }
  fs.unlinkSync(filePath);
}

export default tool({
  description:
    "Delete a single file from the project workspace. " +
    "REQUIRED when the user asks to delete, remove, or unlink a file — call this tool directly. " +
    "Do NOT read the file first and do NOT use bash rm for single-file deletion. " +
    "The user must approve before the file is deleted.",

  args: {
    file_path: tool.schema
      .string()
      .describe("Absolute or project-relative path of the file to delete"),
    description: tool.schema
      .string()
      .describe("Why this file is being deleted")
      .optional(),
  },

  async execute(args, context) {
    const cwd = context.directory || process.cwd();
    const sessionId = context.sessionID || "unknown";
    const sessionDir = path.join(BRIDGE_ROOT, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const toolCallId = await pollUntilToolCallId(
      sessionDir,
      context as Record<string, unknown>,
      context.abort,
      PERMISSION_TIMEOUT_MS,
    );

    if (!toolCallId) {
      return {
        output: "prismnext: could not resolve toolCallId for delete permission gate.",
        exit: 1,
      };
    }

    const perm = await waitForPermission(sessionDir, toolCallId, context.abort);
    if (perm === "denied") {
      return { output: "Permission denied by user", exit: 1 };
    }
    if (perm !== "approved") {
      return { output: "Permission timed out waiting for user approval", exit: 1 };
    }

    const filePath = path.isAbsolute(String(args.file_path))
      ? String(args.file_path)
      : path.resolve(cwd, String(args.file_path));

    if (!fs.existsSync(filePath)) {
      return { output: `File not found: ${args.file_path}`, exit: 1 };
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return {
        output: `Refusing to delete a directory: ${args.file_path}. Use bash rm -r for directories.`,
        exit: 1,
      };
    }

    try {
      deleteFileAtPath(filePath);
      return {
        output: `Deleted: ${args.file_path}`,
        exit: 0,
      };
    } catch (err: any) {
      return {
        output: `Failed to delete ${args.file_path}: ${err.message}`,
        exit: 1,
      };
    }
  },
});
