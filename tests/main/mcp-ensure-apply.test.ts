import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { EnsureDefaultMcpResult } from "../../src/main/services/project-mcp-defaults";

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
}));

const handlers = new Map<string, (...args: unknown[]) => unknown>();

import { registerMcpHandlers } from "../../src/main/ipc/mcp";

describe("mcp:ensure without OpenCode", () => {
  let root: string;

  beforeEach(() => {
    handlers.clear();
    root = mkdtempSync(join(tmpdir(), "prism-mcp-ensure-"));
    registerMcpHandlers();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("does not plant project.local when the paper has no MCP config", async () => {
    const ensure = handlers.get("mcp:ensure");
    expect(ensure).toBeTruthy();
    const result = (await ensure!({}, { projectPath: root })) as {
      ok: boolean;
      reloadedSessions?: number;
      ensure?: Pick<EnsureDefaultMcpResult, "added" | "migrated">;
    };
    expect(result.ok).toBe(true);
    expect(result.ensure?.added).toBe(false);
    expect(result.ensure?.migrated).toBe(false);
    expect(result.reloadedSessions).toBe(0);
    expect(existsSync(join(root, ".prismnext"))).toBe(false);
  });

  it("ignores leftover .prismnext/agent/mcp.json (D-30)", async () => {
    const leftoverDir = join(root, ".prismnext", "agent");
    mkdirSync(leftoverDir, { recursive: true });
    writeFileSync(
      join(leftoverDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            "paper-search-mcp": {
              type: "local",
              enabled: true,
              command: ["npx", "-y", "paper-search-mcp-nodejs"],
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    const ensure = handlers.get("mcp:ensure");
    const result = (await ensure!({}, { projectPath: root })) as {
      ok: boolean;
      reloadedSessions?: number;
      ensure?: Pick<EnsureDefaultMcpResult, "migrated" | "removed">;
    };
    expect(result.ok).toBe(true);
    expect(result.ensure?.migrated).toBe(false);
    expect(result.reloadedSessions).toBe(0);
    expect(existsSync(join(root, ".workbench", "agent", "teams"))).toBe(false);
  });

  it("strips paper-search from an existing workbench hangar without reloading OpenCode sessions", async () => {
    const hangar = join(root, ".workbench", "agent", "teams", "project.local");
    mkdirSync(hangar, { recursive: true });
    writeFileSync(
      join(hangar, "mcp.json"),
      `${JSON.stringify(
        [
          {
            id: "paper-search-mcp",
            name: "paper-search-mcp",
            transport: { type: "stdio", command: "npx" },
          },
        ],
        null,
        2,
      )}\n`,
      "utf-8",
    );
    const ensure = handlers.get("mcp:ensure");
    const result = (await ensure!({}, { projectPath: root })) as {
      ok: boolean;
      reloadedSessions?: number;
      ensure?: Pick<EnsureDefaultMcpResult, "migrated" | "removed">;
    };
    expect(result.ok).toBe(true);
    expect(result.ensure?.removed).toBe(true);
    expect(result.reloadedSessions).toBe(0);
  });
});
