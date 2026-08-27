import { describe, expect, it } from "vitest";
import {
  appStatusDotPhase,
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

  it("recovers remote:// from a Host POSIX session cwd", () => {
    expect(resolveSessionRemoteRoot(
      "/home/ubuntu/project-test-1",
      ["remote://lab/home/ubuntu/project-test-1"],
    )).toBe("remote://lab/home/ubuntu/project-test-1");
  });
});
