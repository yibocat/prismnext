import { ipcMain } from "electron";
import type { PaperExtractSource } from "../../shared/literature/paper-extract";
import {
  cancelPaperExtractForRenderer,
  enqueueBatchPaperExtractForRenderer,
  enqueueCollectionExtractForRenderer,
  enqueuePaperExtractForRenderer,
  getExtractBlocksDocument,
  getExtractDocument,
  listPaperExtractStates,
  openExtractMarkdown,
  readUserPaperPdfContent,
  resumeExtractQueuesForRenderer,
  retryPaperExtractForRenderer,
  testMineruFromSettings,
} from "../literature/host";
import { routeHostLiteratureMethod } from "../remote/literature-route";
import { getRemoteSessionBroker } from "./remote";

async function routeIfRemote(method: string, args: unknown): Promise<unknown | undefined> {
  return routeHostLiteratureMethod(method, args, getRemoteSessionBroker());
}

function handleExtract(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, args: any) => unknown,
): void {
  ipcMain.handle(channel, async (event, args) => {
    const remote = await routeIfRemote(channel, args ?? {});
    if (remote !== undefined) return remote;
    return fn(event, args);
  });
}

export function registerLiteratureExtractHandlers(): void {
  handleExtract(
    "extract:enqueue",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource; force?: boolean },
    ) => {
      return enqueuePaperExtractForRenderer(args.projectRoot, args.paperId, args.source, args.force);
    },
  );

  handleExtract(
    "extract:cancel",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource },
    ) => {
      return cancelPaperExtractForRenderer(args.projectRoot, args.paperId, args.source);
    },
  );

  handleExtract(
    "extract:list",
    async (_event, args: { projectRoot: string; paperIds: string[] }) => {
      return listPaperExtractStates(args.projectRoot, args.paperIds);
    },
  );

  handleExtract(
    "extract:get",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource },
    ) => {
      return getExtractDocument(args.projectRoot, args.paperId, args.source);
    },
  );

  handleExtract(
    "extract:getBlocks",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source?: PaperExtractSource },
    ) => {
      return getExtractBlocksDocument(args.projectRoot, args.paperId, args.source);
    },
  );

  handleExtract(
    "extract:openMd",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource },
    ) => {
      return openExtractMarkdown(args.projectRoot, args.paperId, args.source);
    },
  );

  ipcMain.handle("extract:testMineru", async (_event, args: { token?: string }) => {
    return testMineruFromSettings(args.token);
  });

  handleExtract(
    "extract:resume",
    async (_event, args: { projectRoot: string }) => {
      return resumeExtractQueuesForRenderer(args.projectRoot);
    },
  );

  handleExtract(
    "extract:retry",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource },
    ) => {
      return retryPaperExtractForRenderer(args.projectRoot, args.paperId, args.source);
    },
  );

  handleExtract(
    "extract:enqueueBatch",
    async (
      _event,
      args: {
        projectRoot: string;
        paperIds: string[];
        source: PaperExtractSource;
        force?: boolean;
      },
    ) => {
      return enqueueBatchPaperExtractForRenderer(
        args.projectRoot,
        args.paperIds,
        args.source,
        args.force,
      );
    },
  );

  handleExtract(
    "extract:enqueueCollection",
    async (
      _event,
      args: {
        projectRoot: string;
        collectionId: string;
        source: PaperExtractSource;
        force?: boolean;
      },
    ) => {
      return enqueueCollectionExtractForRenderer(
        args.projectRoot,
        args.collectionId,
        args.source,
        args.force,
      );
    },
  );

  handleExtract(
    "extract:readPdf",
    async (
      _event,
      args: {
        projectRoot: string;
        bibkey: string;
        pages?: string;
        query?: string;
        source?: "auto" | PaperExtractSource;
        force?: boolean;
      },
    ) => {
      return readUserPaperPdfContent(args);
    },
  );
}
