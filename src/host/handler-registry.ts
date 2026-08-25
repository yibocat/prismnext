import type { HostHandlerContext } from "./context";
import { fsHandlers } from "./fs-handlers";
import { projectHandlers } from "./project-handlers";
import { terminalHandlers } from "./terminal-handlers";

export type { HostHandlerContext };

type HostHandler = (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>;

const handlers: Record<string, HostHandler> = {
  ...fsHandlers,
  ...projectHandlers,
  ...terminalHandlers,
};

export function createHostContext(): HostHandlerContext {
  return {
    remoteRoot: null,
    projectId: null,
    emit: () => undefined,
  };
}

export async function dispatchHostMethod(
  method: string,
  params: unknown,
  ctx: HostHandlerContext,
): Promise<unknown> {
  const handler = handlers[method];
  if (!handler) {
    throw new Error(`unknown method: ${method}`);
  }
  const rec = params && typeof params === "object" && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  return handler(rec, ctx);
}
