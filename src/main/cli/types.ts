import type { ChildProcess } from "node:child_process";
import type { Writable } from "node:stream";

export interface CliSession {
  child: ChildProcess;
  stdin: Writable;
  sessionId: string;
  agentId: string;
  cwd: string;
  status: "idle" | "busy";
  createdAt: number;
}

export interface CliParser {
  /** Parse one line of CLI output (NDJSON). Returns parsed message or null to skip. */
  parse(line: string): Record<string, unknown> | null;
}
