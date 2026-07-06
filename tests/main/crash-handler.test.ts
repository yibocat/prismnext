import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  formatCrashEntry,
  appendCrashLog,
  getCrashLogPath,
  registerCrashHandlers,
} from "../../src/main/lib/crash-handler";

describe("crash-handler", () => {
  describe("formatCrashEntry", () => {
    it("formats an Error with source, message, and stack", () => {
      const entry = formatCrashEntry(new Error("boom"), "uncaughtException");
      expect(entry).toContain("[uncaughtException]");
      expect(entry).toContain("boom");
      expect(entry).toContain("Error: boom"); // stack line
      expect(entry.endsWith("\n\n")).toBe(true);
    });

    it("formats a non-Error value (string) into an Error shape", () => {
      const entry = formatCrashEntry("string failure", "unhandledRejection");
      expect(entry).toContain("[unhandledRejection]");
      expect(entry).toContain("string failure");
    });

    it("formats null/undefined without throwing", () => {
      expect(() => formatCrashEntry(null, "uncaughtException")).not.toThrow();
      expect(() => formatCrashEntry(undefined, "unhandledRejection")).not.toThrow();
      expect(formatCrashEntry(null, "uncaughtException")).toContain("[uncaughtException]");
    });

    it("starts with an ISO timestamp", () => {
      const entry = formatCrashEntry(new Error("x"), "uncaughtException");
      expect(entry).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("appendCrashLog", () => {
    // When `app` is unavailable (vitest, not Electron runtime), the path
    // resolves to /tmp/logs/crashes.log.
    const crashPath = getCrashLogPath();

    beforeEach(() => {
      try { rmSync(crashPath, { force: true }); } catch { /* ignore */ }
    });

    afterEach(() => {
      try { rmSync(crashPath, { force: true }); } catch { /* ignore */ }
    });

    it("writes a durable entry to crashes.log", () => {
      appendCrashLog(new Error("persisted-crash"), "uncaughtException");
      expect(existsSync(crashPath)).toBe(true);
      const content = readFileSync(crashPath, "utf-8");
      expect(content).toContain("persisted-crash");
      expect(content).toContain("[uncaughtException]");
    });

    it("appends multiple entries without overwriting", () => {
      appendCrashLog(new Error("first"), "uncaughtException");
      appendCrashLog(new Error("second"), "unhandledRejection");
      const content = readFileSync(crashPath, "utf-8");
      expect(content).toContain("first");
      expect(content).toContain("second");
      expect(content).toContain("[unhandledRejection]");
    });

    it("never throws on valid input (best-effort contract)", () => {
      expect(() => appendCrashLog(new Error("ok"), "uncaughtException")).not.toThrow();
    });
  });

  describe("registerCrashHandlers", () => {
    it("attaches uncaughtException and unhandledRejection listeners", () => {
      const before = process.listenerCount("uncaughtException");
      const beforeRej = process.listenerCount("unhandledRejection");
      registerCrashHandlers();
      expect(process.listenerCount("uncaughtException")).toBeGreaterThan(before);
      expect(process.listenerCount("unhandledRejection")).toBeGreaterThan(beforeRej);
    });
  });

  describe("getCrashLogPath", () => {
    it("resolves to crashes.log under a logs directory", () => {
      const p = getCrashLogPath();
      expect(p.endsWith("crashes.log")).toBe(true);
      expect(dirname(p).endsWith("logs")).toBe(true);
    });
  });

  afterAll(() => {
    // Clean up /tmp/logs created when app is unavailable in tests.
    try { rmSync(join("/tmp", "logs"), { force: true, recursive: true }); } catch { /* ignore */ }
  });
});
