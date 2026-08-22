import { ipcMain } from "electron";
import type { PaperExtractSource } from "../../shared/literature/paper-extract";
import {
  cancelPaperExtract,
  enqueueBatchPaperExtract,
  enqueueCollectionExtract,
  enqueuePaperExtract,
  resumeExtractQueues,
  retryPaperExtract,
} from "../literature/extract/literature-extract-queue";
import {
  getPaperExtractAbsPath,
  getPaperExtractState,
  listPaperExtractStates,
  readExtractBlocks,
  readExtractMarkdown,
} from "../literature/extract/paper-extract-db";
import { readPaperPdfContent } from "../literature/extract/paper-extract-read";
import { testMineruConnection } from "../literature/extract/mineru-client";
import { getSettings } from "../app/settings";

export function registerLiteratureExtractHandlers(): void {
  ipcMain.handle(
    "extract:enqueue",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource; force?: boolean },
    ) => {
      await enqueuePaperExtract(args.projectRoot, args.paperId, args.source, {
        force: args.force,
      });
      return { ok: true };
    },
  );

  ipcMain.handle(
    "extract:cancel",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource },
    ) => {
      cancelPaperExtract(args.projectRoot, args.paperId, args.source);
      return { ok: true };
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
      const state = getPaperExtractState(args.projectRoot, args.paperId, args.source);
      if (!state || state.status !== "ready" || !state.mdPath) {
        return { state, markdown: null as string | null };
      }
      return {
        state,
        markdown: readExtractMarkdown(args.projectRoot, state),
      };
    },
  );

  ipcMain.handle(
    "extract:getBlocks",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source?: PaperExtractSource },
    ) => {
      const source = args.source ?? "mineru";
      const state = getPaperExtractState(args.projectRoot, args.paperId, source);
      if (!state || state.status !== "ready") {
        return { state, blocks: null };
      }
      const blocks = readExtractBlocks(args.projectRoot, args.paperId, source);
      return { state, blocks };
    },
  );

  ipcMain.handle(
    "extract:openMd",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource },
    ) => {
      const state = getPaperExtractState(args.projectRoot, args.paperId, args.source);
      if (!state?.mdPath) return { relativePath: null as string | null };
      const abs = getPaperExtractAbsPath(args.projectRoot, state.mdPath);
      const relativePath = abs.startsWith(args.projectRoot)
        ? abs.slice(args.projectRoot.length + 1)
        : state.mdPath;
      return { relativePath };
    },
  );

  ipcMain.handle("extract:testMineru", async (_event, args: { token?: string }) => {
    const token = args.token ?? (getSettings().mineruApiToken as string | undefined) ?? "";
    return testMineruConnection(token);
  });

  ipcMain.handle(
    "extract:resume",
    async (_event, args: { projectRoot: string }) => {
      resumeExtractQueues(args.projectRoot);
      return { ok: true };
    },
  );

  ipcMain.handle(
    "extract:retry",
    async (
      _event,
      args: { projectRoot: string; paperId: string; source: PaperExtractSource },
    ) => {
      retryPaperExtract(args.projectRoot, args.paperId, args.source);
      return { ok: true };
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
      return enqueueBatchPaperExtract(args.projectRoot, args.paperIds, args.source, {
        force: args.force,
      });
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
      return enqueueCollectionExtract(args.projectRoot, args.collectionId, args.source, {
        force: args.force,
      });
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
      const settings = getSettings();
      const token = settings.mineruApiToken;
      const tokenPresent = typeof token === "string" && token.trim().length > 0;
      return readPaperPdfContent(
        { ...args, initiatedBy: "user", waitTimeoutMs: 5 * 60_000 },
        tokenPresent,
      );
    },
  );
}
