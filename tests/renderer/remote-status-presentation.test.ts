import { describe, expect, it } from "vitest";
import { REMOTE_CONNECT_GATES } from "../../src/shared/remote";
import {
  appStatusDotPhase,
  connectProgress,
  executionHostLabel,
  listRemoteStatusRows,
  remoteHostDisplayName,
  remoteStatusDotPhase,
  resolveSessionRemoteRoot,
} from "../../src/renderer/lib/remote/display";

const HOSTS = [
  { alias: "lab", hostname: "43.167.215.144" },
  { alias: "gpu", hostname: "10.0.0.8" },
];

describe("remote status presentation", () => {
  it("labels the execution host Local or the SSH HostName", () => {
    expect(executionHostLabel("/Users/me/paper", HOSTS, "Local")).toBe("Local");
    expect(executionHostLabel("remote://lab/home/ubuntu/paper", HOSTS, "Local")).toBe("43.167.215.144");
    expect(executionHostLabel("remote://unknown/abs", HOSTS, "Local")).toBe("unknown");
    expect(executionHostLabel(null, HOSTS, "Local")).toBe("Local");
  });

  it("prefers the SSH HostName (IP) over the alias", () => {
    expect(remoteHostDisplayName("remote://lab/home/ubuntu/paper", HOSTS)).toBe("43.167.215.144");
    expect(remoteHostDisplayName("/Users/me/paper", HOSTS)).toBeNull();
  });

  it("does not treat a disconnected remote as Agent connecting", () => {
    expect(remoteStatusDotPhase({
      remotePhase: "disconnected",
      agentReady: false,
      canEmbed: true,
      reason: "remote_not_connected",
    })).toBe("stopped");
  });

  it("shows connecting only while SSH is coming up", () => {
    expect(remoteStatusDotPhase({
      remotePhase: "connecting",
      agentReady: false,
      canEmbed: true,
      reason: "remote_not_connected",
    })).toBe("starting");
    expect(remoteStatusDotPhase({
      remotePhase: "ready",
      agentReady: true,
      canEmbed: true,
    })).toBe("ready");
    expect(remoteStatusDotPhase({
      remotePhase: "ready",
      agentReady: false,
      canEmbed: true,
    })).toBe("starting");
  });

  it("lists every live Host once, and skips a disconnected Workbench remote", () => {
    const handshake = {
      protocolRev: 1 as const,
      desktopVersion: "0.9.0",
      payloadSha256: "abc",
      appHome: "/tmp/.prismnext",
      hostRoot: "/tmp/.prismnext-host",
      features: [] as const,
    };
    const rows = listRemoteStatusRows(
      [
        "remote://lab/home/ubuntu/paper-a",
        "remote://lab/home/ubuntu/paper-b",
        "remote://gpu/data/run",
      ],
      HOSTS,
      {
        lab: { phase: "ready", profileId: "lab", connectionId: "c1", handshake },
        gpu: { phase: "ready", profileId: "gpu", connectionId: "c2", handshake },
      },
    );
    expect(rows.map((row) => [row.hostname, row.phase])).toEqual([
      ["43.167.215.144", "ready"],
      ["10.0.0.8", "ready"],
    ]);
    expect(listRemoteStatusRows(
      ["remote://lab/home/ubuntu/paper-a", "remote://offline/home/u/x"],
      HOSTS,
      { lab: { phase: "ready", profileId: "lab", connectionId: "c1", handshake } },
    ).map((row) => row.hostname)).toEqual(["43.167.215.144"]);
  });

  it("uses remote Host rows for the status dot, not a leftover Agent connecting", () => {
    expect(appStatusDotPhase([{ phase: "ready" }], null)).toBe("ready");
    expect(appStatusDotPhase([{ phase: "ready" }, { phase: "connecting" }], null)).toBe("starting");
  });

  it("counts leading ok gates and names the first unfinished gate", () => {
    const progress = connectProgress({
      gates: REMOTE_CONNECT_GATES,
      constitution: {
        doctor: null,
        gates: [
          { gate: "payload", ok: true, detail: "payload ready" },
          { gate: "ssh", ok: true, detail: "ssh up" },
        ],
      },
      phase: "connecting",
      logs: [],
    });
    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(REMOTE_CONNECT_GATES.length);
    expect(progress.percent).toBe(Math.round((2 / REMOTE_CONNECT_GATES.length) * 100));
    expect(progress.currentGate).toBe("host_key");
  });

  it("is 100% when the connection is ready even if a later gate is missing", () => {
    const progress = connectProgress({
      gates: REMOTE_CONNECT_GATES,
      constitution: { doctor: null, gates: [{ gate: "payload", ok: true, detail: "ok" }] },
      phase: "ready",
      logs: [],
    });
    expect(progress.completed).toBe(REMOTE_CONNECT_GATES.length);
    expect(progress.percent).toBe(100);
    expect(progress.currentGate).toBeNull();
  });

  it("stops at the first failed gate", () => {
    const progress = connectProgress({
      gates: REMOTE_CONNECT_GATES,
      constitution: {
        doctor: null,
        gates: [
          { gate: "payload", ok: true, detail: "ok" },
          { gate: "ssh", ok: false, detail: "auth" },
        ],
      },
      phase: "error",
      logs: [],
    });
    expect(progress.completed).toBe(1);
    expect(progress.currentGate).toBe("ssh");
    expect(progress.percent).toBeLessThan(100);
  });

  it("does not rewind progress when a later SSH info line arrives", () => {
    const progress = connectProgress({
      gates: REMOTE_CONNECT_GATES,
      phase: "bootstrapping",
      logs: [
        { ts: 1, profileId: "lab", level: "ok", gate: "payload", message: "payload" },
        { ts: 2, profileId: "lab", level: "ok", gate: "ssh", message: "ssh up" },
        { ts: 3, profileId: "lab", level: "ok", gate: "host_key", message: "key" },
        { ts: 4, profileId: "lab", level: "ok", gate: "home", message: "home" },
        { ts: 5, profileId: "lab", level: "ok", gate: "bootstrap", message: "boot" },
        { ts: 6, profileId: "lab", level: "ok", gate: "runtime", message: "node" },
        { ts: 7, profileId: "lab", level: "info", gate: "ssh", message: "OpenSSH destination" },
        { ts: 8, profileId: "lab", level: "ok", gate: "host_serve", message: "listen" },
        { ts: 9, profileId: "lab", level: "ok", gate: "handshake", message: "Handshake ok" },
      ],
    });
    expect(progress.currentGate).toBe("model");
    expect(progress.completed).toBe(REMOTE_CONNECT_GATES.indexOf("model"));
  });

  it("reads ok gates from logs when constitution is empty", () => {
    const progress = connectProgress({
      gates: REMOTE_CONNECT_GATES,
      phase: "connecting",
      logs: [
        { ts: 1, profileId: "lab", level: "ok", gate: "payload", message: "payload" },
      ],
    });
    expect(progress.completed).toBe(1);
    expect(progress.currentGate).toBe("ssh");
  });

  it("is 0% before any gate starts", () => {
    const progress = connectProgress({
      gates: REMOTE_CONNECT_GATES,
      phase: "connecting",
      logs: [],
    });
    expect(progress).toEqual({
      completed: 0,
      total: REMOTE_CONNECT_GATES.length,
      percent: 0,
      currentGate: "payload",
    });
  });

  it("recovers remote:// from a Host POSIX session cwd", () => {
    expect(resolveSessionRemoteRoot(
      "/home/ubuntu/project-test-1",
      ["remote://lab/home/ubuntu/project-test-1"],
    )).toBe("remote://lab/home/ubuntu/project-test-1");
  });
});
