import { app, BrowserWindow, ipcMain } from "electron";
import type { RemoteBootstrapLogLine, RemoteConnectionState, RemoteSyncMode, SshConfigHost } from "../../shared/remote";
import {
  MODEL_PROXY_START_CHANNEL,
  REMOTE_SYNC_PROGRESS_CHANNEL,
  SESSION_MUTATED_CHANNEL,
  RemoteOperationError,
  isRemoteDirListing,
  isRemoteSyncMode,
  isSessionMutatedEvent,
  normalizePosixAbs,
  rewriteHostEventPaths,
} from "../../shared/remote";
import { parseModelProxyStart, runModelProxyStart } from "../remote/model-gateway";
import { profileModelKeys, profileSyncMode, sessionMirrorEnabled, writeProfileSyncMode } from "../remote/profile-overrides";
import { getSshProfile, listSshProfiles } from "../remote/profiles";
import { loadUserSshConfigHosts } from "../remote/ssh-config";
import { readDesktopModelSeed } from "../app/settings";
import { RemoteSessionBroker } from "../remote/session-broker";
import { registerRemoteWorkbenchProject } from "../workbench/default-project";
import {
  cancelRemoteSync,
  syncRemoteExperimentArtifacts,
  syncRemoteFile,
  syncRemotePaperPdf,
} from "../remote/sync-client";
import { pullAndMirrorSession } from "../remote/session-mirror";
import { pushLaptopSkillsToHost } from "../remote/skills-push";
import { hostListingCacheKey, invalidateHostListingCache, readHostListingCache, writeHostListingCache } from "../remote/fs-bridge";

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

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
      getProfile: (id) => listSshProfiles().find((item) => item.id === id) ?? null,
      readModelSeed: readDesktopModelSeed,
      onLog: broadcastRemoteLog,
      onConnection: broadcastRemoteConnection,
      onEvent: (channel, payload, profileId) => {
        if (channel === MODEL_PROXY_START_CHANNEL) {
          if (profileModelKeys(getSshProfile(profileId)) === "remote") return;
          const start = parseModelProxyStart(payload);
          if (start && profileId) {
            void runModelProxyStart(start, (chunk) =>
              getRemoteSessionBroker().invoke(profileId, "model.proxy.push", chunk).then(() => undefined),
            );
          }
          return;
        }
        if (channel === SESSION_MUTATED_CHANNEL && profileId && isSessionMutatedEvent(payload)) {
          if (sessionMirrorEnabled(profileId)) {
            void pullAndMirrorSession(getRemoteSessionBroker(), payload, profileId);
          }
        }
        const rewritten = rewriteHostEventPaths(payload, profileId);
        broadcast(channel, rewritten);
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
      const cacheKey = hostListingCacheKey(args.profileId, "fs:listDir", args.path);
      const cached = readHostListingCache(cacheKey);
      if (cached && isRemoteDirListing(cached)) return cached;
      const listing = await getRemoteSessionBroker().invoke(args.profileId, "fs:listDir", {
        path: args.path,
      });
      if (!isRemoteDirListing(listing)) {
        throw new RemoteOperationError("protocol", "fs:listDir returned an unexpected payload.");
      }
      writeHostListingCache(cacheKey, listing);
      return listing;
    },
  );

  ipcMain.handle(
    "remote:mkdir",
    async (_e, args: { profileId: string; path: string }) => {
      const created = await getRemoteSessionBroker().mkdirBrowseDir(args.profileId, args.path);
      invalidateHostListingCache(args.profileId);
      return created;
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

  ipcMain.handle("remote:getSyncMode", async (_e, args: { profileId: string }) => {
    return { mode: profileSyncMode(args.profileId) };
  });

  ipcMain.handle(
    "remote:setSyncMode",
    async (_e, args: { profileId: string; mode: RemoteSyncMode }) => {
      if (!isRemoteSyncMode(args.mode)) {
        throw new RemoteOperationError("protocol", "Unknown sync mode.");
      }
      writeProfileSyncMode(args.profileId, args.mode);
      return { mode: args.mode };
    },
  );

  ipcMain.handle("remote:syncCancel", async () => {
    cancelRemoteSync();
    return { ok: true };
  });

  ipcMain.handle(
    "remote:syncFile",
    async (_e, args: { profileId: string; projectId: string; remoteAbs: string; destRel?: string }) => {
      return syncRemoteFile(getRemoteSessionBroker(), args, (progress) => {
        broadcast(REMOTE_SYNC_PROGRESS_CHANNEL, progress);
      });
    },
  );

  ipcMain.handle(
    "remote:syncPaperPdf",
    async (_e, args: { projectRoot: string; paperId: string; projectId: string }) => {
      return syncRemotePaperPdf(getRemoteSessionBroker(), args, (progress) => {
        broadcast(REMOTE_SYNC_PROGRESS_CHANNEL, progress);
      });
    },
  );

  ipcMain.handle(
    "remote:syncExperimentArtifacts",
    async (_e, args: { projectRoot: string; projectId: string; experimentId: string }) => {
      return syncRemoteExperimentArtifacts(getRemoteSessionBroker(), args, (progress) => {
        broadcast(REMOTE_SYNC_PROGRESS_CHANNEL, progress);
      });
    },
  );

  ipcMain.handle(
    "remote:syncSessions",
    async (_e, args: { profileId: string; projectId: string }) => {
      const broker = getRemoteSessionBroker();
      const listed = await broker.invoke(args.profileId, "session:list", { projectId: args.projectId }) as Array<{
        conversationId?: string;
        updatedAt?: string;
      }>;
      const rows = Array.isArray(listed) ? listed : [];
      let current = 0;
      for (const row of rows) {
        const conversationId = String(row.conversationId ?? "");
        if (!conversationId) continue;
        broadcast(REMOTE_SYNC_PROGRESS_CHANNEL, {
          current,
          total: rows.length,
          title: conversationId,
          kind: "sessions",
        });
        await pullAndMirrorSession(
          broker,
          {
            conversationId,
            projectId: args.projectId,
            updatedAt: String(row.updatedAt ?? new Date().toISOString()),
            action: "turn_finished",
          },
          args.profileId,
        );
        current += 1;
      }
      return { ok: true, count: current };
    },
  );

  ipcMain.handle("remote:pushSkills", async (_e, args: { profileId: string }) => {
    return pushLaptopSkillsToHost(getRemoteSessionBroker(), args.profileId, (progress) => {
      broadcast(REMOTE_SYNC_PROGRESS_CHANNEL, progress);
    });
  });
}

export type { SshConfigHost };
