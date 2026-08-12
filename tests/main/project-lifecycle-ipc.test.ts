import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLifecycleFs } from "../../src/main/services/project-lifecycle-authority";

type IpcHandler = (event: unknown, args?: { rootPath: string }) => Promise<unknown>;
const handlers = new Map<string, IpcHandler>();
const watcher = vi.hoisted(() => ({
  startWatching: vi.fn(),
  stopWatching: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: { handle: (channel: string, handler: IpcHandler) => handlers.set(channel, handler) },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => undefined },
  dialog: {},
}));

import { registerFsHandlers } from "../../src/main/ipc/fs";
import { registerProjectLifecycleHandlers } from "../../src/main/ipc/project-lifecycle";
import { ProjectLifecycleAuthority } from "../../src/main/services/project-lifecycle-authority";

const home = "/fake-home";
const project = `${home}/research`;
const alias = `${home}/research-link`;

function createAuthority(paths: Record<string, string>): ProjectLifecycleAuthority {
  const fs: ProjectLifecycleFs = {
    realpath: async (path) => {
      const canonical = paths[path];
      if (!canonical) throw new Error(`ENOENT: ${path}`);
      return canonical;
    },
    stat: async () => ({ isDirectory: () => true }),
  };
  return new ProjectLifecycleAuthority({ homeDir: home, fs });
}

function registerHandlers(authority: ProjectLifecycleAuthority) {
  registerProjectLifecycleHandlers(watcher, authority);
  registerFsHandlers(watcher, authority);
}

describe("project lifecycle watcher authority IPC", () => {
  beforeEach(() => {
    handlers.clear();
    watcher.startWatching.mockReset();
    watcher.stopWatching.mockReset();
    watcher.startWatching.mockResolvedValue({ ready: Promise.resolve() });
    watcher.stopWatching.mockResolvedValue(undefined);
  });

  it("validates a project without authorizing watchers until activate", async () => {
    const authority = createAuthority({ [home]: home, [alias]: project, [project]: project });
    registerHandlers(authority);

    await expect(handlers.get("project:open")!({}, { rootPath: alias })).resolves.toEqual({
      rootPath: project,
    });
    expect(authority.currentRoot).toBeNull();
    await expect(
      handlers.get("fs:watch-start")!({}, { rootPath: `${home}/renderer-supplied-path` }),
    ).rejects.toThrow(/unopened project/);
    expect(watcher.startWatching).not.toHaveBeenCalled();
    expect(watcher.stopWatching).not.toHaveBeenCalled();

    await expect(handlers.get("project:activate")!({}, { rootPath: alias })).resolves.toEqual({
      rootPath: project,
    });
    await expect(
      handlers.get("fs:watch-start")!({}, { rootPath: `${home}/renderer-supplied-path` }),
    ).resolves.toBeUndefined();
    expect(watcher.startWatching).toHaveBeenCalledWith(project);
  });

  it("does not let a scan authorize watcher startup", async () => {
    const authority = createAuthority({ [home]: home, [project]: project });
    registerHandlers(authority);

    await expect(handlers.get("fs:scan")!({}, { rootPath: project })).rejects.toThrow();
    await expect(handlers.get("fs:watch-start")!({}, { rootPath: project })).rejects.toThrow(
      /unopened project/,
    );
    expect(watcher.startWatching).not.toHaveBeenCalled();
  });

  it("rejects a home symlink that resolves outside home", async () => {
    const systemAlias = `${home}/system-link`;
    const authority = createAuthority({
      [home]: home,
      [systemAlias]: "/System/Library",
      "/System/Library": "/System/Library",
    });
    registerHandlers(authority);

    await expect(
      handlers.get("project:open")!({}, { rootPath: systemAlias }),
    ).rejects.toThrow(/outside the user home/);
    await expect(
      handlers.get("fs:watch-start")!({}, { rootPath: systemAlias }),
    ).rejects.toThrow(/unopened project/);
    expect(watcher.startWatching).not.toHaveBeenCalled();
  });

  it("stops watchers and revokes authorization when the project closes", async () => {
    const authority = createAuthority({ [home]: home, [project]: project });
    registerHandlers(authority);
    await handlers.get("project:open")!({}, { rootPath: project });
    await handlers.get("project:activate")!({}, { rootPath: project });

    await expect(handlers.get("project:close")!({})).resolves.toBeUndefined();
    expect(watcher.stopWatching).toHaveBeenCalledTimes(1);
    await expect(handlers.get("fs:watch-start")!({}, { rootPath: project })).rejects.toThrow(
      /unopened project/,
    );
  });

  it("stops the old watcher before switching to a different canonical root", async () => {
    const nextProject = `${home}/next-research`;
    const authority = createAuthority({
      [home]: home,
      [project]: project,
      [nextProject]: nextProject,
    });
    registerHandlers(authority);

    await handlers.get("project:open")!({}, { rootPath: project });
    await handlers.get("project:activate")!({}, { rootPath: project });
    await handlers.get("project:open")!({}, { rootPath: nextProject });
    expect(authority.currentRoot).toBe(project);
    expect(watcher.stopWatching).not.toHaveBeenCalled();

    await handlers.get("project:activate")!({}, { rootPath: nextProject });
    await handlers.get("fs:watch-start")!({}, { rootPath: project });

    expect(watcher.stopWatching).toHaveBeenCalledTimes(1);
    expect(watcher.startWatching).toHaveBeenCalledWith(nextProject);
  });

  it("keeps an equivalent symlink root active without stopping its watcher", async () => {
    const authority = createAuthority({ [home]: home, [alias]: project, [project]: project });
    registerHandlers(authority);

    await handlers.get("project:open")!({}, { rootPath: alias });
    await handlers.get("project:activate")!({}, { rootPath: alias });
    await handlers.get("project:open")!({}, { rootPath: project });
    await handlers.get("project:activate")!({}, { rootPath: project });

    expect(watcher.stopWatching).not.toHaveBeenCalled();
    expect(authority.currentRoot).toBe(project);
  });
});
