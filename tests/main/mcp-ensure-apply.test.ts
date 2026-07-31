import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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

  it("calls applyProjectMcpConfig when ensure adds Paper Search", async () => {
    const ensure = handlers.get("mcp:ensure");
    expect(ensure).toBeTruthy();
    const result = (await ensure!({}, { projectPath: root })) as {
      ok: boolean;
      reloadedSessions?: number;
      ensure?: { added?: boolean };
    };
    expect(result.ok).toBe(true);
    expect(result.ensure?.added).toBe(true);
    expect(prewarmProject).toHaveBeenCalledWith(root);
    expect(applyProjectMcpConfig).toHaveBeenCalledWith(root);
    expect(result.reloadedSessions).toBe(2);
  });

  it("skips apply when mcp.json already has the built-in server", async () => {
    const ensure = handlers.get("mcp:ensure");
    // First call seeds the file.
    await ensure!({}, { projectPath: root });
    applyProjectMcpConfig.mockClear();
    prewarmProject.mockClear();

    const result = (await ensure!({}, { projectPath: root })) as {
      ok: boolean;
      reloadedSessions?: number;
      ensure?: { added?: boolean; migrated?: boolean; reenabled?: boolean };
    };
    expect(result.ok).toBe(true);
    expect(result.ensure?.added).toBe(false);
    expect(result.ensure?.migrated).toBe(false);
    expect(result.ensure?.reenabled).toBe(false);
    expect(prewarmProject).toHaveBeenCalledWith(root);
    expect(applyProjectMcpConfig).not.toHaveBeenCalled();
    expect(result.reloadedSessions).toBe(0);
  });
});
