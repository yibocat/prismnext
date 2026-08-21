import { ipcMain } from "electron";
import {
  getZoteroStatus,
  listZoteroCollections,
  type ZoteroCollection,
  type ZoteroStatus,
} from "../services/zotero-client";
import {
  getZoteroLastSync,
  syncBoundZoteroCollection,
  syncZoteroCollections,
  type ZoteroSyncResult,
} from "../services/zotero-sync";
import {
  readLiteratureProjectConfig,
  writeLiteratureProjectConfig,
  type LiteratureProjectConfig,
} from "../services/workspace-config";
import { projectHomeSlotDir } from "../services/literature-service";

function prismDir(projectRoot: string): string {
  return projectHomeSlotDir(projectRoot);
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
      return readLiteratureProjectConfig(prismDir(args.projectRoot));
    },
  );

  ipcMain.handle(
    "zotero:setProjectBinding",
    async (
      _event,
      args: { projectRoot: string; collectionId: string | null; collectionName?: string | null },
    ): Promise<LiteratureProjectConfig & { detached?: { papers: number; collections: number } }> => {
      if (!args.collectionId) {
        // Disconnecting — detach all Zotero mirrors so the library becomes fully local.
        const { detachAllZoteroMirrors } = await import("../services/literature-service");
        const detached = detachAllZoteroMirrors(args.projectRoot);
        const config = writeLiteratureProjectConfig(prismDir(args.projectRoot), {
          zoteroCollectionId: undefined,
          zoteroCollectionName: undefined,
        });
        return { ...config, detached };
      }
      return writeLiteratureProjectConfig(prismDir(args.projectRoot), {
        zoteroCollectionId: args.collectionId,
        zoteroCollectionName: args.collectionName ?? undefined,
      });
    },
  );

  ipcMain.handle("zotero:pullCollections", async (_event, args: { projectRoot: string }) => {
    const binding = readLiteratureProjectConfig(prismDir(args.projectRoot));
    const { upserted, pruned } = await syncZoteroCollections(
      args.projectRoot,
      binding.zoteroCollectionId ?? null,
    );
    return { collectionsUpserted: upserted, collectionsPruned: pruned };
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
