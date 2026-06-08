import type { LogLevel, LogCategory, LogEntry } from "@shared/log-types";

// ─── Dev / prod toggle ───

const MIN_LEVEL: LogLevel =
  typeof import.meta !== "undefined" && (import.meta as any).env?.MODE === "production"
    ? "info"
    : "debug";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

// ─── Console colors ───

const COLORS: Record<LogLevel, string> = {
  debug: "#888", info: "#3B82F6", warn: "#F59E0B", error: "#EF4444",
};

// ─── Ring buffer ───

let _id = 0;
const MAX_MEMORY = 5000;
export const logBuffer: LogEntry[] = [];

function push(entry: LogEntry) {
  logBuffer.push(entry);
  if (logBuffer.length > MAX_MEMORY) logBuffer.shift();
}

// ─── Create logger ───

export function createLogger(module: string, category: LogCategory = "general") {
  function log(level: LogLevel, message: string, detail?: unknown) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

    const entry: LogEntry = {
      id: ++_id,
      ts: Date.now(),
      level,
      category,
      module,
      message,
      detail,
      process: "renderer",
    };

    push(entry);

    // Also print to console for dev convenience
    const tag = `[${module}]`;
    const color = COLORS[level];
    const fn = level === "error" ? console.error
      : level === "warn" ? console.warn
      : level === "info" ? console.info
      : console.debug;
    fn(`%c[${level.toUpperCase()}]%c ${tag} ${message}`, `color:${color}`, "", detail ?? "");
  }

  return {
    debug(msg: string, detail?: unknown) { log("debug", msg, detail); },
    info(msg: string, detail?: unknown) { log("info", msg, detail); },
    warn(msg: string, detail?: unknown) { log("warn", msg, detail); },
    error(msg: string, detail?: unknown) { log("error", msg, detail); },
  };
}
