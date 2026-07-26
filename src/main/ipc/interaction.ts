import { ipcMain } from "electron";
import {
  listInteractionIds,
  readInteractionSpec,
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
}
