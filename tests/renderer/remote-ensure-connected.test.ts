import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureRemoteProjectReady,
  isRemoteConnectError,
  RemoteConnectError,
  resolveFocusConnectRemote,
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

  it("defaults connectRemote to false for remote roots and true for local", () => {
    expect(resolveFocusConnectRemote("/papers/a")).toBe(true);
    expect(resolveFocusConnectRemote("remote://lab/home/u/a")).toBe(false);
    expect(resolveFocusConnectRemote("remote://lab/home/u/a", { connectRemote: true })).toBe(true);
    expect(resolveFocusConnectRemote("/papers/a", { connectRemote: false })).toBe(false);
  });

  it("throws RemoteConnectError when connect fails", async () => {
    const connect = vi.fn(async () => ({ ok: false, message: "ssh down" }));
    useRemoteStore.setState({ connect });
    await expect(ensureRemoteProjectReady("remote://lab/home/u/a")).rejects.toSatisfy(
      (err: unknown) => isRemoteConnectError(err) && err.alias === "lab",
    );
    expect(connect).toHaveBeenCalledWith("lab");
  });

  it("isRemoteConnectError recognizes the class", () => {
    expect(isRemoteConnectError(new RemoteConnectError("lab", "nope"))).toBe(true);
    expect(isRemoteConnectError(new Error("nope"))).toBe(false);
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
