import { sanitizeHostModelKeyMap } from "../shared/remote";
import type { HostHandlerContext } from "./context";
import { fsHandlers } from "./fs-handlers";
import { mergeHostModelSettings } from "./model-settings";
import { setHostModelProxyEnabled, setHostModelProxyExtraBaseUrls } from "./model-proxy-transport";
import { projectHandlers } from "./project-handlers";
import { terminalHandlers } from "./terminal-handlers";

export type { HostHandlerContext };

type HostHandler = (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>;

const handlers: Record<string, HostHandler> = {
  ...fsHandlers,
  ...projectHandlers,
  ...terminalHandlers,
  async "host.configure"(params, ctx) {
    ctx.modelKeys = params.modelKeys === "gateway" ? "gateway" : "remote";
    const seededUrls = params.aiBaseUrls && typeof params.aiBaseUrls === "object" && !Array.isArray(params.aiBaseUrls)
      ? Object.values(params.aiBaseUrls).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    ctx.extraBaseUrls = Array.isArray(params.extraBaseUrls)
      ? params.extraBaseUrls.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : seededUrls;
    if (ctx.modelKeys === "remote") {
      mergeHostModelSettings({
        aiApiKeys: sanitizeHostModelKeyMap(params.aiApiKeys),
        aiBaseUrls: params.aiBaseUrls && typeof params.aiBaseUrls === "object" && !Array.isArray(params.aiBaseUrls)
          ? Object.fromEntries(
            Object.entries(params.aiBaseUrls as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          )
          : undefined,
      }, typeof params.wrapKey === "string" ? params.wrapKey : undefined);
    }
    setHostModelProxyEnabled(ctx.modelKeys === "gateway");
    setHostModelProxyExtraBaseUrls(ctx.extraBaseUrls);
    return { ok: true, modelKeys: ctx.modelKeys };
  },
};

export function createHostContext(): HostHandlerContext {
  return {
    remoteRoot: null,
    projectId: null,
    emit: () => undefined,
    modelKeys: "remote",
  };
}

export async function dispatchHostMethod(
  method: string,
  params: unknown,
  ctx: HostHandlerContext,
): Promise<unknown> {
  if (method.startsWith("agent:") || method === "model.proxy.push") {
    const { agentHandlers, bootHostAgent } = await import("./agent-server");
    if (!ctx.agent) bootHostAgent(ctx);
    Object.assign(handlers, agentHandlers);
  }
  const handler = handlers[method];
  if (!handler) {
    throw new Error(`unknown method: ${method}`);
  }
  const rec = params && typeof params === "object" && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  return handler(rec, ctx);
}
