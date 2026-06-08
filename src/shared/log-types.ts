// Shared log types — used by both main and renderer processes.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogCategory =
  | "startup"
  | "git"
  | "agent"
  | "compile"
  | "fs"
  | "ipc"
  | "general";

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  category: LogCategory;
  module: string;
  message: string;
  detail?: unknown;
  process: "main" | "renderer";
}

export interface LogFetchParams {
  category?: LogCategory;
  level?: LogLevel;
  limit?: number;
  since?: number; // timestamp — only entries after this
}

export interface LogFetchResult {
  entries: LogEntry[];
  total: number;
}
