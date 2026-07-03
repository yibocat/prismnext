/**
 * Custom bash tool (PTY mode) — polls results from the renderer-started PTY job.
 * Execution is started by main after the user approves shell permission.
 *
 * IMPORTANT: Self-contained — copied to OpenCode's tools directory (Bun runtime).
 * Keep polling helpers in sync with src/main/services/bash-bridge-poll.ts
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { terminalBridgeRoot } from "./bridge-paths";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BRIDGE_ROOT = terminalBridgeRoot();
const ACTIVE_TOOL_FILE = ".active-tool.json";

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

function readResult(
  sessionDir: string,
  toolCallId: string,
): { output: string; exit: number; cwd?: string } | undefined {
  const resPath = path.join(sessionDir, `${toolCallId}.result.json`);
  if (!fs.existsSync(resPath)) return undefined;
  try {
    const result = JSON.parse(fs.readFileSync(resPath, "utf-8"));
    return {
      output: result.output ?? "",
      exit: result.exitCode ?? result.exit ?? 1,
      cwd: result.cwd,
    };
  } catch {
    return undefined;
  }
}

export default tool({
  description:
    "Execute a shell command in the project workspace. Returns stdout/stderr and exit code.",

  args: {
    command: tool.schema.string().describe("Shell command to execute"),
    description: tool.schema.string().describe("Why this command is being run").optional(),
    workdir: tool.schema.string().describe("Working directory override").optional(),
  },

  async execute(args, context) {
    const cwd = args.workdir || context.directory || process.cwd();
    const sessionId = context.sessionID || "unknown";
    const sessionDir = path.join(BRIDGE_ROOT, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const deadline = Date.now() + 130_000;
    let toolCallId = resolveToolCallId(sessionDir, context as Record<string, unknown>);

    while (!toolCallId && !context.abort.aborted && Date.now() < deadline) {
      await delay(50);
      toolCallId = resolveToolCallId(sessionDir, context as Record<string, unknown>);
    }

    if (!toolCallId) {
      return {
        output: "Prism PTY: renderer did not register a toolCallId for this bash job.",
        exit: 1,
        cwd,
      };
    }

    // Custom bash may start before ACP permission — block until Prism writes decision.
    while (!context.abort.aborted && Date.now() < deadline) {
      const perm = readPermissionStatus(sessionDir, toolCallId);
      if (perm === "denied") {
        return { output: "Permission denied by user", exit: 1, cwd };
      }
      if (perm === "approved") break;
      await delay(50);
    }

    if (readPermissionStatus(sessionDir, toolCallId) !== "approved") {
      return { output: "Permission timed out waiting for user approval", exit: 1, cwd };
    }

    while (!context.abort.aborted && Date.now() < deadline) {
      const result = readResult(sessionDir, toolCallId);
      if (result) {
        return {
          output: result.output,
          exit: result.exit,
          cwd: result.cwd ?? cwd,
        };
      }
      await delay(50);
    }

    return {
      output: "Prism PTY bridge timed out waiting for command result.",
      exit: 1,
      cwd,
    };
  },
});
