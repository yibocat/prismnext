import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getVersion: () => "0.5.14",
    isPackaged: false,
    getPath: () => "/tmp",
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock("electron-store", () => ({
  default: class {
    get() {
      return undefined;
    }
    set() {}
    store = {};
  },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
  },
}));

import { compareVersions } from "../../src/main/services/update-checker";

describe("compareVersions", () => {
  it("orders semver", () => {
    expect(compareVersions("0.5.15", "0.5.14")).toBe(1);
    expect(compareVersions("0.5.14", "0.5.14")).toBe(0);
    expect(compareVersions("0.5.13", "0.5.14")).toBe(-1);
  });

  it("strips leading v and pads short versions", () => {
    expect(compareVersions("v1.2.0", "1.2")).toBe(0);
    expect(compareVersions("1.2.1", "1.2")).toBe(1);
  });
});
