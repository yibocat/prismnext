import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMOTE_SYNC_MODE,
  isRemoteSyncMode,
  remoteWinsSessionConflict,
  shouldExcludeRemoteSyncPath,
} from "../../src/shared/remote/sync";

describe("remote sync contracts", () => {
  it("defaults to on-demand and rejects unknown modes", () => {
    expect(DEFAULT_REMOTE_SYNC_MODE).toBe("on-demand");
    expect(isRemoteSyncMode("on-demand")).toBe(true);
    expect(isRemoteSyncMode("live-mirror")).toBe(true);
    expect(isRemoteSyncMode("online-only")).toBe(true);
    expect(isRemoteSyncMode("rsync-all")).toBe(false);
  });

  it("excludes venv, node_modules, and git objects", () => {
    expect(shouldExcludeRemoteSyncPath("node_modules/lodash/index.js").reason).toBe("exclude");
    expect(shouldExcludeRemoteSyncPath(".venv/bin/python").reason).toBe("exclude");
    expect(shouldExcludeRemoteSyncPath("experiment/.venv/lib").reason).toBe("exclude");
    expect(shouldExcludeRemoteSyncPath(".git/objects/pack/a").reason).toBe("exclude");
    expect(shouldExcludeRemoteSyncPath("src/main.tex").exclude).toBe(false);
  });

  it("warns above the 20 MB threshold without writing", () => {
    expect(shouldExcludeRemoteSyncPath("big.pdf", 20 * 1024 * 1024 + 1)).toEqual({
      exclude: true,
      reason: "too_large",
    });
    expect(shouldExcludeRemoteSyncPath("ok.pdf", 20 * 1024 * 1024).exclude).toBe(false);
  });

  it("lets the remote session win on conflict", () => {
    expect(remoteWinsSessionConflict("2026-08-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z")).toBe(true);
    expect(remoteWinsSessionConflict("2026-08-02T00:00:00.000Z", "2026-08-01T00:00:00.000Z")).toBe(false);
    expect(remoteWinsSessionConflict("2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z")).toBe(true);
  });
});
