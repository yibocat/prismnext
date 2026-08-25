import { describe, expect, it } from "vitest";
import {
  MAX_REMOTE_FRAME_BYTES,
  REMOTE_PROTOCOL_REV,
  isHostHandshake,
  parseRemoteFrame,
  stringifyRemoteFrame,
  type RemoteFrame,
} from "../../src/shared/remote";

describe("RemoteFrame", () => {
  it("round-trips req / res / event", () => {
    const frames: RemoteFrame[] = [
      { kind: "req", id: "1", method: "host.handshake", params: {} },
      { kind: "res", id: "1", ok: true, result: { protocolRev: 1 } },
      { kind: "res", id: "2", ok: false, error: { code: "not_connected", message: "down" } },
      { kind: "event", channel: "remote:log", payload: { message: "push" } },
    ];
    for (const frame of frames) {
      expect(parseRemoteFrame(stringifyRemoteFrame(frame))).toEqual(frame);
    }
  });

  it("rejects an unknown kind", () => {
    expect(() => parseRemoteFrame(JSON.stringify({ kind: "blob", id: "1" }))).toThrow(
      /unknown remote frame kind/,
    );
  });

  it("rejects empty and non-JSON lines", () => {
    expect(() => parseRemoteFrame("   ")).toThrow(/empty/);
    expect(() => parseRemoteFrame("{not-json")).toThrow(/not JSON/);
  });
});

describe("HostHandshake", () => {
  it("requires protocolRev 1 and a payload sha, not a host product version", () => {
    const handshake = {
      protocolRev: REMOTE_PROTOCOL_REV,
      desktopVersion: "0.8.0",
      payloadSha256: "abc123",
      appHome: "/home/lab/.prismnext",
      hostRoot: "/home/lab/.prismnext-host",
      features: ["control"],
    };
    expect(isHostHandshake(handshake)).toBe(true);
    expect(isHostHandshake({ ...handshake, protocolRev: 2 })).toBe(false);
    expect(isHostHandshake({ ...handshake, payloadSha256: "" })).toBe(false);
    expect("hostVersion" in handshake).toBe(false);
  });
});

describe("frame size", () => {
  it("documents the 8 MiB cap", () => {
    expect(MAX_REMOTE_FRAME_BYTES).toBe(8 * 1024 * 1024);
  });
});
