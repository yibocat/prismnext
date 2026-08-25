import { ipcMain } from "electron";
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
      return getZoteroProjectBinding(args.projectRoot);
    },
  );

  ipcMain.handle(
    "zotero:setProjectBinding",
    async (
      _event,
      args: { projectRoot: string; collectionId: string | null; collectionName?: string | null },
    ): Promise<LiteratureProjectConfig & { detached?: { papers: number; collections: number } }> => {
      return setZoteroProjectBinding(args.projectRoot, args.collectionId, args.collectionName);
    },
  );

  ipcMain.handle("zotero:pullCollections", async (_event, args: { projectRoot: string }) => {
    return pullZoteroCollectionsForProject(args.projectRoot);
  });

  ipcMain.handle(
    "zotero:pullCollection",
    async (_event, args: { projectRoot: string }): Promise<ZoteroSyncResult> => {
      return syncBoundZoteroCollection(args.projectRoot);
    },
  );

  ipcMain.handle("zotero:getLastSync", async (_event, args: { projectRoot: string }) => {
    return { lastSyncAt: getZoteroLastSync(args.projectRoot) };
  });
}
