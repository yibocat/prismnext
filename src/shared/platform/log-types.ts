// Shared log types — isomorphic (main + renderer).

export type LogLevel = "debug" | "info" | "warn" | "error";

/** In-memory ring size — fetch and viewer must use the same cap. */
export const LOG_RING_LIMIT = 5000;

export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function isLogLevel(value: unknown): value is LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error";
}

export function logLevelMeetsMin(level: LogLevel, min: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[min];
}

/** Unix / Windows absolute paths — never keep home or user folders in logs. */
const ABS_PATH_RE =
  /(?:[A-Za-z]:[\\/]|\/(?:Users|home|private\/var|opt|usr|Volumes)\/)[^\s"',)]*/g;

export function lastPathSegment(pathish: string): string {
  const normalized = pathish.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || "…";
}

export function redactAbsolutePaths(text: string): string {
  return text.replace(ABS_PATH_RE, (match) => `…/${lastPathSegment(match)}`);
}

export function redactLogValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactAbsolutePaths(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return redactAbsolutePaths(value.message);
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactLogValue(item);
    }
    return out;
  }
  return value;
}

export function sanitizeLogEntry(entry: LogEntry): LogEntry {
  return {
    ...entry,
    message: redactAbsolutePaths(entry.message),
    detail: entry.detail === undefined ? undefined : redactLogValue(entry.detail),
  };
}

export type LogCategory =
  | "startup"
  | "git"
  | "agent"
  | "compile"
  | "fs"
  | "ipc"
  | "crash"
  | "security"
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
