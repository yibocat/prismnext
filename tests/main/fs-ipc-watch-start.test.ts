import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLifecycleFs } from "../../src/main/project/project-lifecycle-authority";

type IpcHandler = (event: unknown, args: { rootPath: string }) => Promise<unknown>;
const handlers = new Map<string, IpcHandler>();
const state = vi.hoisted(() => ({ startWatching: vi.fn() }));

vi.mock("electron-store", () => ({
  default: class MockStore {
    store = {};
    get() {
      return undefined;
    }
    set() {}
  },
}));

vi.mock("electron", () => ({
  ipcMain: { handle: (channel: string, handler: IpcHandler) => handlers.set(channel, handler) },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => undefined },
  dialog: {},
  app: { getVersion: () => "0.9.0", getPath: () => "/tmp" },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s, "utf8"),
    decryptString: (b: Buffer) => b.toString("utf8"),
  },
}));

import { registerFsHandlers } from "../../src/main/ipc/fs";
import { setRemoteSessionBrokerForTests } from "../../src/main/ipc/remote";
import { ProjectLifecycleAuthority } from "../../src/main/project/project-lifecycle-authority";

const home = "/fake-home";
const root = `${home}/project`;

function createAuthority(): ProjectLifecycleAuthority {
  const fs: ProjectLifecycleFs = {
    realpath: async (path) => {
      if (path === home || path === root) return path;
      throw new Error(`ENOENT: ${path}`);
    },
    stat: async () => ({ isDirectory: () => true }),
  };
  return new ProjectLifecycleAuthority({ homeDir: home, fs });
}

describe("fs:watch-start IPC", () => {
  let authority: ProjectLifecycleAuthority;
  const stopWatching = vi.fn();

  beforeEach(() => {
    handlers.clear();
    state.startWatching.mockReset();
    stopWatching.mockReset();
    state.startWatching.mockImplementation(async () => {
      return { ready: Promise.resolve() };
    });
    stopWatching.mockResolvedValue(undefined);
    authority = createAuthority();
    registerFsHandlers({
      startWatching: state.startWatching,
      stopWatching,
    }, authority);
  });

  afterEach(() => {
    state.startWatching.mockReset();
  });

  it("rejects unopened roots before watcher startup can create Agent metadata", async () => {
    const handler = handlers.get("fs:watch-start")!;

    await expect(handler({}, { rootPath: root })).rejects.toThrow(/unopened project/);
    expect(state.startWatching).not.toHaveBeenCalled();
  });

  it("starts watching only the authority's canonical project root", async () => {
    const handler = handlers.get("fs:watch-start")!;
    await authority.open(root);

    await expect(handler({}, { rootPath: `${home}/renderer-path` })).resolves.toBeUndefined();
    expect(state.startWatching).toHaveBeenCalledWith(root);
  });

  it("does not stop a newer watcher if the authorized root changes during startup", async () => {
    const handler = handlers.get("fs:watch-start")!;
    await authority.open(root);
    state.startWatching.mockImplementation(async () => {
      authority.close();
      return { ready: Promise.resolve() };
    });

    await expect(handler({}, { rootPath: root })).rejects.toThrow(/unopened project/);
    expect(stopWatching).not.toHaveBeenCalled();
  });

  it("routes remote roots to the host watcher instead of local chokidar", async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, root: "/home/u/proj" });
    setRemoteSessionBrokerForTests({
      isBound: () => true,
      invoke,
    } as never);
    try {
      authority.activate("remote://lab/home/u/proj");
      const handler = handlers.get("fs:watch-start")!;
      await handler({}, { rootPath: "remote://lab/home/u/proj" });
      expect(invoke).toHaveBeenCalledWith("lab", "fs:watchStart", {
        rootPath: "/home/u/proj",
      });
      expect(state.startWatching).not.toHaveBeenCalled();

      const stopHandler = handlers.get("fs:watch-stop")!;
      await stopHandler({}, { rootPath: "remote://lab/home/u/proj" });
      expect(invoke).toHaveBeenCalledWith("lab", "fs:watchStop", {});
      expect(stopWatching).not.toHaveBeenCalled();
    } finally {
      setRemoteSessionBrokerForTests(null);
    }
  });
});
