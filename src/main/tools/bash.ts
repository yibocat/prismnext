/**
 * Custom bash tool (PTY mode) — polls results from the renderer-started PTY job.
 * Execution is started by main after the user approves shell permission.
 *
 * IMPORTANT: Self-contained — copied to OpenCode's tools directory (Bun runtime).
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { terminalBridgeRoot } from "./bridge-paths";
import {
  bridgeDelay,
  pollUntilToolCallId,
  readBashJobResult,
  readPermissionDecision,
  waitForPermission,
} from "./permission-bridge-poll";

const BRIDGE_ROOT = terminalBridgeRoot();
const BASH_JOB_TIMEOUT_MS = 130_000;

export default tool({
  description:
    "Execute a shell command in the project workspace. Returns stdout/stderr and exit code.",

  args: {
    command: tool.schema.string().describe("Shell command to execute"),
    description: tool.schema
      .string()
      .describe("Short phrase of what this command does, shown in the chat UI instead of the raw command")
      .optional(),
    workdir: tool.schema.string().describe("Working directory override").optional(),
  },

  async execute(args, context) {
    const cwd = args.workdir || context.directory || process.cwd();
    const sessionId = context.sessionID || "unknown";
    const sessionDir = path.join(BRIDGE_ROOT, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const ctx = context as Record<string, unknown>;
    const toolCallId = await pollUntilToolCallId(
      sessionDir,
      ctx,
      context.abort,
      BASH_JOB_TIMEOUT_MS,
    );

    if (!toolCallId) {
      return {
        output: "prismnext PTY: renderer did not register a toolCallId for this bash job.",
        exit: 1,
        cwd,
      };
    }

    // Custom bash may start before ACP permission — block until prismnext writes decision.
    const perm = await waitForPermission(
      sessionDir,
      toolCallId,
      context.abort,
      BASH_JOB_TIMEOUT_MS,
    );
    if (perm === "denied") {
      const reason = readPermissionDecision(sessionDir, toolCallId)?.reason;
      return {
        output: reason || "Permission denied by user",
        exit: 1,
        cwd,
      };
    }
    if (perm !== "approved") {
      return { output: "Permission timed out waiting for user approval", exit: 1, cwd };
    }

    const deadline = Date.now() + BASH_JOB_TIMEOUT_MS;
    while (!context.abort.aborted && Date.now() < deadline) {
      const result = readBashJobResult(sessionDir, toolCallId);
      if (result) {
        return {
          output: result.output,
          exit: result.exitCode,
          cwd: result.cwd ?? cwd,
        };
      }
      await bridgeDelay(50);
    }

    return {
      output: "prismnext PTY bridge timed out waiting for command result.",
      exit: 1,
      cwd,
    };
  },
});
