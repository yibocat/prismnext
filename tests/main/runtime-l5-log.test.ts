import { beforeEach, describe, expect, it, vi } from "vitest";

const { info, warn, debug, error } = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));

const storeCtl = vi.hoisted(() => ({
  throwOnSet: false,
  data: {} as Record<string, unknown>,
}));

vi.mock("../../src/main/services/logger", () => ({
  createLogger: () => ({ info, warn, debug, error }),
  shortLogDetail: (value: unknown, max = 160) => {
    const text = value instanceof Error ? value.message : String(value ?? "");
    const line = text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? "";
    return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
  },
  getEntries: () => ({ entries: [], total: 0 }),
  flushAndCloseSync: () => undefined,
  setLogLevel: vi.fn(),
  getLogLevel: () => "info",
}));

vi.mock("electron-store", () => ({
  default: class MockStore {
    get store() {
      return storeCtl.data;
    }
    get(key: string) {
      return storeCtl.data[key];
    }
    set(patch: Record<string, unknown>) {
      if (storeCtl.throwOnSet) throw new Error("EACCES: permission denied");
      Object.assign(storeCtl.data, patch);
    }
  },
}));

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s, "utf8"),
    decryptString: (b: Buffer) => b.toString("utf8"),
  },
}));

import { updateSettings } from "../../src/main/services/settings";
import { installIpcHandlerErrorGuard } from "../../src/main/ipc/log";

beforeEach(() => {
  info.mockReset();
  warn.mockReset();
  debug.mockReset();
  error.mockReset();
  storeCtl.throwOnSet = false;
  for (const key of Object.keys(storeCtl.data)) delete storeCtl.data[key];
});

describe("L5 settings persist logs", () => {
  it("logs settings.persist.fail without the patch payload", () => {
    storeCtl.throwOnSet = true;
    expect(() =>
      updateSettings({ aiApiKeys: { openai: "sk-secret-key" } }),
    ).toThrow(/EACCES/);
    expect(warn).toHaveBeenCalledWith(
      "settings.persist.fail",
      expect.objectContaining({ error: "EACCES: permission denied" }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sk-secret-key");
  });
});

describe("L5 IPC handler error guard", () => {
  function installFake() {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle(channel: string, listener: (...args: unknown[]) => unknown) {
        handlers.set(channel, listener);
      },
    };
    installIpcHandlerErrorGuard(ipc as Pick<Electron.IpcMain, "handle">);
    return { ipc, handlers };
  }

  it("logs ipc.handler.error on throw, without handler arguments", async () => {
    const { ipc, handlers } = installFake();
    ipc.handle("fs:scan", async (_event, args) => {
      void args;
      throw new Error("boom");
    });
    await expect(
      handlers.get("fs:scan")!({}, { rootPath: "/secret/project", prompt: "user secret prompt" }),
    ).rejects.toThrow("boom");
    expect(error).toHaveBeenCalledWith(
      "ipc.handler.error",
      expect.objectContaining({ channel: "fs:scan", error: "boom" }),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("user secret prompt");
    expect(JSON.stringify(error.mock.calls)).not.toContain("/secret/project");
  });

  it("does not treat { ok: false } as an error", async () => {
    const { ipc, handlers } = installFake();
    ipc.handle("agent:send", async () => ({ ok: false, error: "turn_in_progress" }));
    await expect(handlers.get("agent:send")!()).resolves.toEqual({
      ok: false,
      error: "turn_in_progress",
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("does not log failures from log:fetch", async () => {
    const { ipc, handlers } = installFake();
    ipc.handle("log:fetch", async () => {
      throw new Error("disk");
    });
    await expect(handlers.get("log:fetch")!()).rejects.toThrow("disk");
    expect(error).not.toHaveBeenCalled();
  });
});
