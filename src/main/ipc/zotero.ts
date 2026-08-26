import { BrowserWindow, ipcMain } from "electron";
import { parseRemoteAbs } from "../../shared/remote";
import {
  getZoteroLastSync,
  getZoteroProjectBinding,
  getZoteroStatus,
  listZoteroCollections,
  pullZoteroCollectionsForProject,
  setZoteroProjectBinding,
  syncBoundZoteroCollection,
  type LiteratureProjectConfig,
  type ZoteroCollection,
  type ZoteroStatus,
  type ZoteroSyncResult,
} from "../literature/host";
import {
  cancelRemoteZoteroPull,
  pullRemoteZoteroCollection,
  pullRemoteZoteroCollections,
  REMOTE_ZOTERO_PROGRESS_CHANNEL,
} from "../remote/zotero-bridge";
import { routeHostLiteratureMethod } from "../remote/literature-route";
import { getRemoteSessionBroker } from "./remote";

function broadcastZoteroProgress(progress: { current: number; total: number; title: string }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(REMOTE_ZOTERO_PROGRESS_CHANNEL, progress);
  }
}

function remoteInvoke(projectRoot: string) {
  const parsed = parseRemoteAbs(projectRoot);
  if (!parsed) return null;
  const broker = getRemoteSessionBroker();
  return (method: string, params: unknown) => broker.invoke(parsed.profileId, method, params);
}

export function registerZoteroHandlers(): void {
  ipcMain.handle("zotero:probe", async (): Promise<ZoteroStatus> => {
    return getZoteroStatus();
  });

  ipcMain.handle("zotero:status", async (): Promise<ZoteroStatus> => {
    return getZoteroStatus();
  });

  ipcMain.handle("zotero:listCollections", async (): Promise<ZoteroCollection[]> => {
    return listZoteroCollections();
  });

  ipcMain.handle(
    "zotero:getProjectBinding",
    async (_event, args: { projectRoot: string }): Promise<LiteratureProjectConfig> => {
      const remote = await routeHostLiteratureMethod(
        "literature:getZoteroBinding",
        args,
        getRemoteSessionBroker(),
      );
      if (remote !== undefined) return remote as LiteratureProjectConfig;
      return getZoteroProjectBinding(args.projectRoot);
    },
  );

  ipcMain.handle(
    "zotero:setProjectBinding",
    async (
      _event,
      args: { projectRoot: string; collectionId: string | null; collectionName?: string | null },
    ): Promise<LiteratureProjectConfig & { detached?: { papers: number; collections: number } }> => {
      const remote = await routeHostLiteratureMethod(
        "literature:setZoteroBinding",
        args,
        getRemoteSessionBroker(),
      );
      if (remote !== undefined) {
        return remote as LiteratureProjectConfig & { detached?: { papers: number; collections: number } };
      }
      return setZoteroProjectBinding(args.projectRoot, args.collectionId, args.collectionName);
    },
  );

  ipcMain.handle("zotero:pullCollections", async (_event, args: { projectRoot: string }) => {
    const invoke = remoteInvoke(args.projectRoot);
    if (invoke) return pullRemoteZoteroCollections({ projectRoot: args.projectRoot, invoke });
    return pullZoteroCollectionsForProject(args.projectRoot);
  });

  ipcMain.handle(
    "zotero:pullCollection",
    async (_event, args: { projectRoot: string }): Promise<ZoteroSyncResult> => {
      const invoke = remoteInvoke(args.projectRoot);
      if (invoke) {
        return pullRemoteZoteroCollection({
          projectRoot: args.projectRoot,
          invoke,
          onProgress: broadcastZoteroProgress,
        });
      }
      return syncBoundZoteroCollection(args.projectRoot);
    },
  );

  ipcMain.handle("zotero:getLastSync", async (_event, args: { projectRoot: string }) => {
    const remote = await routeHostLiteratureMethod(
      "literature:getZoteroLastSync",
      args,
      getRemoteSessionBroker(),
    );
    if (remote !== undefined) return remote;
    return { lastSyncAt: getZoteroLastSync(args.projectRoot) };
  });

  ipcMain.handle("remote:zoteroCancel", async () => {
    cancelRemoteZoteroPull();
    return { ok: true };
  });
}
