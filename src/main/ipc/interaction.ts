import { ipcMain } from "electron";
import {
  listInteractionIds,
  readInteractionSpec,
  writeInteractionSpec,
} from "../interaction/interaction-store";
import type { InteractionSpec } from "../../shared/interaction/spec";
import { getRemoteSessionBroker } from "./remote";
import { routeHostDomainMethod } from "../remote/domain-route";

async function routeIfRemote(method: string, args: unknown): Promise<unknown | undefined> {
  return routeHostDomainMethod(method, args, {
    keys: ["projectRoot"],
    broker: getRemoteSessionBroker(),
    disconnected(name) {
      if (name === "interaction:get") {
        return { hit: true, result: { spec: null, error: "not_connected" } };
      }
      if (name === "interaction:list") {
        return { hit: true, result: { ids: [] } };
      }
      if (name === "interaction:write") {
        return { hit: true, result: { ok: false, error: "not_connected" } };
      }
      return { hit: false };
    },
  });
}

export function registerInteractionHandlers(): void {
  ipcMain.handle(
    "interaction:get",
    async (_event, args: { projectRoot: string; id: string }) => {
      const remote = await routeIfRemote("interaction:get", args);
      if (remote !== undefined) return remote;
      return readInteractionSpec(args.projectRoot, args.id);
    },
  );

  ipcMain.handle(
    "interaction:list",
    async (_event, args: { projectRoot: string }) => {
      const remote = await routeIfRemote("interaction:list", args);
      if (remote !== undefined) return remote;
      return { ids: listInteractionIds(args.projectRoot) };
    },
  );

  ipcMain.handle(
    "interaction:write",
    async (_event, args: { projectRoot: string; spec: InteractionSpec }) => {
      const remote = await routeIfRemote("interaction:write", args);
      if (remote !== undefined) return remote;
      return writeInteractionSpec(args.projectRoot, args.spec);
    },
  );
}
