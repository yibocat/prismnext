import {
  listInteractionIds,
  readInteractionSpec,
  writeInteractionSpec,
} from "../main/interaction/interaction-store";
import type { InteractionSpec } from "../shared/interaction/spec";
import type { HostHandlerContext } from "./context";

function rootOf(params: Record<string, unknown>, ctx: HostHandlerContext): string {
  return typeof params.projectRoot === "string" && params.projectRoot.trim()
    ? params.projectRoot
    : ctx.remoteRoot ?? "";
}

export const interactionHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "interaction:get"(params, ctx) {
    return readInteractionSpec(rootOf(params, ctx), String(params.id ?? ""));
  },
  async "interaction:list"(params, ctx) {
    return { ids: listInteractionIds(rootOf(params, ctx)) };
  },
  async "interaction:write"(params, ctx) {
    return writeInteractionSpec(rootOf(params, ctx), params.spec as InteractionSpec);
  },
};
