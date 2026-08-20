import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LogEntry } from "@shared/log-types";

vi.mock("@/services/logger", () => ({
  logBuffer: [] as LogEntry[],
}));

import { logBuffer } from "@/services/logger";
import { filterLogEntries, formatLogCopy, formatLogExport } from "@/stores/log-store";

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

  it("keeps only the selected level", () => {
    const withError: LogEntry[] = [
      ...mainEntries,
      {
        id: 9,
        ts: 9000,
        level: "error",
        category: "compile",
        module: "compiler",
        message: "compile.fail",
        process: "main",
      },
    ];
    const warnOnly = filterLogEntries(withError, "all", "warn", "");
    expect(warnOnly.map((e) => e.level)).toEqual(["warn", "warn"]);

    const errorOnly = filterLogEntries(withError, "all", "error", "");
    expect(errorOnly).toHaveLength(1);
    expect(errorOnly[0]?.level).toBe("error");
  });

  it("keeps only info when info is selected", () => {
    const result = filterLogEntries(mainEntries, "all", "info", "");
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.level === "info")).toBe(true);
  });

  it("keeps only debug when debug is selected", () => {
    const withDebug: LogEntry[] = [
      ...mainEntries,
      {
        id: 6,
        ts: 6000,
        level: "debug",
        category: "startup",
        module: "document-store",
        message: "openProject complete",
        process: "renderer",
      },
    ];
    const result = filterLogEntries(withDebug, "all", "debug", "");
    expect(result).toHaveLength(1);
    expect(result[0]?.level).toBe("debug");
  });

  it("filters by category only", () => {
    const result = filterLogEntries(mainEntries, "startup", "all", "");
    expect(result).toHaveLength(1);
    expect(result[0]?.category).toBe("startup");
  });

  it("combines category and exact-level filters", () => {
    const result = filterLogEntries(mainEntries, "agent", "warn", "");
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.category === "agent" && e.level === "warn")).toBe(true);

    const agentInfo = filterLogEntries(mainEntries, "agent", "info", "");
    expect(agentInfo).toHaveLength(1);
    expect(agentInfo[0]?.module).toBe("prompt-manager");
  });

  it("exports the current filtered rows", () => {
    const text = formatLogExport(filterLogEntries(mainEntries, "agent", "warn", ""));
    expect(text).toContain("MCP providers/set not available");
    expect(text).not.toContain("Prompt system initialized");
  });

  it("redacts home paths in export and search", () => {
    const leaked: LogEntry[] = [
      {
        id: 8,
        ts: 8000,
        level: "info",
        category: "startup",
        module: "pro-packs-discovery",
        message: "pro packs discovery complete",
        detail: {
          packageDir: "/Users/yibow/MyPro/ResearchPrism/prism-next-pro",
          registered: ["prismnext.pro.claim-police"],
        },
        process: "main",
      },
    ];
    const text = formatLogExport(leaked);
    expect(text).toContain("…/prism-next-pro");
    expect(text).not.toContain("/Users/yibow");
    expect(text).not.toContain("yibow");

    const byBasename = filterLogEntries(leaked, "all", "all", "prism-next-pro");
    expect(byBasename).toHaveLength(1);
    expect(String(byBasename[0]?.detail)).not.toContain("/Users/yibow");

    const copied = formatLogCopy(leaked);
    expect(copied).toContain("pro packs discovery complete");
    expect(copied).toContain('"packageDir": "…/prism-next-pro"');
    expect(copied).toContain("\n{");
    expect(copied).not.toContain("/Users/yibow");
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
