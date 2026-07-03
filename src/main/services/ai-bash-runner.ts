import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { getTerminalBridgeRoot } from "./prism-bridge-paths";
import { runAiCommand } from "./ai-pty";
import { resolveChatTabId } from "./chat-session-registry";
import { createLogger } from "./logger";

const log = createLogger("ai-bash-runner", "agent");

export interface TerminalAiStreamPayload {
  sessionId: string;
  chatTabId: string;
  requestId: string;
  toolCallId?: string;
  chunk: string;
  phase: "output";
}

export interface TerminalAiExitPayload {
  sessionId: string;
  chatTabId: string;
  requestId: string;
  toolCallId?: string;
  exitCode: number;
  cwd: string;
}

export interface RunAiBashJobArgs {
  sessionId: string;
  chatTabId?: string;
  toolCallId: string;
  command: string;
  cwd: string;
}

export interface RunAiBashJobResult {
  output: string;
  exitCode: number;
  cwd: string;
}

function getBridgeRoot(): string {
  return getTerminalBridgeRoot();
}

let mainWindow: BrowserWindow | null = null;
const inFlight = new Map<string, Promise<RunAiBashJobResult>>();

export function setAiBashRunnerWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

function emitAiStream(payload: TerminalAiStreamPayload): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("terminal:aiStream", payload);
}

function emitAiExit(payload: TerminalAiExitPayload): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("terminal:aiExit", payload);
}

function resolveChatTab(sessionId: string, chatTabId?: string): string {
  return chatTabId || resolveChatTabId(sessionId) || sessionId;
}

function jobKey(sessionId: string, toolCallId: string): string {
  return `${sessionId}:${toolCallId}`;
}

/** Register pending bash job before user approves — OpenCode polls bridge by sessionId. */
export function registerBashJobIntent(args: {
  sessionId: string;
  toolCallId: string;
  command: string;
}): void {
  const sessionDir = join(getBridgeRoot(), args.sessionId);
  mkdirSync(sessionDir, { recursive: true });
  try {
    writeFileSync(
      join(sessionDir, ".active-tool.json"),
      JSON.stringify({
        toolCallId: args.toolCallId,
        command: args.command,
        startedAt: Date.now(),
        phase: "awaiting_approval",
      }),
      "utf-8",
    );
  } catch {
    // ignore
  }
}

/** Run one AI bash job (PTY). Deduped per session + toolCallId. */
export function runAiBashJob(args: RunAiBashJobArgs): Promise<RunAiBashJobResult> {
  const key = jobKey(args.sessionId, args.toolCallId);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const chatTabId = resolveChatTab(args.sessionId, args.chatTabId);
  const sessionDir = join(getBridgeRoot(), args.sessionId);
  const streamPath = join(sessionDir, `${args.toolCallId}.stream`);
  const resPath = join(sessionDir, `${args.toolCallId}.result.json`);

  mkdirSync(sessionDir, { recursive: true });
  try {
    writeFileSync(
      join(sessionDir, `${args.toolCallId}.meta.json`),
      JSON.stringify({
        toolCallId: args.toolCallId,
        command: args.command,
        cwd: args.cwd,
        chatTabId,
      }),
      "utf-8",
    );
    writeFileSync(
      join(sessionDir, ".active-tool.json"),
      JSON.stringify({
        toolCallId: args.toolCallId,
        command: args.command,
        startedAt: Date.now(),
      }),
      "utf-8",
    );
  } catch {
    // ignore
  }

  const promise = runAiCommand({
    command: args.command,
    cwd: args.cwd,
    sessionId: args.sessionId,
    chatTabId,
    requestId: args.toolCallId,
    toolCallId: args.toolCallId,
    onChunk: (chunk) => {
      try {
        appendFileSync(streamPath, chunk, "utf-8");
      } catch {
        // ignore
      }
      emitAiStream({
        sessionId: args.sessionId,
        chatTabId,
        requestId: args.toolCallId,
        toolCallId: args.toolCallId,
        chunk,
        phase: "output",
      });
    },
  }).then((result) => {
    writeFileSync(resPath, JSON.stringify(result), "utf-8");
    emitAiExit({
      sessionId: args.sessionId,
      chatTabId,
      requestId: args.toolCallId,
      toolCallId: args.toolCallId,
      exitCode: result.exitCode,
      cwd: result.cwd,
    });
    log.info("AI bash job finished", { chatTabId, exitCode: result.exitCode });
    return result;
  }).finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

/** Poll-based bridge entry (custom bash.ts). */
export async function runAiBashFromBridgeRequest(
  sessionId: string,
  sessionDirName: string,
  requestId: string,
  req: {
    command: string;
    cwd: string;
    toolCallId?: string;
    chatTabId?: string;
    rendererTabId?: string;
  },
): Promise<RunAiBashJobResult> {
  const toolCallId = req.toolCallId || requestId;
  return runAiBashJob({
    sessionId: sessionId || sessionDirName,
    chatTabId: req.rendererTabId || req.chatTabId,
    toolCallId,
    command: req.command,
    cwd: req.cwd || process.cwd(),
  });
}

/** @internal */
export function _resetAiBashRunnerForTests(): void {
  inFlight.clear();
}

/** @internal */
export function _readBridgeResultForTests(sessionId: string, toolCallId: string): RunAiBashJobResult | null {
  const resPath = join(getBridgeRoot(), sessionId, `${toolCallId}.result.json`);
  if (!existsSync(resPath)) return null;
  return JSON.parse(readFileSync(resPath, "utf-8")) as RunAiBashJobResult;
}
