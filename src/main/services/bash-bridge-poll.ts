import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Written by renderer IPC when a PTY job starts — bash.ts polls by toolCallId. */
export const ACTIVE_TOOL_FILE = ".active-tool.json";

export interface ActiveToolRecord {
  toolCallId: string;
  command: string;
  startedAt: number;
}

export function readActiveToolRecord(sessionDir: string): ActiveToolRecord | undefined {
  const path = join(sessionDir, ACTIVE_TOOL_FILE);
  if (!existsSync(path)) return undefined;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as Partial<ActiveToolRecord>;
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

/** Prefer explicit toolCallId from OpenCode context; else renderer `.active-tool.json`. */
export function resolveBashJobToolCallId(
  sessionDir: string,
  explicitToolCallId: string | undefined,
): string | undefined {
  if (explicitToolCallId?.trim()) return explicitToolCallId.trim();
  return readActiveToolCallId(sessionDir);
}

export function readBashJobResult(
  sessionDir: string,
  toolCallId: string,
): { output: string; exitCode: number; cwd?: string } | undefined {
  const resPath = join(sessionDir, `${toolCallId}.result.json`);
  if (!existsSync(resPath)) return undefined;
  try {
    const result = JSON.parse(readFileSync(resPath, "utf-8")) as {
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
