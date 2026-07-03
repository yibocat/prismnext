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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BRIDGE_ROOT = terminalBridgeRoot();
const ACTIVE_TOOL_FILE = ".active-tool.json";
const PERMISSION_TIMEOUT_MS = 120_000;

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

function extractToolCallId(context: Record<string, unknown>): string | undefined {
  const c = context as {
    toolCallId?: string;
    tool_call_id?: string;
    callID?: string;
    messageID?: string;
  };
  for (const v of [c.toolCallId, c.tool_call_id, c.callID, c.messageID]) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function readActiveToolCallId(sessionDir: string): string | undefined {
  const filePath = path.join(sessionDir, ACTIVE_TOOL_FILE);
  if (!fs.existsSync(filePath)) return undefined;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { toolCallId?: string };
    return typeof data.toolCallId === "string" && data.toolCallId.trim()
      ? data.toolCallId.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

function resolveToolCallId(sessionDir: string, context: Record<string, unknown>): string | undefined {
  return extractToolCallId(context) ?? readActiveToolCallId(sessionDir);
}

function readPermissionStatus(
  sessionDir: string,
  toolCallId: string,
): "approved" | "denied" | undefined {
  const resPath = path.join(sessionDir, `${toolCallId}.permission.json`);
  if (!fs.existsSync(resPath)) return undefined;
  try {
    const data = JSON.parse(fs.readFileSync(resPath, "utf-8")) as { status?: string };
    if (data.status === "approved" || data.status === "denied") return data.status;
    return undefined;
  } catch {
    return undefined;
  }
}

async function waitForPermission(
  sessionDir: string,
  toolCallId: string,
  abort: AbortSignal,
): Promise<"approved" | "denied" | "timeout"> {
  const deadline = Date.now() + PERMISSION_TIMEOUT_MS;
  while (!abort.aborted && Date.now() < deadline) {
    const perm = readPermissionStatus(sessionDir, toolCallId);
    if (perm === "denied") return "denied";
    if (perm === "approved") return "approved";
    await delay(50);
  }
  return readPermissionStatus(sessionDir, toolCallId) === "approved" ? "approved" : "timeout";
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

    let toolCallId = resolveToolCallId(sessionDir, context as Record<string, unknown>);
    const deadline = Date.now() + PERMISSION_TIMEOUT_MS;
    while (!toolCallId && !context.abort.aborted && Date.now() < deadline) {
      await delay(50);
      toolCallId = resolveToolCallId(sessionDir, context as Record<string, unknown>);
    }

    if (!toolCallId) {
      return {
        output: "Prism: could not resolve toolCallId for delete permission gate.",
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

    const filePath = path.isAbsolute(args.file_path)
      ? args.file_path
      : path.resolve(cwd, args.file_path);

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
