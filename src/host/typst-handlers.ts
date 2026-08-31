import { setHostEvents } from "../main/app/event-sink";
import {
  ensureTinymistSession,
  type TinymistSession,
} from "../main/compile/tinymist-session";
import type {
  TypstDidChangeArgs,
  TypstDidCloseArgs,
  TypstDidOpenArgs,
  TypstIpcError,
  TypstPreviewStartArgs,
  TypstPreviewStopArgs,
} from "../shared/typst/session";
import type { HostHandlerContext } from "./context";

function projectRoot(params: Record<string, unknown>, ctx: HostHandlerContext): string {
  return typeof params.projectRoot === "string" && params.projectRoot.trim()
    ? params.projectRoot
    : ctx.remoteRoot ?? "";
}

function asError(err: unknown): TypstIpcError {
  return { error: err instanceof Error ? err.message : String(err) };
}

function bindSession(
  session: TinymistSession,
  root: string,
  ctx: HostHandlerContext,
): TinymistSession {
  session.onDiagnostics = (items) => {
    ctx.emit("typst:diagnostics", {
      projectRoot: root,
      compileRoot: session.activePreviewRoots()[0] ?? "",
      items,
    });
  };
  session.onScrollSource = (event) => ctx.emit("typst:scrollTo", event);
  // Laptop rewrites previewUrl after SSH -L. Do not emit Host 127.0.0.1 here.
  session.onPreviewReady = null;
  return session;
}

export function installTypstEvents(ctx: HostHandlerContext): void {
  setHostEvents({
    broadcast(channel, payload) {
      ctx.emit(channel, payload);
    },
    sendToOriginThenBroadcast(channel, payload) {
      ctx.emit(channel, payload);
    },
  });
}

export const typstHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "typst:ensureSession"(params, ctx) {
    const root = projectRoot(params, ctx);
    try {
      bindSession(await ensureTinymistSession(root), root, ctx);
      return { ok: true as const };
    } catch (err) {
      return asError(err);
    }
  },

  async "typst:didOpen"(params, ctx) {
    const args = params as unknown as TypstDidOpenArgs;
    const root = projectRoot(params, ctx);
    try {
      const session = bindSession(await ensureTinymistSession(root), root, ctx);
      await session.didOpen({ ...args, projectRoot: root });
      return { ok: true as const };
    } catch (err) {
      return asError(err);
    }
  },

  async "typst:didChange"(params, ctx) {
    const args = params as unknown as TypstDidChangeArgs;
    const root = projectRoot(params, ctx);
    try {
      const session = bindSession(await ensureTinymistSession(root), root, ctx);
      await session.didChange({ ...args, projectRoot: root });
      return { ok: true as const };
    } catch (err) {
      return asError(err);
    }
  },

  async "typst:didClose"(params, ctx) {
    const args = params as unknown as TypstDidCloseArgs;
    const root = projectRoot(params, ctx);
    try {
      const session = bindSession(await ensureTinymistSession(root), root, ctx);
      await session.didClose({ ...args, projectRoot: root });
      return { ok: true as const };
    } catch (err) {
      return asError(err);
    }
  },

  async "typst:previewStart"(params, ctx) {
    const args = params as unknown as TypstPreviewStartArgs;
    const root = projectRoot(params, ctx);
    try {
      const session = bindSession(await ensureTinymistSession(root), root, ctx);
      return await session.startPreview(args.compileRoot);
    } catch (err) {
      return asError(err);
    }
  },

  async "typst:previewStop"(params, ctx) {
    const args = params as unknown as TypstPreviewStopArgs;
    const root = projectRoot(params, ctx);
    try {
      const session = await ensureTinymistSession(root);
      await session.stopPreview(args.compileRoot);
      return { ok: true as const };
    } catch (err) {
      return asError(err);
    }
  },
};
