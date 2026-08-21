import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testState = vi.hoisted(() => ({ watch: vi.fn() }));

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("chokidar", () => ({
  watch: testState.watch,
}));

import { projectWatcherFs, startWatching, stopWatching } from "../../src/main/services/filesystem";

function fakeWatcher() {
  const watcher = {
    on: vi.fn(),
    once: vi.fn(),
    close: vi.fn(async () => {}),
    getWatched: vi.fn(() => ({})),
  };
  watcher.once.mockImplementation((event: string, listener: () => void) => {
    if (event === "ready") queueMicrotask(listener);
    return watcher;
  });
  watcher.on.mockImplementation(() => watcher);
  return watcher;
}

describe("filesystem watcher startup", () => {
  afterEach(async () => {
    await stopWatching();
    testState.watch.mockReset();
    vi.restoreAllMocks();
  });

  it("does not create any watcher when Agent-root initialization fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-watcher-startup-failure-"));
    testState.watch.mockImplementation(() => fakeWatcher());
    writeFileSync(join(root, ".workbench"), "not a directory\n");

    try {
      await expect(startWatching(root)).rejects.toThrow();
      expect(testState.watch).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not leave a watcher running if stopWatching happens during Agent-root mkdir", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-watcher-mkdir-race-"));
    testState.watch.mockImplementation(() => fakeWatcher());

    let enteredMkdir!: () => void;
    const atMkdir = new Promise<void>((resolve) => {
      enteredMkdir = resolve;
    });
    let releaseMkdir!: () => void;
    const holdMkdir = new Promise<void>((resolve) => {
      releaseMkdir = resolve;
    });
    const originalMkdir = projectWatcherFs.mkdir.bind(projectWatcherFs);
    vi.spyOn(projectWatcherFs, "mkdir").mockImplementation(async (path, options) => {
      enteredMkdir();
      await holdMkdir;
      return originalMkdir(path, options);
    });

    try {
      const started = startWatching(root);
      await atMkdir;
      await stopWatching();
      releaseMkdir();
      await expect(started).resolves.toMatchObject({ ready: expect.any(Promise) });
      expect(testState.watch).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not leak a watcher when startWatching is called concurrently", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-watcher-concurrent-"));
    const created: Array<ReturnType<typeof fakeWatcher>> = [];
    testState.watch.mockImplementation((path: string) => {
      const watcher = fakeWatcher();
      watcher.getWatched.mockReturnValue({ [path]: [] });
      created.push(watcher);
      return watcher;
    });

    try {
      await Promise.all([startWatching(root), startWatching(root)]);
      const live = created.filter((watcher) => watcher.close.mock.calls.length === 0);
      expect(live).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
