import { create } from "zustand";
import type {
  RemoteBootstrapLogLine,
  RemoteConnectResult,
  RemoteConnectionState,
  SshConfigHost,
} from "@shared/remote";
import { clipBootstrapLogs } from "@/lib/remote/display";
import { remoteDesktop } from "@/lib/desktop-api/remote";

interface RemoteState {
  hosts: SshConfigHost[];
  byProfileId: Record<string, RemoteConnectionState>;
  logs: RemoteBootstrapLogLine[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  connect: (alias: string) => Promise<RemoteConnectResult>;
  disconnect: (alias: string) => Promise<void>;
  trustHostAndConnect: (
    alias: string,
    hostKey: { host: string; port: number; fingerprint: string },
  ) => Promise<RemoteConnectResult>;
}

let subscribed = false;

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
  });
}

export const useRemoteStore = create<RemoteState>((set, get) => ({
  hosts: [],
  byProfileId: {},
  logs: [],
  hydrated: false,

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
    const result = await remoteDesktop.remoteConnect(alias);
    if (result.hostKey) {
      set({
        byProfileId: {
          ...get().byProfileId,
          [alias]: { phase: "awaiting_host_key", profileId: alias, hostKey: result.hostKey },
        },
      });
    }
    return result;
  },

  disconnect: async (alias) => {
    await remoteDesktop.remoteDisconnect(alias);
  },

  trustHostAndConnect: async (alias, hostKey) => {
    await remoteDesktop.remoteTrustHost(hostKey);
    return get().connect(alias);
  },
}));
