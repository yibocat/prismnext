import { describe, expect, it } from "vitest";
import {
  hostPayloadBinDir,
  hostPayloadGitBinDir,
  hostPayloadGitExecDir,
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
  });
});
