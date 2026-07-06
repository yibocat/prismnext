/**
 * Main-process crash handlers.
 *
 * Problem: {@link ../index.ts} registered no `process.on('uncaughtException' /
 * 'unhandledRejection')` handlers, so main-process crashes were invisible —
 * no dump, no recovery, no user notification.
 *
 * This module registers both handlers. Each handler:
 *  1. Pushes the error to the structured logger (ring buffer + prism-next.log),
 *     so it shows up in the in-app Log Viewer.
 *  2. Synchronously appends to a durable `crashes.log` — the logger is async
 *     and batched and may not flush before a hard crash, so a synchronous
 *     `appendFileSync` is the durable backstop.
 *
 * The handlers deliberately do NOT call `app.quit()` — the user keeps a chance
 * to save work, and Electron's own native crash dialog is preserved.
 */
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { app } from "electron";
import { createLogger } from "../services/logger";

const crashLog = createLogger("main", "crash");

/** Resolve the crash log file path. Falls back to /tmp when `app` is unavailable. */
export function getCrashLogPath(): string {
  const logsDir = app?.getPath?.("logs") ?? join(app?.getPath?.("userData") ?? "/tmp", "logs");
  return join(logsDir, "crashes.log");
}

/** Format a crash entry as a durable log line (pure — testable). */
export function formatCrashEntry(err: unknown, source: string): string {
  const ts = new Date().toISOString();
  const e = err instanceof Error ? err : new Error(String(err));
  const msg = e.message || String(e);
  const stack = e.stack || "";
  return `${ts} [${source}] ${msg}\n${stack}\n\n`;
}

/** Synchronously append a crash entry to crashes.log. Best-effort, never throws. */
export function appendCrashLog(err: unknown, source: string): void {
  try {
    const p = getCrashLogPath();
    const dir = dirname(p);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(p, formatCrashEntry(err, source), "utf-8");
  } catch {
    // Crash logging must never throw — swallowing is acceptable here.
  }
}

function handle(err: unknown, source: string): void {
  // 1. Visible in Log Viewer (ring buffer + prism-next.log via batched flush).
  crashLog.error(`uncaught ${source}`, {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  // 2. Durable synchronous dump.
  appendCrashLog(err, source);
}

/** Register `uncaughtException` + `unhandledRejection` handlers. Idempotent-ish:
 *  calling twice attaches a second listener, so call once at startup. */
export function registerCrashHandlers(): void {
  process.on("uncaughtException", (err) => handle(err, "uncaughtException"));
  process.on("unhandledRejection", (reason) => handle(reason, "unhandledRejection"));
}
