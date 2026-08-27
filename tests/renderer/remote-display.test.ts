import { describe, expect, it } from "vitest";
import {
  clipBootstrapLogs,
  connectPrepareGate,
  connectionPhaseLabelKey,
  constitutionLines,
  latestGateDetail,
  logsForProfile,
  resolveConnectGateStatus,
  shortPayloadSha,
} from "../../src/renderer/lib/remote/display";

describe("remote display helpers", () => {
  it("shortens a payload sha and clips logs", () => {
    expect(shortPayloadSha("abcdefghijklmnop")).toBe("abcdefgh");
    const logs = Array.from({ length: 5 }, (_, i) => ({
      ts: i,
      profileId: "p",
      message: String(i),
    }));
    expect(clipBootstrapLogs(logs, 3).map((l) => l.message)).toEqual(["2", "3", "4"]);
  });

  it("maps connection phases to i18n keys", () => {
    expect(connectionPhaseLabelKey({ phase: "ready", profileId: "p", connectionId: "c", handshake: {
      protocolRev: 1,
      desktopVersion: "0.9.0",
      payloadSha256: "aa",
      appHome: "/h",
      hostRoot: "/r",
      features: ["control"],
    } })).toBe("remote.phase.ready");
    expect(connectionPhaseLabelKey({
      phase: "reconnecting",
      profileId: "p",
      connectionId: "c",
    })).toBe("remote.phase.reconnecting");
  });

  it("keeps per-host logs and formats constitution lines", () => {
    const logs = [
      { ts: 1, profileId: "a", message: "one", level: "ok" as const, gate: "ssh" as const },
      { ts: 2, profileId: "b", message: "other" },
      { ts: 3, profileId: "a", message: "two", level: "error" as const, gate: "runtime" as const },
    ];
    expect(logsForProfile(logs, "a").map((line) => line.message)).toEqual(["one", "two"]);
    expect(constitutionLines({
      doctor: null,
      gates: [
        { gate: "ssh", ok: true, detail: "up" },
        { gate: "runtime", ok: false, detail: "no node" },
      ],
    })).toEqual(["ok ssh — up", "fail runtime — no node"]);
    expect(resolveConnectGateStatus("ssh", undefined, logs)).toBe("ok");
    expect(resolveConnectGateStatus("runtime", undefined, logs)).toBe("fail");
    expect(resolveConnectGateStatus("doctor", undefined, logs)).toBe("pending");
    expect(latestGateDetail("runtime", undefined, logs)).toBe("two");
    expect(latestGateDetail("ssh", {
      doctor: null,
      gates: [{ gate: "ssh", ok: true, detail: "up" }],
    }, logs)).toBe("up");
  });

  it("does not send SSH back to pending after a later info line on the same gate", () => {
    const logs = [
      { ts: 1, profileId: "a", message: "System ssh reached lab.", level: "ok" as const, gate: "ssh" as const },
      { ts: 2, profileId: "a", message: "Handshake ok — 0.8.0 0fd49881", level: "ok" as const, gate: "handshake" as const },
      {
        ts: 3,
        profileId: "a",
        message: "OpenSSH destination lab (ProxyJump from ~/.ssh/config if set).",
        level: "info" as const,
        gate: "ssh" as const,
      },
    ];
    expect(resolveConnectGateStatus("ssh", undefined, logs)).toBe("ok");
    expect(resolveConnectGateStatus("handshake", undefined, logs)).toBe("ok");
    expect(latestGateDetail("ssh", undefined, logs)).toBe("System ssh reached lab.");
  });

  it("exposes the current connect gate for the prepare line", () => {
    expect(connectPrepareGate("remote://lab/home/u/a", {}, [])).toBe("payload");
    expect(connectPrepareGate("/Users/me/paper", {}, [])).toBeNull();
  });
});

