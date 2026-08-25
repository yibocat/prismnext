import { app, BrowserWindow, ipcMain } from "electron";
import type { RemoteBootstrapLogLine, RemoteConnectionState, SshConfigHost } from "../../shared/remote";
import { listSshProfiles } from "../remote/profiles";
import { loadUserSshConfigHosts } from "../remote/ssh-config";
import { RemoteSessionBroker } from "../remote/session-broker";
import { readProLicense } from "../teams/pro-license";

function broadcastRemoteLog(line: RemoteBootstrapLogLine): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("remote:log", line);
  }
}

function broadcastRemoteConnection(profileId: string, state: RemoteConnectionState): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("remote:connection", { profileId, state });
  }
}

let broker: RemoteSessionBroker | null = null;

export function getRemoteSessionBroker(): RemoteSessionBroker {
  if (!broker) {
    broker = new RemoteSessionBroker({
      desktopVersion: app.getVersion(),
      getLicense: () => readProLicense(),
      getProfile: (id) => listSshProfiles().find((item) => item.id === id) ?? null,
      onLog: broadcastRemoteLog,
      onConnection: broadcastRemoteConnection,
    });
  }
  return broker;
}

/** Test-only: swap the process-wide broker. */
export function setRemoteSessionBrokerForTests(next: RemoteSessionBroker | null): void {
  broker = next;
}

export function registerRemoteHandlers(): void {
  ipcMain.handle("remote:listHosts", async () => loadUserSshConfigHosts());

  ipcMain.handle(
    "remote:trustHost",
    async (_e, args: { host: string; port: number; fingerprint: string }) => {
      getRemoteSessionBroker().trustHost(args);
    },
  );

  ipcMain.handle("remote:connect", async (_e, args: { profileId: string }) => {
    return getRemoteSessionBroker().connect(args.profileId);
  });

  ipcMain.handle("remote:disconnect", async (_e, args: { profileId: string }) => {
    await getRemoteSessionBroker().disconnect(args.profileId);
  });

  ipcMain.handle("remote:connectionStatus", async (_e, args?: { profileId?: string }) => {
    const current = getRemoteSessionBroker();
    if (args?.profileId) return current.connectionStatus(args.profileId);
    return current.snapshot();
  });
}

export type { SshConfigHost };
