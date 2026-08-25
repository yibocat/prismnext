import { describe, expect, it } from "vitest";
import {
  clipBootstrapLogs,
  connectionPhaseLabelKey,
  constitutionLines,
  logsForProfile,
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
  });
});

