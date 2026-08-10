import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const applyProjectMcpConfig = vi.fn(async () => ({ reloadedSessions: 2 }));
const prewarmProject = vi.fn();

vi.mock("../../src/main/acp/service", () => ({
  AcpService: {
    getInstance: () => ({
      prewarmProject,
      applyProjectMcpConfig,
    }),
  },
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
  },
}));

const handlers = new Map<string, (...args: unknown[]) => unknown>();

import { registerMcpHandlers } from "../../src/main/ipc/mcp";

describe("mcp:ensure apply-on-change (Bug #25)", () => {
  let root: string;

  beforeEach(() => {
    handlers.clear();
    applyProjectMcpConfig.mockClear();
    prewarmProject.mockClear();
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
      ensure?: { added?: boolean };
    };
    expect(result.ok).toBe(true);
    expect(result.ensure?.added).toBe(false);
    expect(prewarmProject).toHaveBeenCalledWith(root);
    expect(applyProjectMcpConfig).not.toHaveBeenCalled();
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

  it("reloads open sessions when legacy paper-search is stripped", async () => {
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
      ensure?: { removed?: boolean };
    };
    expect(result.ok).toBe(true);
    expect(result.ensure?.migrated).toBe(true);
    expect(applyProjectMcpConfig).toHaveBeenCalledWith(root);
    expect(result.reloadedSessions).toBe(2);
  });
});
