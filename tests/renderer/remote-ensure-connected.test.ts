import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  remoteFocusNeedsBind,
  remotePhaseIsBusy,
  remotePhaseIsReady,
  remotePhaseNeedsConnect,
} from "../../src/renderer/lib/remote/ensure-connected";
import { useRemoteStore } from "../../src/renderer/stores/remote-store";

vi.mock("@/lib/desktop-api/remote", () => ({
  remoteDesktop: {
    remoteListHosts: vi.fn(async () => []),
    remoteConnectionStatus: vi.fn(async () => ({ byProfileId: {}, logs: [] })),
    remoteConnect: vi.fn(async () => ({ ok: true, profileId: "lab" })),
    remoteDisconnect: vi.fn(async () => undefined),
    remoteTrustHost: vi.fn(async () => undefined),
    remoteOpenProject: vi.fn(async () => ({ lastPath: "remote://lab/home/u/p", projectId: "p" })),
    onRemoteLog: undefined,
    onRemoteConnection: undefined,
  },
}));

describe("remote reconnect helpers", () => {
  beforeEach(() => {
    useRemoteStore.setState({
      hosts: [],
      byProfileId: {},
      logs: [],
      hydrated: true,
      connectDialogAlias: null,
    });
  });

  it("classifies connection phases", () => {
    expect(remotePhaseIsReady("ready")).toBe(true);
    expect(remotePhaseIsReady("disconnected")).toBe(false);
    expect(remotePhaseIsBusy("connecting")).toBe(true);
    expect(remotePhaseIsBusy("bootstrapping")).toBe(true);
    expect(remotePhaseNeedsConnect("idle")).toBe(true);
    expect(remotePhaseNeedsConnect("error")).toBe(true);
    expect(remotePhaseNeedsConnect("ready")).toBe(false);
  });

  it("needs a bind when the remembered remote host is down", () => {
    expect(remoteFocusNeedsBind("/Users/me/paper")).toBe(false);
    expect(remoteFocusNeedsBind("remote://lab/home/ubuntu/paper")).toBe(true);
    useRemoteStore.setState({
      byProfileId: { lab: { phase: "ready", profileId: "lab" } },
    });
    expect(remoteFocusNeedsBind("remote://lab/home/ubuntu/paper")).toBe(false);
  });
});
