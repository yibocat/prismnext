/**
 * # prism-move — Custom file move/rename tool
 *
 * OpenCode has no built-in `move` tool.  Without this, the model falls back
 * to `bash mv`, which routes through the PTY bridge and shows a generic
 * "Shell command" permission gate.  This tool gives move/rename a first-class
 * identity: the model sees a dedicated `move` tool, and the permission gate
 * shows "Move file · a.tex → b.tex".
 *
 * ## Permission flow
 *
 * Same as `delete` — polls the file bridge until the user approves.
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
/** Keep in sync with `src/shared/permission-timeouts.ts` (tool file is copied standalone). */
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

/** Move on disk; for tracked files use `git mv` so git index stays consistent. */
function moveFileAtPath(src: string, dst: string): void {
  const dstDir = path.dirname(dst);
  if (!fs.existsSync(dstDir)) {
    fs.mkdirSync(dstDir, { recursive: true });
  }

  const gitRoot = gitTopLevel(path.dirname(src));
  if (gitRoot) {
    const relSrc = path.relative(gitRoot, src);
    const relDst = path.relative(gitRoot, dst);
    if (
      relSrc
      && relDst
      && !relSrc.startsWith("..")
      && !relDst.startsWith("..")
      && isGitTracked(gitRoot, relSrc)
    ) {
      execSync(`git mv -- ${shellQuote(relSrc)} ${shellQuote(relDst)}`, {
        cwd: gitRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return;
    }
  }

  fs.renameSync(src, dst);
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
    "Move or rename a single file within the project workspace. " +
    "REQUIRED when the user asks to move or rename a file — call this tool directly. " +
    "Do NOT use bash mv for single-file moves. " +
    "The user must approve before the file is moved.",

  args: {
    source_path: tool.schema
      .string()
      .describe("Absolute or project-relative path of the file to move"),
    destination_path: tool.schema
      .string()
      .describe("Absolute or project-relative destination path"),
    description: tool.schema
      .string()
      .describe("Why this file is being moved/renamed")
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
        output: "Prism: could not resolve toolCallId for move permission gate.",
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

    const src = path.isAbsolute(String(args.source_path))
      ? String(args.source_path)
      : path.resolve(cwd, String(args.source_path));
    const dst = path.isAbsolute(String(args.destination_path))
      ? String(args.destination_path)
      : path.resolve(cwd, String(args.destination_path));

    if (!fs.existsSync(src)) {
      return { output: `Source not found: ${args.source_path}`, exit: 1 };
    }

    const srcStat = fs.statSync(src);
    if (srcStat.isDirectory()) {
      return {
        output: `Refusing to move a directory: ${args.source_path}. Use bash mv for directories.`,
        exit: 1,
      };
    }

    if (fs.existsSync(dst)) {
      return {
        output: `Destination already exists: ${args.destination_path}`,
        exit: 1,
      };
    }

    try {
      moveFileAtPath(src, dst);
      return {
        output: `Moved: ${args.source_path} → ${args.destination_path}`,
        exit: 0,
      };
    } catch (err: any) {
      return {
        output: `Failed to move ${args.source_path} → ${args.destination_path}: ${err.message}`,
        exit: 1,
      };
    }
  },
});
