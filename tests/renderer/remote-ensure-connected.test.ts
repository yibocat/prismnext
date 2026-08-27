import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureRemoteLiveForWork,
  ensureRemoteHostReady,
  ensureRemoteProjectReady,
  isRemoteConnectError,
  isRemoteProjectOffline,
  RemoteConnectError,
  resolveFocusConnectRemote,
  remoteFocusNeedsBind,
  shouldSkipRemoteHostBind,
  remotePhaseIsBusy,
  remotePhaseIsReady,
  remotePhaseNeedsConnect,
} from "../../src/renderer/lib/remote/ensure-connected";
import { modeNeedsLiveHost, tabNeedsLiveHost } from "../../src/renderer/lib/workspace/mode-registry";
import { useRemoteStore } from "../../src/renderer/stores/remote-store";

const projectOpen = vi.fn(async () => ({ rootPath: "remote://lab/home/u/a" }));

vi.mock("@/lib/desktop-api/project", () => ({
  projectDesktop: {
    projectOpen: (...args: unknown[]) => projectOpen(...args),
  },
}));

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

  it("treats a remote folder as offline until the Host is ready", () => {
    expect(isRemoteProjectOffline("/papers/a", {})).toBe(false);
    expect(isRemoteProjectOffline("remote://lab/home/u/a", {})).toBe(true);
    expect(isRemoteProjectOffline("remote://lab/home/u/a", { lab: { phase: "connecting" } })).toBe(true);
    expect(isRemoteProjectOffline("remote://lab/home/u/a", { lab: { phase: "ready" } })).toBe(false);
  });

  it("only host-bound RightArea modes need a live Host", () => {
    expect(modeNeedsLiveHost("files")).toBe(true);
    expect(modeNeedsLiveHost("git")).toBe(true);
    expect(modeNeedsLiveHost("experiments")).toBe(true);
    expect(modeNeedsLiveHost("browser")).toBe(false);
    expect(modeNeedsLiveHost("settings-editor")).toBe(false);
    expect(modeNeedsLiveHost("dashboard")).toBe(false);
    expect(tabNeedsLiveHost({ kind: "file" })).toBe(true);
    expect(tabNeedsLiveHost({ kind: "browser" })).toBe(false);
    expect(tabNeedsLiveHost({ kind: "settings-editor" })).toBe(false);
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

  it("keeps host-key trust on the caller when the prompt is inline", async () => {
    const openConnectDialog = vi.fn();
    const hostKey = { host: "lab", port: 22, fingerprint: "SHA256:abc" };
    const connect = vi.fn(async () => {
      useRemoteStore.setState({
        byProfileId: { lab: { phase: "awaiting_host_key", profileId: "lab", hostKey } },
      });
      return { ok: false, hostKey };
    });
    useRemoteStore.setState({ connect, openConnectDialog, hydrated: true });
    const pending = ensureRemoteHostReady("lab", { hostKeyPrompt: "inline" });
    await vi.waitFor(() => {
      expect(useRemoteStore.getState().byProfileId.lab?.phase).toBe("awaiting_host_key");
    });
    expect(openConnectDialog).not.toHaveBeenCalled();
    useRemoteStore.setState({
      byProfileId: {
        lab: { phase: "error", profileId: "lab", code: "ssh_auth", message: "denied" },
      },
    });
    await expect(pending).rejects.toSatisfy(
      (err: unknown) => isRemoteConnectError(err) && err.alias === "lab",
    );
    expect(openConnectDialog).not.toHaveBeenCalled();
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

  it("skips Host bind only while the remote Host is down", () => {
    const remote = "remote://lab/home/ubuntu/paper";
    expect(shouldSkipRemoteHostBind(remote, false)).toBe(true);
    expect(shouldSkipRemoteHostBind("/papers/a", false)).toBe(false);
    expect(shouldSkipRemoteHostBind(remote, true)).toBe(false);
    expect(shouldSkipRemoteHostBind(remote)).toBe(false);
    useRemoteStore.setState({
      byProfileId: { lab: { phase: "ready", profileId: "lab" } },
    });
    expect(shouldSkipRemoteHostBind(remote, false)).toBe(false);
  });

  it("opens the Host project after SSH is ready", async () => {
    projectOpen.mockClear();
    useRemoteStore.setState({
      byProfileId: { lab: { phase: "ready", profileId: "lab" } },
    });
    await ensureRemoteLiveForWork("remote://lab/home/u/a");
    expect(projectOpen).toHaveBeenCalledWith("remote://lab/home/u/a");
  });
});
