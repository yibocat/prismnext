import { appendFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import type { LogLevel, LogCategory, LogEntry, LogFetchParams, LogFetchResult } from "@shared/log-types";

// ─── Config ───

const MAX_MEMORY = 5000;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_BATCH_MIN = 50;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

let _minLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel) {
  _minLevel = level;
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
    const dir = app?.getPath?.("logs") ?? join(app?.getPath?.("userData") ?? "/tmp", "logs");
    _filePath = join(dir, "prism-next.log");
  }
  return _filePath;
}

let _pending: LogEntry[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(doFlush, FLUSH_INTERVAL_MS);
}

async function doFlush() {
  _flushTimer = null;
  if (_pending.length === 0) return;

  const batch = _pending;
  _pending = [];
  const lines = batch.map(entryToLine).join("\n") + "\n";

  try {
    const p = getLogPath();
    const s = await stat(p).catch(() => null);
    if (s && s.size + Buffer.byteLength(lines) > MAX_FILE_BYTES) {
      // Rotate: rename old, start fresh
      await rename(p, p.replace(/\.log$/, `.old.log`)).catch(() => {});
    }
    await appendFile(p, lines, "utf-8");
  } catch {
    // Best-effort — dropping logs is acceptable
  }
}

function entryToLine(e: LogEntry): string {
  const ts = new Date(e.ts).toISOString();
  const base = `${ts} [${e.level.toUpperCase()}] [${e.process}:${e.category}] ${e.module}: ${e.message}`;
  return e.detail !== undefined ? `${base} ${JSON.stringify(e.detail)}` : base;
}

// Called on app quit
export async function flushAndClose() {
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  await doFlush();
}

// ─── Create logger ───

export function createLogger(module: string, category: LogCategory = "general") {
  function log(level: LogLevel, message: string, detail?: unknown) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[_minLevel]) return;

    const entry: LogEntry = {
      id: ++_id,
      ts: Date.now(),
      level,
      category,
      module,
      message,
      detail,
      process: "main",
    };

    push(entry);
    _pending.push(entry);

    if (_pending.length >= FLUSH_BATCH_MIN) {
      if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
      doFlush();
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
    const min = LEVEL_ORDER[params.level];
    entries = entries.filter((e) => LEVEL_ORDER[e.level] >= min);
  }
  if (params.since) entries = entries.filter((e) => e.ts >= params.since!);
  const total = entries.length;
  if (params.limit && params.limit < entries.length) {
    entries = entries.slice(entries.length - params.limit);
  }
  return { entries, total };
}
