import { BrowserWindow, ipcMain } from "electron";
import { rewriteHostEventPaths } from "../../shared/remote";
import { planTypstPreviewForwards } from "../../shared/typst/preview-tunnel";
import type {
  TypstDidChangeArgs,
  TypstDidCloseArgs,
  TypstDidOpenArgs,
  TypstEnsureSessionArgs,
  TypstIpcError,
  TypstPreviewStartArgs,
  TypstPreviewStopArgs,
} from "../../shared/typst/session";
import { isTypstIpcError, isTypstPreviewReadyEvent } from "../../shared/typst/session";
import { remoteProfileFromArgs, routeHostDomainMethod } from "../remote/domain-route";
import { ensureTypstPreviewForwards, rewriteReadyEventForLaptop } from "../remote/typst-preview-tunnel";
import { getRemoteSessionBroker } from "./remote";
import {
  ensureTinymistSession,
  type TinymistSession,
} from "../compile/tinymist-session";

const NOT_CONNECTED: TypstIpcError = { error: "not_connected" };

async function routeIfRemote(method: string, args: unknown): Promise<unknown | undefined> {
  return routeHostDomainMethod(method, args, {
    keys: ["projectRoot"],
    broker: getRemoteSessionBroker(),
    disconnected() {
      return { hit: true, result: NOT_CONNECTED };
    },
  });
}

async function settleRemoteTypst(
  method: string,
  args: unknown,
  remote: unknown,
): Promise<unknown> {
  if (method !== "typst:previewStart") return remote;
  if (isTypstIpcError(remote)) return remote;
  if (!isTypstPreviewReadyEvent(remote)) return remote;
  const profileId = remoteProfileFromArgs(args, ["projectRoot"]);
  if (!profileId) return remote;
  const withLaptopRoot = rewriteHostEventPaths(remote, profileId);
  if (!isTypstPreviewReadyEvent(withLaptopRoot)) return withLaptopRoot;
  const plan = planTypstPreviewForwards({
    previewUrl: withLaptopRoot.previewUrl,
    staticServerPort: withLaptopRoot.staticServerPort,
    dataPlanePort: withLaptopRoot.dataPlanePort,
  });
  const map = await ensureTypstPreviewForwards(
    profileId,
    plan,
    (remotePort, localPort) => getRemoteSessionBroker().openLocalForward(profileId, remotePort, localPort),
  );
  const tunneled = rewriteReadyEventForLaptop(withLaptopRoot, plan, map);
  broadcast("typst:previewReady", tunneled);
  return tunneled;
}

async function handleRemote(method: string, args: unknown): Promise<unknown | undefined> {
  try {
    const remote = await routeIfRemote(method, args);
    if (remote === undefined) return undefined;
    return await settleRemoteTypst(method, args, remote);
  } catch (err) {
    return asError(err);
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function bindSession(
  session: TinymistSession,
  projectRoot: string,
): TinymistSession {
  session.onDiagnostics = (items) => {
    const compileRoot = session.activePreviewRoots()[0] ?? "";
    broadcast("typst:diagnostics", { projectRoot, compileRoot, items });
  };
  session.onScrollSource = (event) => broadcast("typst:scrollTo", event);
  session.onPreviewReady = (event) => broadcast("typst:previewReady", event);
  return session;
}

function asError(err: unknown): TypstIpcError {
  return { error: err instanceof Error ? err.message : String(err) };
}

export function registerTypstHandlers(): void {
  ipcMain.handle("typst:ensureSession", async (_event, args: TypstEnsureSessionArgs) => {
    const remote = await handleRemote("typst:ensureSession", args);
    if (remote !== undefined) return remote;
    try {
      bindSession(await ensureTinymistSession(args.projectRoot), args.projectRoot);
      return { ok: true as const };
    } catch (err) {
      return asError(err);
    }
  });

  ipcMain.handle("typst:didOpen", async (_event, args: TypstDidOpenArgs) => {
    const remote = await handleRemote("typst:didOpen", args);
    if (remote !== undefined) return remote;
    try {
      const session = bindSession(await ensureTinymistSession(args.projectRoot), args.projectRoot);
      await session.didOpen(args);
      return { ok: true as const };
    } catch (err) {
      return asError(err);
    }
  });

  ipcMain.handle("typst:didChange", async (_event, args: TypstDidChangeArgs) => {
    const remote = await handleRemote("typst:didChange", args);
    if (remote !== undefined) return remote;
    try {
      const session = bindSession(await ensureTinymistSession(args.projectRoot), args.projectRoot);
      await session.didChange(args);
      return { ok: true as const };
    } catch (err) {
      return asError(err);
    }
  });

  ipcMain.handle("typst:didClose", async (_event, args: TypstDidCloseArgs) => {
    const remote = await handleRemote("typst:didClose", args);
    if (remote !== undefined) return remote;
    try {
      const session = bindSession(await ensureTinymistSession(args.projectRoot), args.projectRoot);
      await session.didClose(args);
      return { ok: true as const };
    } catch (err) {
      return asError(err);
    }
  });

  ipcMain.handle("typst:previewStart", async (_event, args: TypstPreviewStartArgs) => {
    const remote = await handleRemote("typst:previewStart", args);
    if (remote !== undefined) return remote;
    try {
      const session = bindSession(
        await ensureTinymistSession(args.projectRoot),
        args.projectRoot,
      );
      const ready = await session.startPreview(args.compileRoot);
      broadcast("typst:previewReady", ready);
      return ready;
    } catch (err) {
      return asError(err);
    }
  });

  ipcMain.handle("typst:previewStop", async (_event, args: TypstPreviewStopArgs) => {
    const remote = await handleRemote("typst:previewStop", args);
    if (remote !== undefined) return remote;
    try {
      const session = await ensureTinymistSession(args.projectRoot);
      await session.stopPreview(args.compileRoot);
      return { ok: true as const };
    } catch (err) {
      return asError(err);
    }
  });
}
