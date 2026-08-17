import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    mkdirSync(join(root, ".prismnext", "agent"), { recursive: true });
    registerMcpHandlers();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates an empty project.local MCP array when missing", async () => {
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
    expect(
      JSON.parse(
        (await import("node:fs")).readFileSync(
          join(root, ".prismnext", "agent", "teams", "project.local", "mcp.json"),
          "utf-8",
        ),
      ),
    ).toEqual([]);
    expect((await import("node:fs")).existsSync(join(root, ".prismnext", "agent", "mcp.json"))).toBe(false);
  });

  it("repairs a legacy paper-search file without reloading OpenCode sessions", async () => {
    const agentDir = join(root, ".prismnext", "agent");
    writeFileSync(
      join(agentDir, "mcp.json"),
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
    expect(result.ensure?.migrated).toBe(true);
    expect(result.reloadedSessions).toBe(0);
  });
});
