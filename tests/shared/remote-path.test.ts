import { describe, expect, it } from "vitest";
import {
  encodeRemoteAbs,
  isRemoteDirListing,
  isRemoteProjectRoot,
  joinPosixSegment,
  parseRemoteAbs,
  posixContained,
  recoverRemoteAbs,
  remoteHomeFromAppHome,
  rewriteHostEventPaths,
} from "../../src/shared/remote";

describe("remote path encoding", () => {
  it("encodes a POSIX root so a laptop will not treat it as a local folder", () => {
    expect(encodeRemoteAbs("lab", "/home/ubuntu/paper")).toBe("remote://lab/home/ubuntu/paper");
    expect(parseRemoteAbs("remote://lab/home/ubuntu/paper/main.tex")).toEqual({
      profileId: "lab",
      abs: "/home/ubuntu/paper/main.tex",
    });
    expect(isRemoteProjectRoot("remote://lab/home/ubuntu/paper")).toBe(true);
    expect(isRemoteProjectRoot("/Users/me/paper")).toBe(false);
  });

  it("recovers a remote:// URI after path.resolve collapses the scheme", () => {
    expect(parseRemoteAbs("remote:/lab/home/ubuntu/paper")).toEqual({
      profileId: "lab",
      abs: "/home/ubuntu/paper",
    });
    expect(parseRemoteAbs("/Users/me/code/remote:/lab/home/ubuntu/paper")).toEqual({
      profileId: "lab",
      abs: "/home/ubuntu/paper",
    });
    expect(recoverRemoteAbs("/Users/me/code/remote:/lab/home/ubuntu/paper")).toBe(
      "remote://lab/home/ubuntu/paper",
    );
    expect(isRemoteProjectRoot("/Users/me/code/remote:/lab/home/ubuntu/paper")).toBe(true);
  });

  it("rejects path escape and keeps aliases with dots", () => {
    expect(posixContained("/home/ubuntu/paper", "/home/ubuntu/paper/../etc/passwd")).toBeNull();
    expect(posixContained("/home/ubuntu/paper", "/home/ubuntu/paper/src/a.tex")).toBe(
      "/home/ubuntu/paper/src/a.tex",
    );
    expect(parseRemoteAbs("remote://lab")).toBeNull();
    expect(encodeRemoteAbs("gpu-a.example.com", "/data/run")).toBe(
      "remote://gpu-a.example.com/data/run",
    );
  });

  it("derives $HOME from handshake appHome", () => {
    expect(remoteHomeFromAppHome("/home/ubuntu/.prismnext")).toBe("/home/ubuntu");
  });

  it("joins a single path segment and rejects slashes", () => {
    expect(joinPosixSegment("/home/ubuntu", "paper")).toBe("/home/ubuntu/paper");
    expect(joinPosixSegment("/", "opt")).toBe("/opt");
    expect(joinPosixSegment("/home/ubuntu", "a/b")).toBeNull();
    expect(joinPosixSegment("/home/ubuntu", "..")).toBeNull();
  });

  it("accepts a directory listing payload", () => {
    expect(isRemoteDirListing({
      path: "/home/ubuntu",
      parent: "/home",
      entries: [{ name: "paper", kind: "dir" }],
    })).toBe(true);
    expect(isRemoteDirListing({ path: "/home/ubuntu", parent: "/home", entries: [{ name: "x" }] })).toBe(false);
  });

  it("rewrites Host extract event POSIX roots back to remote://", () => {
    expect(rewriteHostEventPaths(
      { projectRoot: "/home/ubuntu/paper", paperId: "p1" },
      "lab",
    )).toEqual({
      projectRoot: "remote://lab/home/ubuntu/paper",
      paperId: "p1",
    });
    expect(rewriteHostEventPaths(
      { projectRoot: "remote://lab/home/ubuntu/paper" },
      "lab",
    )).toEqual({ projectRoot: "remote://lab/home/ubuntu/paper" });
    expect(rewriteHostEventPaths("ok", "lab")).toBe("ok");
  });
});
