import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  LOG_LEVEL_ORDER,
  LOG_RING_LIMIT,
  redactAbsolutePaths,
  redactLogValue,
  sanitizeLogEntry,
  type LogLevel,
  type LogCategory,
  type LogEntry,
  type LogFetchParams,
  type LogFetchResult,
} from "@shared/platform/log-types";
import { getLogsPath } from "./paths";

// ─── Config ───

const MAX_MEMORY = LOG_RING_LIMIT;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_BATCH_MIN = 50;

let _minLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel) {
  _minLevel = level;
}

export function getLogLevel(): LogLevel {
  return _minLevel;
}

// ─── Ring buffer ───

let _id = 0;
const _buffer: LogEntry[] = [];

function push(entry: LogEntry) {
  _buffer.push(entry);
  if (_buffer.length > MAX_MEMORY) _buffer.shift();
}

// ─── File persistence ───

let _filePath: string | null = null;

function getLogPath(): string {
  if (!_filePath) {
    const dir = getLogsPath();
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // Best-effort — dropping logs is acceptable
    }
    _filePath = join(dir, "prism-next.log");
  }
  return _filePath;
}

let _pending: LogEntry[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flushPending();
  }, FLUSH_INTERVAL_MS);
}

function flushPending() {
  if (_pending.length === 0) return;

  const batch = _pending;
  _pending = [];
  const lines = batch.map(entryToLine).join("\n") + "\n";

  try {
    const p = getLogPath();
    let size = 0;
    try {
      size = statSync(p).size;
    } catch {
      size = 0;
    }
    if (size + Buffer.byteLength(lines) > MAX_FILE_BYTES) {
      try {
        renameSync(p, p.replace(/\.log$/, ".old.log"));
      } catch {
        // Rotation is best-effort
      }
    }
    appendFileSync(p, lines, "utf-8");
  } catch {
    // Best-effort — dropping logs is acceptable
  }
}

function entryToLine(e: LogEntry): string {
  const ts = new Date(e.ts).toISOString();
  const base = `${ts} [${e.level.toUpperCase()}] [${e.process}:${e.category}] ${e.module}: ${e.message}`;
  return e.detail !== undefined ? `${base} ${JSON.stringify(e.detail)}` : base;
}

/** Flush pending entries to disk. Safe to call more than once (quit + last window). */
export function flushAndCloseSync() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  flushPending();
}

/** Called on app quit. Sync so the last lines survive process exit. */
export async function flushAndClose() {
  flushAndCloseSync();
}

/** First non-empty line, truncated — never dump prompts, tool args, or TeX logs. */
export function shortLogDetail(value: unknown, max = 160): string {
  const text = value instanceof Error ? value.message : String(value ?? "");
  const line = redactAbsolutePaths(
    text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? "",
  );
  if (line.length <= max) return line;
  return `${line.slice(0, Math.max(0, max - 1))}…`;
}

// ─── Create logger ───

export function createLogger(module: string, category: LogCategory = "general") {
  function log(level: LogLevel, message: string, detail?: unknown) {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[_minLevel]) return;

    const entry: LogEntry = {
      id: ++_id,
      ts: Date.now(),
      level,
      category,
      module,
      message: redactAbsolutePaths(message),
      detail: detail === undefined ? undefined : redactLogValue(detail),
      process: "main",
    };

    push(entry);
    _pending.push(entry);

    if (_pending.length >= FLUSH_BATCH_MIN) {
      if (_flushTimer) {
        clearTimeout(_flushTimer);
        _flushTimer = null;
      }
      flushPending();
    } else {
      scheduleFlush();
    }
  }

  return {
    debug(msg: string, detail?: unknown) { log("debug", msg, detail); },
    info(msg: string, detail?: unknown) { log("info", msg, detail); },
    warn(msg: string, detail?: unknown) { log("warn", msg, detail); },
    error(msg: string, detail?: unknown) { log("error", msg, detail); },
  };
}

// ─── Fetch for IPC ───

export function getEntries(params: LogFetchParams = {}): LogFetchResult {
  let entries = [..._buffer];
  if (params.category) entries = entries.filter((e) => e.category === params.category);
  if (params.level) {
    const min = LOG_LEVEL_ORDER[params.level];
    entries = entries.filter((e) => LOG_LEVEL_ORDER[e.level] >= min);
  }
  if (params.since) entries = entries.filter((e) => e.ts >= params.since!);
  const total = entries.length;
  if (params.limit && params.limit < entries.length) {
    entries = entries.slice(entries.length - params.limit);
  }
  return { entries: entries.map(sanitizeLogEntry), total };
}
