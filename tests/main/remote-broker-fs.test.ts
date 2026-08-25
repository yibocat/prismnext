import { describe, expect, it } from "vitest";
import { encodeRemoteScan, firstRemoteAbs, toHostFsParams } from "../../src/main/remote/fs-bridge";

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
    expect(
      encodeRemoteScan("lab", {
        folders: ["src"],
        files: [{ absolutePath: "/home/ubuntu/paper/main.tex", relativePath: "main.tex" }],
      }).files[0]?.absolutePath,
    ).toBe("remote://lab/home/ubuntu/paper/main.tex");
  });
});
