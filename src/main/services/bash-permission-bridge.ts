import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTerminalBridgeRoot } from "./prism-bridge-paths";
import { registerBashJobIntent, runAiBashJob } from "./ai-bash-runner";

export type BashPermissionStatus = "approved" | "denied";

export function getBridgeRoot(): string {
  return getTerminalBridgeRoot();
}

export function bashPermissionPath(sessionId: string, toolCallId: string): string {
  return join(getBridgeRoot(), sessionId, `${toolCallId}.permission.json`);
}

export function readBashPermissionStatus(
  sessionId: string,
  toolCallId: string,
): BashPermissionStatus | undefined {
  const path = bashPermissionPath(sessionId, toolCallId);
  if (!existsSync(path)) return undefined;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as { status?: string };
    if (data.status === "approved" || data.status === "denied") return data.status;
    return undefined;
  } catch {
    return undefined;
  }
}

export function writeBashPermissionStatus(
  sessionId: string,
  toolCallId: string,
  status: BashPermissionStatus,
): void {
  const path = bashPermissionPath(sessionId, toolCallId);
  mkdirSync(join(getBridgeRoot(), sessionId), { recursive: true });
  writeFileSync(path, JSON.stringify({ status, at: Date.now() }), "utf-8");
}

export interface ApprovedBashJob {
  sessionId: string;
  chatTabId: string;
  toolCallId: string;
  command: string;
  cwd: string;
  projectRoot?: string;
}

/** After permission is granted — unblock custom bash.ts and run PTY. */
export function executeApprovedBashJob(job: ApprovedBashJob): void {
  writeBashPermissionStatus(job.sessionId, job.toolCallId, "approved");
  registerBashJobIntent({
    sessionId: job.sessionId,
    toolCallId: job.toolCallId,
    command: job.command,
  });
  void runAiBashJob({
    sessionId: job.sessionId,
    chatTabId: job.chatTabId,
    toolCallId: job.toolCallId,
    command: job.command,
    cwd: job.cwd,
    projectRoot: job.projectRoot,
  });
}

export function denyBashJob(sessionId: string, toolCallId: string): void {
  writeBashPermissionStatus(sessionId, toolCallId, "denied");
}

/** Custom OpenCode tools (delete, move) share the same permission bridge as bash. */
export function registerCustomToolJobIntent(args: {
  sessionId: string;
  toolCallId: string;
  toolName: string;
}): void {
  const sessionDir = join(getBridgeRoot(), args.sessionId);
  mkdirSync(sessionDir, { recursive: true });
  try {
    writeFileSync(
      join(sessionDir, ".active-tool.json"),
      JSON.stringify({
        toolCallId: args.toolCallId,
        toolName: args.toolName,
        startedAt: Date.now(),
        phase: "awaiting_approval",
      }),
      "utf-8",
    );
  } catch {
    // ignore
  }
}

/** Unblock custom tool execute() after the user approves in PermissionGatePanel. */
export function approveCustomToolJob(sessionId: string, toolCallId: string): void {
  writeBashPermissionStatus(sessionId, toolCallId, "approved");
}

export function extractBashCommandFromInput(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  const cmd = input.command ?? input.cmd;
  if (typeof cmd === "string" && cmd.trim()) return cmd.trim();
  const title = input._title ?? input.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return "";
}

/** OpenCode may first emit only a generic title before rawInput.command arrives. */
export function isRunnableBashCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  if (!normalized) return false;
  return !["bash", "shell", "terminal", "execute"].includes(normalized);
}
