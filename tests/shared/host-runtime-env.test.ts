import { describe, expect, it } from "vitest";
import {
  hostHomeCurrentBinDir,
  hostPayloadBinDir,
  hostPayloadBinDirFromHostBin,
  hostPayloadGitBinDir,
  hostPayloadGitExecDir,
  listHostRuntimeBinCandidates,
} from "../../src/shared/remote/host-runtime-env";

describe("host runtime env", () => {
  it("names payload bin dirs from current/", () => {
    expect(hostPayloadBinDir("/home/me/.prismnext-host/current/")).toBe(
      "/home/me/.prismnext-host/current/bin",
    );
    expect(hostPayloadGitBinDir("/home/me/.prismnext-host/current")).toBe(
      "/home/me/.prismnext-host/current/vendor/git/bin",
    );
    expect(hostPayloadGitExecDir("/home/me/.prismnext-host/current")).toBe(
      "/home/me/.prismnext-host/current/vendor/git/libexec/git-core",
    );
    expect(hostPayloadBinDirFromHostBin("/home/me/.prismnext-host/current/bin/prismnext-host")).toBe(
      "/home/me/.prismnext-host/current/bin",
    );
    expect(hostHomeCurrentBinDir("/home/ubuntu")).toBe("/home/ubuntu/.prismnext-host/current/bin");
  });

  it("lists bin candidates so system Node still finds current/bin", () => {
    expect(listHostRuntimeBinCandidates({
      envBinDir: "",
      execPath: "/usr/bin/node",
      argv1: "/home/ubuntu/.prismnext-host/current/bin/prismnext-host",
      home: "/home/ubuntu",
    })).toEqual([
      "/usr/bin",
      "/home/ubuntu/.prismnext-host/current/bin",
    ]);
  });
});
