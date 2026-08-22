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

export function registerLiteratureExtractHandlers(): void {
  ipcMain.handle(
    "extract:enqueue",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource; force?: boolean },
    ) => {
      return enqueuePaperExtractForRenderer(args.projectRoot, args.paperId, args.source, args.force);
    },
  );

  ipcMain.handle(
    "extract:cancel",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource },
    ) => {
      return cancelPaperExtractForRenderer(args.projectRoot, args.paperId, args.source);
    },
  );

  ipcMain.handle(
    "extract:list",
    async (_event, args: { projectRoot: string; paperIds: string[] }) => {
      return listPaperExtractStates(args.projectRoot, args.paperIds);
    },
  );

  ipcMain.handle(
    "extract:get",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource },
    ) => {
      return getExtractDocument(args.projectRoot, args.paperId, args.source);
    },
  );

  ipcMain.handle(
    "extract:getBlocks",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source?: PaperExtractSource },
    ) => {
      return getExtractBlocksDocument(args.projectRoot, args.paperId, args.source);
    },
  );

  ipcMain.handle(
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

  ipcMain.handle(
    "extract:resume",
    async (_event, args: { projectRoot: string }) => {
      return resumeExtractQueuesForRenderer(args.projectRoot);
    },
  );

  ipcMain.handle(
    "extract:retry",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource },
    ) => {
      return retryPaperExtractForRenderer(args.projectRoot, args.paperId, args.source);
    },
  );

  ipcMain.handle(
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

  ipcMain.handle(
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

  ipcMain.handle(
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
