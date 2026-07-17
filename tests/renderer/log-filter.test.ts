import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LogEntry } from "@shared/log-types";

vi.mock("@/services/logger", () => ({
  logBuffer: [] as LogEntry[],
}));

import { logBuffer } from "@/services/logger";
import { filterLogEntries } from "@/stores/log-store";

const mainEntries: LogEntry[] = [
  {
    id: 1,
    ts: 1000,
    level: "info",
    category: "startup",
    module: "main",
    message: "Prompt system initialized",
    process: "main",
  },
  {
    id: 2,
    ts: 2000,
    level: "info",
    category: "agent",
    module: "prompt-manager",
    message: "PromptManager initialized",
    process: "main",
  },
  {
    id: 3,
    ts: 3000,
    level: "warn",
    category: "agent",
    module: "mcp-service",
    message: "MCP providers/set not available",
    process: "main",
  },
  {
    id: 4,
    ts: 4000,
    level: "warn",
    category: "agent",
    module: "mcp-service",
    message: "MCP providers/set not available (custom)",
    process: "main",
  },
];

describe("filterLogEntries", () => {
  beforeEach(() => {
    logBuffer.length = 0;
  });

  it("returns only warn rows when warn tab is selected", () => {
    const result = filterLogEntries(mainEntries, "all", "warn", "");
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.level === "warn")).toBe(true);
  });

  it("returns only info rows when info tab is selected", () => {
    const result = filterLogEntries(mainEntries, "all", "info", "");
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.level === "info")).toBe(true);
  });

  it("returns empty array when debug tab has no matches", () => {
    const result = filterLogEntries(mainEntries, "all", "debug", "");
    expect(result).toHaveLength(0);
  });

  it("combines category and level filters", () => {
    const result = filterLogEntries(mainEntries, "agent", "warn", "");
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.category === "agent" && e.level === "warn")).toBe(true);
  });

  it("orders newest first", () => {
    const result = filterLogEntries(mainEntries, "all", "all", "");
    expect(result.map((e) => e.id)).toEqual([4, 3, 2, 1]);
  });

  it("searches message, module, and detail JSON", () => {
    const withDetail: LogEntry[] = [
      ...mainEntries,
      {
        id: 5,
        ts: 5000,
        level: "error",
        category: "compile",
        module: "compile-ipc",
        message: "compile:execute failed",
        detail: { error: "missing main.tex", projectDir: "/tmp/demo" },
        process: "main",
      },
    ];
    const byDetail = filterLogEntries(withDetail, "all", "all", "missing main.tex");
    expect(byDetail).toHaveLength(1);
    expect(byDetail[0].id).toBe(5);

    const byModule = filterLogEntries(withDetail, "all", "all", "compile-ipc");
    expect(byModule.some((e) => e.id === 5)).toBe(true);
  });
});
