/**
 * Shared bridge polling for gated OpenCode tools (bash PTY, delete, move).
 * Copied alongside tool files into OpenCode's tools directory — not a tool itself.
 */
import * as fs from "fs";
import * as path from "path";

/** Written by renderer IPC when a PTY job starts — bash polls by toolCallId. */
export const ACTIVE_TOOL_FILE = ".active-tool.json";

/** Keep in sync with `src/shared/permission-timeouts.ts`. */
export const PERMISSION_TIMEOUT_MS = 120_000;

export interface ActiveToolRecord {
  toolCallId: string;
  command: string;
  startedAt: number;
}

export interface PermissionDecision {
  status: "approved" | "denied";
  reason?: string;
}

export interface BashJobResult {
  output: string;
  exitCode: number;
  cwd?: string;
}

export const bridgeDelay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function extractToolCallId(context: Record<string, unknown>): string | undefined {
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

export function readActiveToolRecord(sessionDir: string): ActiveToolRecord | undefined {
  const filePath = path.join(sessionDir, ACTIVE_TOOL_FILE);
  if (!fs.existsSync(filePath)) return undefined;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<ActiveToolRecord>;
    if (typeof data.toolCallId !== "string" || !data.toolCallId.trim()) return undefined;
    return {
      toolCallId: data.toolCallId,
      command: typeof data.command === "string" ? data.command : "",
      startedAt: typeof data.startedAt === "number" ? data.startedAt : 0,
    };
  } catch {
    return undefined;
  }
}

export function readActiveToolCallId(sessionDir: string): string | undefined {
  return readActiveToolRecord(sessionDir)?.toolCallId;
}

export function resolveToolCallId(
  sessionDir: string,
  context: Record<string, unknown>,
): string | undefined {
  return extractToolCallId(context) ?? readActiveToolCallId(sessionDir);
}

/** Prefer explicit toolCallId from OpenCode context; else renderer `.active-tool.json`. */
export function resolveBashJobToolCallId(
  sessionDir: string,
  explicitToolCallId: string | undefined,
): string | undefined {
  if (explicitToolCallId?.trim()) return explicitToolCallId.trim();
  return readActiveToolCallId(sessionDir);
}

export function readPermissionDecision(
  sessionDir: string,
  toolCallId: string,
): PermissionDecision | undefined {
  const resPath = path.join(sessionDir, `${toolCallId}.permission.json`);
  if (!fs.existsSync(resPath)) return undefined;
  try {
    const data = JSON.parse(fs.readFileSync(resPath, "utf-8")) as {
      status?: string;
      reason?: string;
    };
    if (data.status !== "approved" && data.status !== "denied") return undefined;
    const reason =
      typeof data.reason === "string" && data.reason.trim() ? data.reason.trim() : undefined;
    return { status: data.status, reason };
  } catch {
    return undefined;
  }
}

export function readPermissionStatus(
  sessionDir: string,
  toolCallId: string,
): "approved" | "denied" | undefined {
  return readPermissionDecision(sessionDir, toolCallId)?.status;
}

export function readBashJobResult(
  sessionDir: string,
  toolCallId: string,
): BashJobResult | undefined {
  const resPath = path.join(sessionDir, `${toolCallId}.result.json`);
  if (!fs.existsSync(resPath)) return undefined;
  try {
    const result = JSON.parse(fs.readFileSync(resPath, "utf-8")) as {
      output?: string;
      exitCode?: number;
      exit?: number;
      cwd?: string;
    };
    return {
      output: result.output ?? "",
      exitCode: result.exitCode ?? result.exit ?? 1,
      cwd: result.cwd,
    };
  } catch {
    return undefined;
  }
}

export async function pollUntilToolCallId(
  sessionDir: string,
  context: Record<string, unknown>,
  abort: AbortSignal,
  deadlineMs: number,
): Promise<string | undefined> {
  const deadline = Date.now() + deadlineMs;
  while (!abort.aborted && Date.now() < deadline) {
    const id = resolveToolCallId(sessionDir, context);
    if (id) return id;
    await bridgeDelay(50);
  }
  return resolveToolCallId(sessionDir, context);
}

export async function waitForPermission(
  sessionDir: string,
  toolCallId: string,
  abort: AbortSignal,
  timeoutMs = PERMISSION_TIMEOUT_MS,
): Promise<"approved" | "denied" | "timeout"> {
  const deadline = Date.now() + timeoutMs;
  while (!abort.aborted && Date.now() < deadline) {
    const perm = readPermissionStatus(sessionDir, toolCallId);
    if (perm === "denied") return "denied";
    if (perm === "approved") return "approved";
    await bridgeDelay(50);
  }
  return readPermissionStatus(sessionDir, toolCallId) === "approved" ? "approved" : "timeout";
}
