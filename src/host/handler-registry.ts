import { hostModelProviderIds, RemoteOperationError, sanitizeHostModelKeyMap } from "../shared/remote";
import type { HostHandlerContext } from "./context";
import { compileHandlers } from "./compile-handlers";
import { experimentHandlers, installExperimentEvents } from "./experiment-handlers";
import { fsHandlers } from "./fs-handlers";
import { literatureHandlers, installLiteratureEvents } from "./literature-handlers";
import { decodeHostModelWrapKey, mergeHostModelSettings, readHostModelSettings } from "./model-settings";
import { setHostModelProxyEnabled, setHostModelProxyExtraBaseUrls } from "./model-proxy-transport";
import { projectHandlers } from "./project-handlers";
import { sessionHandlers } from "./session-handlers";
import { settingsHandlers } from "./settings-handlers";
import { terminalHandlers } from "./terminal-handlers";

export type { HostHandlerContext };

type HostHandler = (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>;

const handlers: Record<string, HostHandler> = {
  ...fsHandlers,
  ...projectHandlers,
  ...terminalHandlers,
  ...literatureHandlers,
  ...experimentHandlers,
  ...compileHandlers,
  ...settingsHandlers,
  ...sessionHandlers,
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
    const providerIds = hostModelProviderIds(readHostModelSettings().aiApiKeys);
    const wrapOk = Boolean(decodeHostModelWrapKey(params.wrapKey));
    return {
      ok: true,
      modelKeys: ctx.modelKeys,
      providerIds,
      wrapOk,
      persisted: ctx.modelKeys === "remote" && wrapOk && providerIds.length > 0,
    };
  },
  async "host.reattach"(params, ctx) {
    const incoming = typeof params.connectionId === "string" ? params.connectionId.trim() : "";
    if (ctx.ownerConnectionId && incoming && ctx.ownerConnectionId !== incoming) {
      throw new RemoteOperationError(
        "displaced",
        "Another computer took over this Host. Disconnect and connect again from this computer if you need it.",
      );
    }
    if (incoming) ctx.ownerConnectionId = incoming;
    return {
      ok: true,
      remoteRoot: ctx.remoteRoot,
      projectId: ctx.projectId,
      ownerConnectionId: ctx.ownerConnectionId ?? incoming,
    };
  },
};

export function createHostContext(): HostHandlerContext {
  return {
    remoteRoot: null,
    projectId: null,
    emit: () => undefined,
    modelKeys: "remote",
    ownerConnectionId: null,
  };
}

export function listRegisteredHostMethods(): string[] {
  return Object.keys(handlers);
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
  if (method.startsWith("literature:") || method.startsWith("extract:")) {
    installLiteratureEvents(ctx);
  }
  if (method.startsWith("experiment:") || method.startsWith("execution:")) {
    installExperimentEvents(ctx);
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
