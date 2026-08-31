import { describe, expect, it } from "vitest";
import { MAX_REMOTE_FRAME_BYTES } from "../../src/shared/remote";
import { NdjsonFrameCodec, RemoteFrameTooLargeError } from "../../src/main/remote/frame-codec";

describe("NdjsonFrameCodec", () => {
  it("decodes a truncated line only after the newline arrives", () => {
    const codec = new NdjsonFrameCodec();
    expect(codec.push('{"kind":"req","id":"1","method":"host.handshake"')).toEqual([]);
    expect(codec.pendingBytes()).toBeGreaterThan(0);
    const frames = codec.push(',"params":{}}\n');
    expect(frames).toEqual([{ kind: "req", id: "1", method: "host.handshake", params: {} }]);
  });

  it("splits sticky packets (two frames in one chunk)", () => {
    const codec = new NdjsonFrameCodec();
    const a = codec.encode({ kind: "req", id: "a", method: "host.doctor", params: {} });
    const b = codec.encode({ kind: "event", channel: "remote:log", payload: { message: "ok" } });
    expect(codec.push(a + b)).toEqual([
      { kind: "req", id: "a", method: "host.doctor", params: {} },
      { kind: "event", channel: "remote:log", payload: { message: "ok" } },
    ]);
  });

  it("rejects an oversized frame without a newline", () => {
    const codec = new NdjsonFrameCodec();
    const huge = "x".repeat(MAX_REMOTE_FRAME_BYTES + 8);
    expect(() => codec.push(huge)).toThrow(RemoteFrameTooLargeError);
  });
});
