import { describe, expect, it } from "vitest";
import {
  isLocalProjectHandle,
  isRemoteProjectHandle,
  parseProjectHandle,
} from "../../src/shared/remote";

const local = {
  kind: "local" as const,
  projectId: "p_local",
  projectRoot: "/Users/me/paper",
};

const remote = {
  kind: "remote" as const,
  projectId: "p_lab",
  profileId: "ssh_1",
  remoteRoot: "/home/lab/paper",
  connectionId: "conn_1",
};

describe("ProjectHandle", () => {
  it("accepts a local handle", () => {
    expect(parseProjectHandle(local)).toEqual(local);
    expect(isLocalProjectHandle(local)).toBe(true);
    expect(isRemoteProjectHandle(local)).toBe(false);
  });

  it("accepts a remote handle", () => {
    expect(parseProjectHandle(remote)).toEqual(remote);
    expect(isRemoteProjectHandle(remote)).toBe(true);
    expect(isLocalProjectHandle(remote)).toBe(false);
  });

  it("rejects an illegal kind", () => {
    const sshfs = { kind: "sshfs", projectId: "p", projectRoot: "/mnt" };
    expect(parseProjectHandle(sshfs)).toBeNull();
    expect(isLocalProjectHandle(sshfs)).toBe(false);
    expect(isRemoteProjectHandle(sshfs)).toBe(false);
  });

  it("rejects incomplete remote handles", () => {
    expect(parseProjectHandle({ kind: "remote", projectId: "p" })).toBeNull();
    expect(parseProjectHandle({ kind: "local", projectId: "" , projectRoot: "/x" })).toBeNull();
  });
});
