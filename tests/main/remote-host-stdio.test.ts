import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { parseRemoteFrame, stringifyRemoteFrame, type HostHandshake } from "../../src/shared/remote";
import { serveStdio } from "../../src/host/serve-stdio";

const handshake: HostHandshake = {
  protocolRev: 1,
  desktopVersion: "0.9.0",
  payloadSha256: "abc123def456",
  appHome: "/tmp/.prismnext",
  hostRoot: "/tmp/.prismnext-host",
  features: ["control"],
};

describe("prismnext-host serve --stdio", () => {
  it("answers host.handshake on stdin/stdout", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const chunks: string[] = [];
    stdout.on("data", (c) => chunks.push(String(c)));
    const serving = serveStdio({ stdin, stdout, handshake });
    stdin.write(
      `${stringifyRemoteFrame({ kind: "req", id: "h1", method: "host.handshake", params: {} })}\n`,
    );
    stdin.end();
    await serving;
    const lines = chunks.join("").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const frame = parseRemoteFrame(lines[0]!);
    expect(frame).toEqual({
      kind: "res",
      id: "h1",
      ok: true,
      result: { ...handshake, features: ["control", "fs", "terminal", "agent", "literature", "experiment", "compile"] },
    });
  });

  it("answers host.doctor with a constitution report", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const serving = serveStdio({ stdin, stdout, handshake });
    const reply = new Promise<string>((resolve) => {
      stdout.once("data", (chunk) => resolve(String(chunk)));
    });
    stdin.write(
      `${stringifyRemoteFrame({ kind: "req", id: "d1", method: "host.doctor", params: {} })}\n`,
    );
    const frame = parseRemoteFrame((await reply).split("\n").find(Boolean)!);
    stdin.end();
    await serving;
    expect(frame.kind).toBe("res");
    if (frame.kind !== "res" || !frame.ok) throw new Error("expected doctor res");
    const report = frame.result as { ok: boolean; node: string; home: string; git: boolean };
    expect(report.ok).toBe(true);
    expect(report.node).toMatch(/^v/);
    expect(report.home).toContain(".prismnext");
    expect(typeof report.git).toBe("boolean");
  });
});

