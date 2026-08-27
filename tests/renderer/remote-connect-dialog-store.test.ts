import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("remote connect dialog store", () => {
  beforeEach(() => {
    useRemoteStore.setState({
      hosts: [],
      byProfileId: {},
      logs: [],
      hydrated: true,
      connectDialogAlias: null,
      connectDialog: null,
    });
  });

  it("opens a blocking session-load dialog with a pending retry", () => {
    useRemoteStore.getState().openConnectDialog("lab", {
      blocking: true,
      pendingAction: "session-load",
      pendingSession: {
        conversationId: "conv-1",
        projectId: "p_a",
        lastPath: "remote://lab/home/u/a",
      },
    });
    const dialog = useRemoteStore.getState().connectDialog;
    expect(useRemoteStore.getState().connectDialogAlias).toBe("lab");
    expect(dialog).toMatchObject({
      alias: "lab",
      blocking: true,
      pendingAction: "session-load",
      pendingSession: {
        conversationId: "conv-1",
        projectId: "p_a",
        lastPath: "remote://lab/home/u/a",
      },
    });
  });

  it("clears blocking state on close", () => {
    useRemoteStore.getState().openConnectDialog("lab", { blocking: true });
    useRemoteStore.getState().closeConnectDialog();
    expect(useRemoteStore.getState().connectDialog).toBeNull();
    expect(useRemoteStore.getState().connectDialogAlias).toBeNull();
  });
});
