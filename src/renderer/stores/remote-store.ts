import { create } from "zustand";
import {
  parseRemoteAbs,
  type RemoteBootstrapLogLine,
  type RemoteConnectResult,
  type RemoteConnectionState,
  type SshConfigHost,
} from "@shared/remote";
import { clipBootstrapLogs } from "@/lib/remote/display";
import { remoteDesktop } from "@/lib/desktop-api/remote";

export type ConnectDialogPendingAction = "session-load" | "idle";

export type ConnectDialogPendingSession = {
  conversationId: string;
  projectId: string;
  lastPath: string;
  directory?: string;
};

export type ConnectDialogState = {
  alias: string;
  blocking: boolean;
  autoCloseOnReady?: boolean;
  pendingAction?: ConnectDialogPendingAction;
  pendingSession?: ConnectDialogPendingSession;
};

interface RemoteState {
  hosts: SshConfigHost[];
  byProfileId: Record<string, RemoteConnectionState>;
  logs: RemoteBootstrapLogLine[];
  hydrated: boolean;
  connectDialogAlias: string | null;
  connectDialog: ConnectDialogState | null;
  hydrate: () => Promise<void>;
  connect: (alias: string) => Promise<RemoteConnectResult>;
  disconnect: (alias: string) => Promise<void>;
  trustHostAndConnect: (
    alias: string,
    hostKey: { host: string; port: number; fingerprint: string },
  ) => Promise<RemoteConnectResult>;
  openConnectDialog: (
    alias: string,
    opts?: {
      blocking?: boolean;
      autoCloseOnReady?: boolean;
      pendingAction?: ConnectDialogPendingAction;
      pendingSession?: ConnectDialogPendingSession;
    },
  ) => void;
  closeConnectDialog: () => void;
  openProject: (
    alias: string,
    remoteRoot: string,
  ) => Promise<{ lastPath: string; projectId: string }>;
}

async function rebindFocusedRemoteProject(alias: string): Promise<void> {
  const { useDocumentStore } = await import("@/stores/document-store");
  const parsed = parseRemoteAbs(useDocumentStore.getState().projectRoot ?? "");
  if (!parsed || parsed.profileId !== alias) return;
  await remoteDesktop.remoteOpenProject({
    profileId: alias,
    remoteRoot: parsed.abs,
  });
}

const connectInFlight = new Map<string, Promise<RemoteConnectResult>>();
const syncedReadyProfiles = new Set<string>();
const readySideEffects = new Map<string, Promise<void>>();

let subscribed = false;

function onProfileReady(profileId: string): void {
  if (readySideEffects.has(profileId)) return;
  const work = (async () => {
    await rebindFocusedRemoteProject(profileId).catch(() => undefined);
    const { useDocumentStore } = await import("@/stores/document-store");
    const root = useDocumentStore.getState().projectRoot ?? "";
    if (parseRemoteAbs(root)?.profileId === profileId) {
      const { refreshFocusedRemoteNeighbors } = await import("@/lib/workspace/project-lifecycle");
      await refreshFocusedRemoteNeighbors(root).catch(() => undefined);
      void import("@/stores/git-store").then((mod) => mod.useGitStore.getState().checkRepo(root));
      // Host became ready for the focused project: if a lazy focus closed the
      // working set while the Host was down (or the connection dropped after a
      // refocus), bring back the archived tabs now that the tree is live.
      try {
        const { restoreArchivedTabs } = await import("@/lib/workspace/tab-restore");
        restoreArchivedTabs(root);
      } catch {
        // restore must never break the ready path
      }
    }
    if (syncedReadyProfiles.has(profileId)) return;
    syncedReadyProfiles.add(profileId);
    await new Promise((resolve) => setTimeout(resolve, 800));
    const { syncRemoteSessionsForProfile } = await import("@/lib/remote/sync-actions");
    await syncRemoteSessionsForProfile(profileId, { silent: true });
  })();
  readySideEffects.set(profileId, work);
}

function ensureSubscriptions(apply: (partial: Partial<RemoteState>) => void): void {
  if (subscribed) return;
  subscribed = true;
  remoteDesktop.onRemoteLog?.((line) => {
    const { logs } = useRemoteStore.getState();
    apply({ logs: clipBootstrapLogs([...logs, line]) });
  });
  remoteDesktop.onRemoteConnection?.(({ profileId, state }) => {
    apply({
      byProfileId: { ...useRemoteStore.getState().byProfileId, [profileId]: state },
    });
    if (state.phase === "ready") onProfileReady(profileId);
    else {
      syncedReadyProfiles.delete(profileId);
      readySideEffects.delete(profileId);
    }
  });
}

export const useRemoteStore = create<RemoteState>((set, get) => ({
  hosts: [],
  byProfileId: {},
  logs: [],
  hydrated: false,
  connectDialogAlias: null,
  connectDialog: null,

  hydrate: async () => {
    ensureSubscriptions(set);
    const hosts = (await remoteDesktop.remoteListHosts()) ?? [];
    const snap = await remoteDesktop.remoteConnectionStatus();
    const byProfileId =
      snap && typeof snap === "object" && "byProfileId" in snap ? snap.byProfileId : {};
    const logs =
      snap && typeof snap === "object" && "logs" in snap ? clipBootstrapLogs(snap.logs) : [];
    set({ hosts, byProfileId, logs, hydrated: true });
  },

  connect: async (alias) => {
    ensureSubscriptions(set);
    const existing = connectInFlight.get(alias);
    if (existing) return existing;
    const pending = (async () => {
      const result = await remoteDesktop.remoteConnect(alias);
      if (result.hostKey) {
        set({
          byProfileId: {
            ...get().byProfileId,
            [alias]: { phase: "awaiting_host_key", profileId: alias, hostKey: result.hostKey },
          },
        });
      }
      if (result.ok) {
        onProfileReady(alias);
      }
      return result;
    })().finally(() => {
      connectInFlight.delete(alias);
    });
    connectInFlight.set(alias, pending);
    return pending;
  },

  openConnectDialog: (alias, opts) => {
    set({
      connectDialogAlias: alias,
      connectDialog: {
        alias,
        blocking: opts?.blocking === true,
        autoCloseOnReady: opts?.autoCloseOnReady === true,
        pendingAction: opts?.pendingAction,
        pendingSession: opts?.pendingSession,
      },
    });
  },

  closeConnectDialog: () => {
    set({ connectDialogAlias: null, connectDialog: null });
  },

  disconnect: async (alias) => {
    await remoteDesktop.remoteDisconnect(alias);
  },

  trustHostAndConnect: async (alias, hostKey) => {
    await remoteDesktop.remoteTrustHost(hostKey);
    return get().connect(alias);
  },

  openProject: async (alias, remoteRoot) => {
    const opened = await remoteDesktop.remoteOpenProject({ profileId: alias, remoteRoot });
    return { lastPath: opened.lastPath, projectId: opened.projectId };
  },
}));
