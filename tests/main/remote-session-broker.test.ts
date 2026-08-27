import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create as tarCreate } from "tar";
import { afterEach, describe, expect, it } from "vitest";
import { startHostListenServer } from "../../src/host/serve-listen";
import { PAYLOAD_MISSING_LOCAL_MESSAGE, type HostHandshake, type SshProfile } from "../../src/shared/remote";
import { tcpPipe } from "../../src/main/remote/host-listen";
import { sha256File } from "../../src/main/remote/payload-path";
import { RemoteSessionBroker } from "../../src/main/remote/session-broker";
import {
  createAuthFailSshClient,
  createDirectoryBackedSshClient,
  type SshClient,
} from "../../src/main/remote/ssh-client";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";
import { __resetHostLicenseSessionForTests } from "../../src/main/teams/teams-license";

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
  features: ["control", "literature", "experiment", "agent"],
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
    if (msg.kind === "req" && msg.method === "host.configure") {
      const keys = msg.params && msg.params.aiApiKeys && typeof msg.params.aiApiKeys === "object"
        ? Object.keys(msg.params.aiApiKeys)
        : [];
      process.stdout.write(JSON.stringify({
        kind: "res",
        id: msg.id,
        ok: true,
        result: { ok: true, modelKeys: "remote", providerIds: keys, wrapOk: true, persisted: keys.length > 0 },
      }) + "\\n");
    }
    if (msg.kind === "req" && msg.method === "host.doctor") {
      const doctor = { ok: true, node: process.version, home: handshake.appHome, homeWritable: true, git: true };
      process.stdout.write(JSON.stringify({ kind: "res", id: msg.id, ok: true, result: doctor }) + "\\n");
    }
    if (msg.kind === "req" && msg.method === "project.open") {
      const remoteRoot = msg.params && msg.params.remoteRoot ? msg.params.remoteRoot : "/home/alice/paper";
      const projectId = /\\/b$/.test(remoteRoot) ? "p_B" : /\\/a$/.test(remoteRoot) ? "p_A" : "p_test";
      process.stdout.write(JSON.stringify({
        kind: "res",
        id: msg.id,
        ok: true,
        result: { projectId, remoteRoot },
      }) + "\\n");
    }
    if (msg.kind === "req" && msg.method === "pro:beginSync") {
      process.stdout.write(JSON.stringify({
        kind: "res",
        id: msg.id,
        ok: true,
        result: { action: "skipped", sha256: msg.params && msg.params.sha256 },
      }) + "\\n");
    }
    if (msg.kind === "req" && (msg.method === "pro:writeFile" || msg.method === "pro:commitSync")) {
      process.stdout.write(JSON.stringify({ kind: "res", id: msg.id, ok: true, result: { ok: true, action: "committed" } }) + "\\n");
    }
    if (msg.kind === "req" && msg.method === "host.reattach") {
      process.stdout.write(JSON.stringify({
        kind: "res",
        id: msg.id,
        ok: true,
        result: { ok: true, remoteRoot: null, projectId: null },
      }) + "\\n");
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
    expect(result.message).toBe(PAYLOAD_MISSING_LOCAL_MESSAGE);
    expect(result.message).not.toMatch(/GitHub|host:pack|Pack it/i);
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
    expect(result.message).toBe(PAYLOAD_MISSING_LOCAL_MESSAGE);
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
      readModelSeed: () => ({
        aiApiKeys: { deepseek: "sk-test" },
        aiBaseUrls: {},
        extraBaseUrls: [],
        wrapKey: "",
        providerIds: ["deepseek"],
        wrapOk: true,
      }),
      readProGrant: () => ({
        plan: "pro",
        activatedAt: "2026-08-26T00:00:00.000Z",
        expiresAt: null,
      }),
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
      "model",
      "doctor",
    ]);
    expect(result.constitution?.gates.every((item) => item.ok)).toBe(true);
    expect(result.constitution?.doctor?.ok).toBe(true);
    expect(result.constitution?.gates.find((item) => item.gate === "runtime")?.detail).toMatch(/dedicated/);
    expect(result.constitution?.gates.find((item) => item.gate === "model")?.detail).toMatch(/deepseek/);
    expect(result.constitution?.gates.find((item) => item.gate === "host_serve")?.detail).toMatch(/stdio/);
    expect(broker.snapshot().logs.some((line) => /PATH has no `node`/.test(line.message))).toBe(false);
    expect(broker.snapshot().logs.some((line) => /ProxyJump/.test(line.message))).toBe(true);
    expect(broker.snapshot().logs.some((line) => line.gate === "handshake" && line.level === "ok")).toBe(true);
    expect(broker.boundRemoteRoot("ssh_lab")).toBeNull();
    const opened = await broker.ensureProjectOpen("ssh_lab", "/home/alice/paper");
    expect(opened?.projectId).toBe("p_test");
    expect(broker.boundRemoteRoot("ssh_lab")).toBe("/home/alice/paper");
    const again = await broker.ensureProjectOpen("ssh_lab", "/home/alice/paper");
    expect(again?.projectId).toBe("p_test");
    await broker.disconnect("ssh_lab");
  });

  it("rebinds project.open on same profile without disconnecting SSH", async () => {
    const staging = mkdtempSync(join(tmpdir(), "prism-broker-rebind-"));
    const remoteHome = mkdtempSync(join(tmpdir(), "prism-broker-rebind-home-"));
    const knownHostsPath = join(mkdtempSync(join(tmpdir(), "prism-broker-rebind-kh-")), "known_hosts");
    const tarball = await hostTarball(staging);
    const broker = new RemoteSessionBroker({
      desktopVersion: "0.9.0",
      getProfile: () => ({ ...profile, strictHostKey: false }),
      ssh: createDirectoryBackedSshClient(remoteHome),
      resolvePayload: () => ({ ...tarball, arch: "linux-arm64" }),
      knownHostsPath,
      readModelSeed: () => ({
        aiApiKeys: { deepseek: "sk-test" },
        aiBaseUrls: {},
        extraBaseUrls: [],
        wrapKey: "",
        providerIds: ["deepseek"],
        wrapOk: true,
      }),
    });
    const result = await broker.connect("ssh_lab");
    expect(result.ok).toBe(true);
    await broker.openProject("ssh_lab", "/home/u/a");
    expect(broker.isBound("ssh_lab")).toBe(true);
    expect(broker.profileIdForProjectId("p_A")).toBe("ssh_lab");
    await broker.openProject("ssh_lab", "/home/u/b");
    expect(broker.isBound("ssh_lab")).toBe(true);
    expect(broker.profileIdForProjectId("p_B")).toBe("ssh_lab");
    expect(broker.boundRemoteRoot("ssh_lab")).toBe("/home/u/b");
    await broker.disconnect("ssh_lab");
  });
});

const LISTEN_HANDSHAKE: HostHandshake = {
  protocolRev: 1,
  desktopVersion: "0.9.0",
  payloadSha256: "listen-test",
  appHome: "/tmp/.prismnext",
  hostRoot: "/tmp/.prismnext-host",
  features: ["control"],
};

function listenSsh(remoteHome: string, listenPort: number): SshClient {
  const innerClient = createDirectoryBackedSshClient(remoteHome);
  return {
    async connect(input) {
      const inner = await innerClient.connect(input);
      return {
        exec: async (command) => {
          if (command.includes("PRISM_HOST_LISTEN_FILE")) {
            return { stdout: String(listenPort), stderr: "", code: 0 };
          }
          return inner.exec(command);
        },
        sftpPut: (localPath, remotePath) => inner.sftpPut(localPath, remotePath),
        sftpStat: (remotePath) => inner.sftpStat(remotePath),
        sftpRead: (remotePath) => inner.sftpRead(remotePath),
        sftpWrite: (remotePath, contents) => inner.sftpWrite(remotePath, contents),
        openStdio: (command) => inner.openStdio(command),
        openForwardedTcp: () => tcpPipe(listenPort),
        dispose: () => inner.dispose(),
      };
    },
  };
}

async function waitPhase(
  broker: RemoteSessionBroker,
  profileId: string,
  phase: string,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (broker.connectionStatus(profileId).phase === phase) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`timed out waiting for ${phase}, got ${broker.connectionStatus(profileId).phase}`);
}

function testSeed() {
  return {
    aiApiKeys: { deepseek: "sk-test" },
    aiBaseUrls: {},
    extraBaseUrls: [],
    wrapKey: "",
    providerIds: ["deepseek"],
    wrapOk: true,
  };
}

describe("RemoteSessionBroker listen transport", () => {
  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
    __resetHostLicenseSessionForTests();
    delete process.env.PRISM_HOST_PRO_PACKAGE_DIR;
  });

  it("reattaches after the control plane drops and can still call agent:status", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-broker-listen-home-"));
    setWorkbenchUserHomeOverride(home);
    const paper = mkdtempSync(join(tmpdir(), "prism-broker-listen-paper-"));
    const started = await startHostListenServer({ handshake: LISTEN_HANDSHAKE, bind: "127.0.0.1:0" });
    const staging = mkdtempSync(join(tmpdir(), "prism-broker-listen-stage-"));
    const remoteHome = mkdtempSync(join(tmpdir(), "prism-broker-listen-ssh-"));
    const tarball = await hostTarball(staging);
    const knownHostsPath = join(mkdtempSync(join(tmpdir(), "prism-broker-listen-kh-")), "known_hosts");
    const phases: string[] = [];
    const broker = new RemoteSessionBroker({
      desktopVersion: "0.9.0",
      getProfile: () => ({ ...profile, strictHostKey: false }),
      ssh: listenSsh(remoteHome, started.port),
      resolvePayload: () => ({ ...tarball, arch: "linux-arm64" }),
      knownHostsPath,
      readModelSeed: testSeed,
      onConnection: (_id, state) => {
        phases.push(state.phase);
      },
    });
    try {
      const result = await broker.connect("ssh_lab");
      expect(result.ok).toBe(true);
      expect(result.constitution?.gates.find((item) => item.gate === "host_serve")?.detail).toMatch(/listen/);
      const opened = await broker.ensureProjectOpen("ssh_lab", paper);
      expect(opened?.remoteRoot).toBe(paper);
      const before = await broker.invoke("ssh_lab", "agent:status", { projectRoot: paper });
      expect(before).toBeTruthy();
      await broker.dropControlPlane("ssh_lab");
      const start = Date.now();
      while (Date.now() - start < 10_000) {
        if (phases.includes("reconnecting") && broker.connectionStatus("ssh_lab").phase === "ready") break;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      expect(phases).toContain("reconnecting");
      expect(broker.connectionStatus("ssh_lab").phase).toBe("ready");
      const after = await broker.invoke("ssh_lab", "agent:status", { projectRoot: paper });
      expect(after).toBeTruthy();
      expect(broker.boundRemoteRoot("ssh_lab")).toBe(paper);
    } finally {
      await broker.disconnect("ssh_lab");
      await started.close();
    }
  }, 45_000);

  it("marks the first laptop displaced when a second broker takes the listen socket", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-broker-disp-home-"));
    setWorkbenchUserHomeOverride(home);
    const started = await startHostListenServer({ handshake: LISTEN_HANDSHAKE, bind: "127.0.0.1:0" });
    const tarballA = await hostTarball(mkdtempSync(join(tmpdir(), "prism-broker-disp-a-")));
    const tarballB = await hostTarball(mkdtempSync(join(tmpdir(), "prism-broker-disp-b-")));
    const first = new RemoteSessionBroker({
      desktopVersion: "0.9.0",
      getProfile: () => ({ ...profile, strictHostKey: false }),
      ssh: listenSsh(mkdtempSync(join(tmpdir(), "prism-broker-disp-ssh-a-")), started.port),
      resolvePayload: () => ({ ...tarballA, arch: "linux-arm64" }),
      knownHostsPath: join(mkdtempSync(join(tmpdir(), "prism-broker-disp-kh-a-")), "known_hosts"),
      readModelSeed: testSeed,
    });
    const second = new RemoteSessionBroker({
      desktopVersion: "0.9.0",
      getProfile: () => ({ ...profile, id: "ssh_lab", strictHostKey: false }),
      ssh: listenSsh(mkdtempSync(join(tmpdir(), "prism-broker-disp-ssh-b-")), started.port),
      resolvePayload: () => ({ ...tarballB, arch: "linux-arm64" }),
      knownHostsPath: join(mkdtempSync(join(tmpdir(), "prism-broker-disp-kh-b-")), "known_hosts"),
      readModelSeed: testSeed,
    });
    try {
      const a = await first.connect("ssh_lab");
      expect(a.ok).toBe(true);
      const b = await second.connect("ssh_lab");
      expect(b.ok).toBe(true);
      await waitPhase(first, "ssh_lab", "error");
      const state = first.connectionStatus("ssh_lab");
      expect(state.phase).toBe("error");
      if (state.phase === "error") expect(state.code).toBe("displaced");
      expect(second.connectionStatus("ssh_lab").phase).toBe("ready");
    } finally {
      await first.disconnect("ssh_lab");
      await second.disconnect("ssh_lab");
      await started.close();
    }
  }, 45_000);
});
