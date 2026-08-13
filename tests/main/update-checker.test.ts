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

import {
  compareVersions,
  isUsableUpdateSourceOverride,
  normalizeVersionManifest,
  toLegacyResult,
  type UpdaterStatus,
} from "../../src/main/services/update-checker";

describe("normalizeVersionManifest", () => {
  it("accepts classic {version, path}", () => {
    expect(
      normalizeVersionManifest({
        version: "0.5.15",
        path: "https://cdn.example/app.dmg",
      }),
    ).toEqual({
      version: "0.5.15",
      path: "https://cdn.example/app.dmg",
      releaseNotes: undefined,
      pubDate: undefined,
    });
  });

  it("maps macUrl/winUrl/linuxUrl to path by platform when path is missing", () => {
    const r2 = {
      version: "0.5.15",
      macUrl: "https://cdn.example/app.dmg",
      winUrl: "https://cdn.example/app.exe",
      linuxUrl: "https://cdn.example/app.AppImage",
    };
    expect(normalizeVersionManifest(r2, "darwin")?.path).toBe(
      "https://cdn.example/app.dmg",
    );
    expect(normalizeVersionManifest(r2, "win32")?.path).toBe(
      "https://cdn.example/app.exe",
    );
    expect(normalizeVersionManifest(r2, "linux")?.path).toBe(
      "https://cdn.example/app.AppImage",
    );
  });

  it("prefers explicit path over macUrl/winUrl", () => {
    expect(
      normalizeVersionManifest(
        {
          version: "0.5.15",
          path: "https://cdn.example/explicit.zip",
          macUrl: "https://cdn.example/app.dmg",
          winUrl: "https://cdn.example/app.exe",
        },
        "darwin",
      )?.path,
    ).toBe("https://cdn.example/explicit.zip");
  });

  it("returns null when platform URL is missing", () => {
    expect(
      normalizeVersionManifest({ version: "0.5.15", winUrl: "https://x/a.exe" }, "darwin"),
    ).toBeNull();
    expect(normalizeVersionManifest({ version: "0.5.15" }, "darwin")).toBeNull();
    expect(normalizeVersionManifest(null)).toBeNull();
  });
});

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

  it("orders prerelease versions before their stable release", () => {
    expect(compareVersions("0.7.0-beta.2", "0.7.0-beta.1")).toBe(1);
    expect(compareVersions("0.7.0-beta.1", "0.7.0-beta.2")).toBe(-1);
    expect(compareVersions("0.7.0", "0.7.0-beta.9")).toBe(1);
    expect(compareVersions("0.7.0-beta.1", "0.7.0")).toBe(-1);
  });
});

describe("toLegacyResult", () => {
  const base = { currentVersion: "0.5.14" };

  it("maps available / up-to-date for welcome badge compat", () => {
    expect(
      toLegacyResult({ ...base, status: "up-to-date" }),
    ).toEqual({ status: "up-to-date", currentVersion: "0.5.14" });

    const latest = {
      version: "0.5.15",
      path: "https://example.com/app.dmg",
    };
    expect(
      toLegacyResult({
        ...base,
        status: "available",
        latestVersion: "0.5.15",
        latest,
      }),
    ).toEqual({
      status: "available",
      currentVersion: "0.5.14",
      latest,
    });
  });

  it("returns null for download lifecycle so About uses UpdaterStatus", () => {
    const downloading: UpdaterStatus = {
      ...base,
      status: "downloading",
      progress: { percent: 42 },
    };
    const downloaded: UpdaterStatus = {
      ...base,
      status: "downloaded",
      progress: { percent: 100 },
    };
    expect(toLegacyResult(downloading)).toBeNull();
    expect(toLegacyResult(downloaded)).toBeNull();
    expect(toLegacyResult({ ...base, status: "checking" })).toBeNull();
  });
});

describe("isUsableUpdateSourceOverride", () => {
  it("rejects obsolete update-channel fixture paths", () => {
    expect(
      isUsableUpdateSourceOverride("/Users/me/prism-next/update-channel/version.json"),
    ).toBe(false);
    expect(isUsableUpdateSourceOverride("update-channel/version.json")).toBe(false);
  });

  it("accepts https feeds", () => {
    expect(isUsableUpdateSourceOverride("https://pub.example.r2.dev")).toBe(true);
  });

  it("rejects local paths when packaged", () => {
    expect(
      isUsableUpdateSourceOverride("/tmp/version.json", {
        packaged: true,
        existsSync: () => true,
      }),
    ).toBe(false);
  });

  it("accepts existing local paths only when unpackaged", () => {
    expect(
      isUsableUpdateSourceOverride("/tmp/version.json", {
        packaged: false,
        existsSync: () => true,
      }),
    ).toBe(true);
    expect(
      isUsableUpdateSourceOverride("/tmp/missing.json", {
        packaged: false,
        existsSync: () => false,
      }),
    ).toBe(false);
  });
});
