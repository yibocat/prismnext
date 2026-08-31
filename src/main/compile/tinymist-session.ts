/**
 * One `tinymist lsp` process per project root. Preview tasks keyed by compile root.
 */

import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { MessageConnection } from "vscode-jsonrpc/node";
import type { Diagnostic } from "vscode-languageserver-protocol";
import {
  TINYMIST_CMD,
  TINYMIST_INIT_OPTIONS,
  TINYMIST_NOTE,
  parseTinymistScrollSource,
} from "../../shared/typst/lsp";
import type {
  TypstDiagnosticItem,
  TypstDidChangeArgs,
  TypstDidCloseArgs,
  TypstDidOpenArgs,
  TypstPreviewReadyEvent,
  TypstScrollToEvent,
} from "../../shared/typst/session";
import { typstFileUri, typstRelFromUri, normalizeTypstRel } from "../../shared/typst/uri";
import { createLogger } from "../app/logger";
import { resolveTinymistBinary, tinymistUnavailableError } from "./tinymist-binary";
import { spawnTinymistLsp, type TinymistRpc } from "./tinymist-rpc";

const log = createLogger("tinymist-session", "compile");
const INIT_TIMEOUT_MS = 20_000;
const PREVIEW_TIMEOUT_MS = 30_000;

export type TinymistPreviewLaunch = {
  staticServerPort?: number;
  staticServerAddr?: string;
  dataPlanePort?: number;
  isPrimary?: boolean;
};

export function previewUrlFromLaunch(result: TinymistPreviewLaunch): string {
  const addr = result.staticServerAddr?.trim();
  if (addr) {
    if (addr.startsWith("http://") || addr.startsWith("https://")) {
      return addr.endsWith("/") ? addr : `${addr}/`;
    }
    return `http://${addr.replace(/\/+$/, "")}/`;
  }
  const port = result.staticServerPort;
  if (typeof port === "number" && port > 0) {
    return `http://127.0.0.1:${port}/`;
  }
  throw new Error("Tinymist preview did not return staticServerPort");
}

function asPreviewLaunch(value: unknown): TinymistPreviewLaunch {
  if (!value || typeof value !== "object") return {};
  const rec = value as Record<string, unknown>;
  return {
    staticServerPort: typeof rec.staticServerPort === "number" ? rec.staticServerPort : undefined,
    staticServerAddr: typeof rec.staticServerAddr === "string" ? rec.staticServerAddr : undefined,
    dataPlanePort: typeof rec.dataPlanePort === "number" ? rec.dataPlanePort : undefined,
    isPrimary: typeof rec.isPrimary === "boolean" ? rec.isPrimary : undefined,
  };
}

export function tinymistInitializeParams(projectRoot: string) {
  const rootUri = pathToFileURL(projectRoot).href;
  return {
    processId: process.pid,
    rootUri,
    capabilities: {
      workspace: { executeCommand: { dynamicRegistration: false } },
      textDocument: {
        synchronization: { didSave: true },
        publishDiagnostics: {},
      },
    },
    initializationOptions: TINYMIST_INIT_OPTIONS,
    workspaceFolders: [{ uri: rootUri, name: "project" }],
  };
}

function sessionKey(projectRoot: string): string {
  return projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
}

function diagnosticMessage(message: Diagnostic["message"]): string {
  if (typeof message === "string") return message;
  return message?.value ?? "";
}

function diagnosticSeverity(sev: Diagnostic["severity"]): TypstDiagnosticItem["severity"] {
  if (sev === 1) return "error";
  if (sev === 2) return "warning";
  return "info";
}

type PreviewSlot = {
  taskId: string;
  compileRoot: string;
  previewUrl: string;
  staticServerPort: number;
  dataPlanePort: number;
};

export class TinymistSession {
  readonly projectRoot: string;
  private readonly rpc: TinymistRpc;
  private readonly connection: MessageConnection;
  private readonly previews = new Map<string, PreviewSlot>();
  private readonly openVersions = new Map<string, number>();
  private readonly diagnosticsByUri = new Map<string, TypstDiagnosticItem[]>();
  private opChain: Promise<void> = Promise.resolve();
  alive = true;

  onDiagnostics: ((items: TypstDiagnosticItem[]) => void) | null = null;
  onScrollSource: ((event: TypstScrollToEvent) => void) | null = null;
  onPreviewReady: ((event: TypstPreviewReadyEvent) => void) | null = null;

  activePreviewRoots(): string[] {
    return [...this.previews.keys()];
  }

  private constructor(projectRoot: string, rpc: TinymistRpc) {
    this.projectRoot = projectRoot;
    this.rpc = rpc;
    this.connection = rpc.connection;
    this.connection.onNotification("textDocument/publishDiagnostics", (params: {
      uri: string;
      diagnostics: Diagnostic[];
    }) => {
      const items: TypstDiagnosticItem[] = [];
      for (const diag of params.diagnostics ?? []) {
        const relPath = typstRelFromUri(this.projectRoot, params.uri) ?? normalizeTypstRel(params.uri);
        const line = diag.range?.start?.line;
        items.push({
          relPath,
          severity: diagnosticSeverity(diag.severity),
          message: diagnosticMessage(diag.message),
          line: typeof line === "number" ? line + 1 : undefined,
          character: diag.range?.start?.character,
        });
      }
      this.diagnosticsByUri.set(params.uri, items);
      this.onDiagnostics?.([...this.diagnosticsByUri.values()].flat());
    });
    this.connection.onNotification(TINYMIST_NOTE.scrollSource, (jump: unknown) => {
      const event = parseTinymistScrollSource(this.projectRoot, jump);
      if (event) this.onScrollSource?.(event);
    });
    this.connection.onNotification(TINYMIST_NOTE.dispose, (payload: { taskId?: string }) => {
      if (!payload?.taskId) return;
      for (const [compileRoot, slot] of this.previews) {
        if (slot.taskId === payload.taskId) this.previews.delete(compileRoot);
      }
    });
    rpc.child.on("exit", () => {
      this.alive = false;
    });
  }

  static async start(binaryPath: string, projectRoot: string): Promise<TinymistSession> {
    const rpc = spawnTinymistLsp(binaryPath, projectRoot);
    try {
      await Promise.race([
        rpc.connection.sendRequest("initialize", tinymistInitializeParams(projectRoot)),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("tinymist initialize timed out")), INIT_TIMEOUT_MS);
        }),
      ]);
      rpc.connection.sendNotification("initialized", {});
    } catch (err) {
      await rpc.dispose();
      throw err;
    }
    return new TinymistSession(projectRoot, rpc);
  }

  private enqueue<T>(op: () => T | Promise<T>): Promise<T> {
    const run = this.opChain.then(op, op);
    this.opChain = run.then(() => undefined, () => undefined);
    return run;
  }

  async didOpen(args: TypstDidOpenArgs): Promise<void> {
    return this.enqueue(() => this.didOpenNow(args));
  }

  private didOpenNow(args: TypstDidOpenArgs): void {
    const relPath = normalizeTypstRel(args.relPath);
    this.openVersions.set(relPath, args.version);
    this.connection.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: typstFileUri(this.projectRoot, relPath),
        languageId: args.languageId ?? "typst",
        version: args.version,
        text: args.text,
      },
    });
  }

  async didChange(args: TypstDidChangeArgs): Promise<void> {
    return this.enqueue(() => {
      const relPath = normalizeTypstRel(args.relPath);
      if (!this.openVersions.has(relPath)) {
        this.didOpenNow(args);
        return;
      }
      this.openVersions.set(relPath, args.version);
      this.connection.sendNotification("textDocument/didChange", {
        textDocument: {
          uri: typstFileUri(this.projectRoot, relPath),
          version: args.version,
        },
        contentChanges: [{ text: args.text }],
      });
    });
  }

  async didClose(args: TypstDidCloseArgs): Promise<void> {
    return this.enqueue(() => {
      const relPath = normalizeTypstRel(args.relPath);
      this.openVersions.delete(relPath);
      this.connection.sendNotification("textDocument/didClose", {
        textDocument: { uri: typstFileUri(this.projectRoot, relPath) },
      });
    });
  }

  async startPreview(compileRoot: string): Promise<TypstPreviewReadyEvent> {
    return this.enqueue(() => this.startPreviewNow(compileRoot));
  }

  private async startPreviewNow(compileRoot: string): Promise<TypstPreviewReadyEvent> {
    const rel = normalizeTypstRel(compileRoot);
    const existing = this.previews.get(rel);
    if (existing) {
      await this.stopPreviewNow(rel);
    }
    const taskId = randomBytes(6).toString("hex");
    const absMain = join(this.projectRoot, rel);
    const previewArgs = [
      "--task-id",
      taskId,
      "--data-plane-host",
      "127.0.0.1:0",
      "--control-plane-host",
      "127.0.0.1:0",
      "--invert-colors",
      "never",
      "--no-open",
      absMain,
    ];
    const raw = await Promise.race([
      this.connection.sendRequest("workspace/executeCommand", {
        command: TINYMIST_CMD.startPreview,
        arguments: [previewArgs],
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("tinymist preview timed out")), PREVIEW_TIMEOUT_MS);
      }),
    ]);
    const launch = asPreviewLaunch(raw);
    const previewUrl = previewUrlFromLaunch(launch);
    const fromUrl = Number(new URL(previewUrl).port);
    const staticServerPort = (typeof launch.staticServerPort === "number" && launch.staticServerPort > 0)
      ? launch.staticServerPort
      : (Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : 0);
    const dataPlanePort = (typeof launch.dataPlanePort === "number" && launch.dataPlanePort > 0)
      ? launch.dataPlanePort
      : staticServerPort;
    const slot: PreviewSlot = {
      taskId,
      compileRoot: rel,
      previewUrl,
      staticServerPort,
      dataPlanePort,
    };
    this.previews.set(rel, slot);
    const event: TypstPreviewReadyEvent = {
      projectRoot: this.projectRoot,
      compileRoot: rel,
      previewUrl,
      taskId,
      staticServerPort,
      dataPlanePort,
    };
    this.onPreviewReady?.(event);
    log.info("preview started", { compileRoot: rel, previewUrl, taskId });
    return event;
  }

  async stopPreview(compileRoot: string): Promise<void> {
    return this.enqueue(() => this.stopPreviewNow(compileRoot));
  }

  private async stopPreviewNow(compileRoot: string): Promise<void> {
    const rel = normalizeTypstRel(compileRoot);
    const slot = this.previews.get(rel);
    if (!slot) return;
    this.previews.delete(rel);
    try {
      await this.connection.sendRequest("workspace/executeCommand", {
        command: TINYMIST_CMD.killPreview,
        arguments: [slot.taskId],
      });
    } catch (err) {
      log.warn("kill preview failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  async dispose(): Promise<void> {
    this.alive = false;
    for (const compileRoot of [...this.previews.keys()]) {
      await this.stopPreviewNow(compileRoot).catch(() => undefined);
    }
    await this.rpc.dispose();
  }

  kill(): void {
    this.alive = false;
    if (!this.rpc.child.killed && this.rpc.child.exitCode === null) {
      this.rpc.child.kill();
    }
  }
}

const sessions = new Map<string, TinymistSession>();
const starting = new Map<string, Promise<TinymistSession>>();

export async function ensureTinymistSession(projectRoot: string): Promise<TinymistSession> {
  const key = sessionKey(projectRoot);
  const existing = sessions.get(key);
  if (existing?.alive) return existing;
  if (existing) sessions.delete(key);
  const inFlight = starting.get(key);
  if (inFlight) return inFlight;
  const boot = (async () => {
    const bin = await resolveTinymistBinary({ force: true });
    if (!bin.available) throw new Error(tinymistUnavailableError());
    const session = await TinymistSession.start(bin.path, projectRoot);
    sessions.set(key, session);
    return session;
  })();
  starting.set(key, boot);
  try {
    return await boot;
  } finally {
    if (starting.get(key) === boot) starting.delete(key);
  }
}

export async function disposeTinymistSession(projectRoot: string): Promise<void> {
  const key = sessionKey(projectRoot);
  const boot = starting.get(key);
  if (boot) {
    starting.delete(key);
    const session = await boot.catch(() => undefined);
    if (session) await session.dispose().catch(() => undefined);
    if (sessions.get(key) === session) sessions.delete(key);
    return;
  }
  const session = sessions.get(key);
  if (!session) return;
  sessions.delete(key);
  await session.dispose();
}

export async function disposeAllTinymistSessions(): Promise<void> {
  const boots = [...starting.values()];
  starting.clear();
  const all = [...sessions.values()];
  sessions.clear();
  await Promise.all([
    ...boots.map((boot) => boot.then((session) => session.dispose()).catch(() => undefined)),
    ...all.map((session) => session.dispose().catch(() => undefined)),
  ]);
}

/** Sync kill for `before-quit` — do not await LSP shutdown. */
export function killAllTinymistSessions(): void {
  const boots = [...starting.values()];
  starting.clear();
  const all = [...sessions.values()];
  sessions.clear();
  for (const session of all) session.kill();
  for (const boot of boots) {
    void boot.then((session) => session.kill()).catch(() => undefined);
  }
}

export function getTinymistSession(projectRoot: string): TinymistSession | undefined {
  return sessions.get(sessionKey(projectRoot));
}
