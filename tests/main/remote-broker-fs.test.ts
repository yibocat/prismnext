import { describe, expect, it } from "vitest";
import { disconnectedHostFsProbe, encodeRemoteScan, firstRemoteAbs, hostFsNeedsProjectBind, toHostFsParams } from "../../src/main/remote/fs-bridge";

describe("desktop fs bridge", () => {
  it("keeps IPC method names and strips the remote:// prefix for Host", () => {
    const encoded = "remote://lab/home/ubuntu/paper/main.tex";
    expect(firstRemoteAbs("/Users/me/local", encoded)).toEqual({
      profileId: "lab",
      abs: "/home/ubuntu/paper/main.tex",
    });
    expect(toHostFsParams({ absPath: encoded, rootPath: "remote://lab/home/ubuntu/paper" })).toEqual({
      absPath: "/home/ubuntu/paper/main.tex",
      rootPath: "/home/ubuntu/paper",
    });
    expect(toHostFsParams({
      projectRoot: "remote://lab/home/ubuntu/paper",
      cwd: "remote://lab/home/ubuntu/.prismnext/projects/p_ab/worktrees/calm-owl/checkout",
    })).toEqual({
      projectRoot: "/home/ubuntu/paper",
      cwd: "/home/ubuntu/.prismnext/projects/p_ab/worktrees/calm-owl/checkout",
    });
    expect(disconnectedHostFsProbe("fs:exists")).toBe(false);
    expect(disconnectedHostFsProbe("fs:isFile")).toBe(false);
    expect(disconnectedHostFsProbe("fs:scan")).toEqual({ files: [], folders: [] });
    expect(disconnectedHostFsProbe("fs:scanMetadata")).toEqual({ files: [], folders: [] });
    expect(disconnectedHostFsProbe("fs:read")).toBeNull();
    expect(hostFsNeedsProjectBind("fs:scanMetadata")).toBe(true);
    expect(hostFsNeedsProjectBind("fs:listDir")).toBe(false);
    expect(
      encodeRemoteScan("lab", {
        folders: ["src"],
        files: [{ absolutePath: "/home/ubuntu/paper/main.tex", relativePath: "main.tex" }],
      }).files[0]?.absolutePath,
    ).toBe("remote://lab/home/ubuntu/paper/main.tex");
  });
});
