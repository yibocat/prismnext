import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appPath = { current: "" };

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return true;
    },
    getAppPath: () => appPath.current,
  },
}));

describe("getToolsSourceDir", () => {
  let root = "";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-tools-src-"));
    appPath.current = root;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.resetModules();
  });

  it("prefers src/main/tools when present (packaged asar layout)", async () => {
    const srcTools = join(root, "src", "main", "tools");
    mkdirSync(srcTools, { recursive: true });
    writeFileSync(join(srcTools, "bridge-paths.ts"), "export {}\n");

    const { getToolsSourceDir, readBridgePathsSource } = await import(
      "../../src/main/tools/index"
    );
    expect(getToolsSourceDir()).toBe(srcTools);
    expect(readBridgePathsSource()).toContain("export");
  });

  it("falls back to main/tools if that is the only layout", async () => {
    const legacy = join(root, "main", "tools");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "bridge-paths.ts"), "export const legacy = 1\n");

    const { getToolsSourceDir, readBridgePathsSource } = await import(
      "../../src/main/tools/index"
    );
    expect(getToolsSourceDir()).toBe(legacy);
    expect(readBridgePathsSource()).toContain("legacy");
  });
});
