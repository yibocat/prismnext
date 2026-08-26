import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create as tarCreate } from "tar";
import { describe, expect, it } from "vitest";
import { type SshProfile } from "../../src/shared/remote";
import { sha256File } from "../../src/main/remote/payload-path";
import { RemoteSessionBroker } from "../../src/main/remote/session-broker";
import { createAuthFailSshClient, createDirectoryBackedSshClient } from "../../src/main/remote/ssh-client";

const profile: SshProfile = {
  id: "ssh_lab",
  name: "Lab",
  host: "lab.example.com",
  port: 22,
  user: "alice",
  strictHostKey: true,
};

const FAKE_HOST = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
let stamp = { desktopVersion: "0.9.0", payloadSha256: "unset" };
try {
  stamp = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "stamp.json"), "utf8"));
} catch {}
const handshake = {
  protocolRev: 1,
  desktopVersion: stamp.desktopVersion,
  payloadSha256: stamp.payloadSha256,
  appHome: (process.env.HOME || "") + "/.prismnext",
  hostRoot: (process.env.HOME || "") + "/.prismnext-host",
  features: ["control"],
};
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  for (;;) {
    const i = buf.indexOf("\\n");
    if (i < 0) break;
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.kind === "req" && msg.method === "host.handshake") {
      process.stdout.write(JSON.stringify({ kind: "res", id: msg.id, ok: true, result: handshake }) + "\\n");
    }
    if (msg.kind === "req" && msg.method === "host.doctor") {
      const doctor = { ok: true, node: process.version, home: handshake.appHome, homeWritable: true, git: true };
      process.stdout.write(JSON.stringify({ kind: "res", id: msg.id, ok: true, result: doctor }) + "\\n");
    }
  }
});
`;

async function hostTarball(dir: string): Promise<{ path: string; sha256: string }> {
  mkdirSync(join(dir, "current", "bin"), { recursive: true });
  writeFileSync(join(dir, "current", "bin", "prismnext-host"), FAKE_HOST, { mode: 0o755 });
  writeFileSync(
    join(dir, "current", "bin", "node"),
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "$@"\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(dir, "current", "stamp.json"),
    `${JSON.stringify({ desktopVersion: "0.9.0", payloadSha256: "pending" }, null, 2)}\n`,
  );
  const tarballPath = join(dir, "payload.tar.gz");
  await tarCreate({ gzip: true, file: tarballPath, cwd: dir }, ["current"]);
  const sha256 = sha256File(tarballPath);
  writeFileSync(
    join(dir, "current", "stamp.json"),
    `${JSON.stringify({ desktopVersion: "0.9.0", payloadSha256: sha256 }, null, 2)}\n`,
  );
  return { path: tarballPath, sha256 };
}

describe("RemoteSessionBroker", () => {
  it("is not bound before connect", () => {
    const broker = new RemoteSessionBroker({ desktopVersion: "0.9.0" });
    expect(broker.isBound("ssh_lab")).toBe(false);
  });

  it("connects without a Pro license", async () => {
    const broker = new RemoteSessionBroker({
      desktopVersion: "0.9.0",
      getProfile: () => profile,
      resolvePayload: () => ({ error: "payload_missing_local" }),
    });
    const result = await broker.connect("ssh_lab");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("payload_missing_local");
    expect(result.constitution?.gates.some((item) => item.gate === "entitlement")).toBe(false);
  });

  it("returns payload_missing_local without downloading", async () => {
    const broker = new RemoteSessionBroker({
      desktopVersion: "0.9.0",
      getProfile: () => profile,
      resolvePayload: () => ({ error: "payload_missing_local" }),
    });
    const result = await broker.connect("ssh_lab");
    expect(result.code).toBe("payload_missing_local");
  });

  it("maps SSH auth failure", async () => {
    const broker = new RemoteSessionBroker({
      desktopVersion: "0.9.0",
      getProfile: () => ({ ...profile, strictHostKey: false }),
      ssh: createAuthFailSshClient(),
      resolvePayload: () => ({ path: "/tmp/missing.tar.gz", sha256: "x", arch: "linux-x64" }),
    });
    const result = await broker.connect("ssh_lab");
    expect(result.code).toBe("ssh_auth");
  });

  it("handshakes through a local fake SSH + host stdio", async () => {
    const staging = mkdtempSync(join(tmpdir(), "prism-broker-stage-"));
    const remoteHome = mkdtempSync(join(tmpdir(), "prism-broker-home-"));
    const knownHostsPath = join(mkdtempSync(join(tmpdir(), "prism-broker-kh-")), "known_hosts");
    const tarball = await hostTarball(staging);
    const broker = new RemoteSessionBroker({
      desktopVersion: "0.9.0",
      getProfile: () => ({ ...profile, strictHostKey: false }),
      ssh: createDirectoryBackedSshClient(remoteHome),
      resolvePayload: () => ({ ...tarball, arch: "linux-arm64" }),
      knownHostsPath,
    });
    const result = await broker.connect("ssh_lab");
    expect(result.ok).toBe(true);
    expect(result.handshake?.payloadSha256).toBe(tarball.sha256);
    expect(result.handshake?.features).toContain("control");
    expect(result.constitution?.gates.map((item) => item.gate)).toEqual([
      "payload",
      "ssh",
      "host_key",
      "home",
      "bootstrap",
      "runtime",
      "host_serve",
      "handshake",
      "doctor",
    ]);
    expect(result.constitution?.gates.every((item) => item.ok)).toBe(true);
    expect(result.constitution?.doctor?.ok).toBe(true);
    expect(result.constitution?.gates.find((item) => item.gate === "runtime")?.detail).toMatch(/dedicated/);
    expect(broker.snapshot().logs.some((line) => /PATH has no `node`/.test(line.message))).toBe(false);
    expect(broker.snapshot().logs.some((line) => line.gate === "handshake" && line.level === "ok")).toBe(true);
    await broker.disconnect("ssh_lab");
  });
});
