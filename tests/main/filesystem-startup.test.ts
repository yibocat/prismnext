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

import { startWatching, stopWatching } from "../../src/main/services/filesystem";

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
  });

  it("does not create any watcher when Agent-root initialization fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-watcher-startup-failure-"));
    testState.watch.mockImplementation(() => fakeWatcher());
    writeFileSync(join(root, ".prismnext"), "not a directory\n");

    try {
      await expect(startWatching(root)).rejects.toThrow();
      expect(testState.watch).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
