import { ipcMain } from "electron";
import {
  clearInteractionLastError,
  listInteractionIds,
  readInteractionSpec,
  writeInteractionLastError,
  writeInteractionSpec,
} from "../services/interaction-store";
import type { InteractionSpec } from "../../shared/interaction-spec";

export function registerInteractionHandlers(): void {
  ipcMain.handle(
    "interaction:get",
    async (_event, args: { projectRoot: string; id: string }) => {
      return readInteractionSpec(args.projectRoot, args.id);
    },
  );

  ipcMain.handle(
    "interaction:list",
    async (_event, args: { projectRoot: string }) => {
      return { ids: listInteractionIds(args.projectRoot) };
    },
  );

  ipcMain.handle(
    "interaction:write",
    async (_event, args: { projectRoot: string; spec: InteractionSpec }) => {
      return writeInteractionSpec(args.projectRoot, args.spec);
    },
  );

  /** Renderer reports scene load/mount outcomes for Agent feedback via interaction-read. */
  ipcMain.handle(
    "interaction:reportSceneError",
    async (
      _event,
      args: {
        projectRoot: string;
        id: string;
        error: string | null;
        phase?: "load" | "mount" | "update";
      },
    ) => {
      const projectRoot = typeof args.projectRoot === "string" ? args.projectRoot : "";
      const id = typeof args.id === "string" ? args.id.trim() : "";
      if (!projectRoot || !id) return { ok: false, error: "missing projectRoot or id" };
      if (args.error == null || !String(args.error).trim()) {
        return clearInteractionLastError(projectRoot, id);
      }
      return writeInteractionLastError(projectRoot, id, {
        message: String(args.error),
        phase: args.phase,
      });
    },
  );
}
