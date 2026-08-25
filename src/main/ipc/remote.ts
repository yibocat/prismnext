import { app, BrowserWindow, ipcMain } from "electron";
import type { RemoteBootstrapLogLine, RemoteConnectionState, SshConfigHost } from "../../shared/remote";
import {
  RemoteOperationError,
  isRemoteDirListing,
  normalizePosixAbs,
} from "../../shared/remote";
import { listSshProfiles } from "../remote/profiles";
import { loadUserSshConfigHosts } from "../remote/ssh-config";
import { RemoteSessionBroker } from "../remote/session-broker";
import { readProLicense } from "../teams/pro-license";
import { registerRemoteWorkbenchProject } from "../workbench/default-project";

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
      onEvent: (channel, payload) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send(channel, payload);
        }
      },
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

  ipcMain.handle(
    "remote:listDir",
    async (_e, args: { profileId: string; path: string }) => {
      const listing = await getRemoteSessionBroker().invoke(args.profileId, "fs:listDir", {
        path: args.path,
      });
      if (!isRemoteDirListing(listing)) {
        throw new RemoteOperationError("protocol", "fs:listDir returned an unexpected payload.");
      }
      return listing;
    },
  );

  ipcMain.handle(
    "remote:openProject",
    async (_e, args: { profileId: string; remoteRoot?: string }) => {
      const current = getRemoteSessionBroker();
      const remoteRoot = normalizePosixAbs(args.remoteRoot ?? "");
      if (!remoteRoot) {
        throw new RemoteOperationError("protocol", "Choose a remote folder.");
      }
      const opened = await current.openProject(args.profileId, remoteRoot);
      const displayName = opened.remoteRoot.split("/").filter(Boolean).at(-1) || args.profileId;
      registerRemoteWorkbenchProject({
        projectId: opened.projectId,
        lastPath: opened.lastPath,
        displayName,
      });
      return opened;
    },
  );
}

export type { SshConfigHost };
