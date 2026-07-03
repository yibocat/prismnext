import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";
import { createLogger } from "./logger";
import { runAiBashFromBridgeRequest } from "./ai-bash-runner";
import { getTerminalBridgeRoot } from "./prism-bridge-paths";

const log = createLogger("terminal-bridge", "agent");

function getBridgeRoot(): string {
  return getTerminalBridgeRoot();
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
const processing = new Set<string>();

interface BridgeRequest {
  command: string;
  cwd: string;
  description?: string;
  sessionId?: string;
  chatTabId?: string;
  rendererTabId?: string;
  requestId?: string;
  toolCallId?: string;
}

async function processSessionDir(sessionDir: string): Promise<void> {
  if (!existsSync(sessionDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(sessionDir);
  } catch {
    return;
  }

  const sessionDirName = basename(sessionDir);

  for (const name of entries) {
    if (!name.endsWith(".request.json")) continue;
    const reqPath = join(sessionDir, name);
    const requestId = name.replace(".request.json", "");
    const resPath = join(sessionDir, `${requestId}.result.json`);
    if (processing.has(reqPath) || existsSync(resPath)) continue;

    processing.add(reqPath);
    try {
      const raw = readFileSync(reqPath, "utf-8");
      const req = JSON.parse(raw) as BridgeRequest;
      const sessionId = req.sessionId || req.chatTabId || sessionDirName;
      await runAiBashFromBridgeRequest(sessionId, sessionDirName, requestId, req);
      try { unlinkSync(reqPath); } catch {}
    } catch (err) {
      log.warn("bridge request failed", { error: String(err) });
      try { unlinkSync(reqPath); } catch {}
    } finally {
      processing.delete(reqPath);
    }
  }
}

async function pollBridge(): Promise<void> {
  mkdirSync(getBridgeRoot(), { recursive: true });
  let sessions: string[];
  try {
    sessions = readdirSync(getBridgeRoot());
  } catch {
    return;
  }
  await Promise.all(
    sessions
      .filter((s) => s !== "sessions")
      .map((s) => processSessionDir(join(getBridgeRoot(), s))),
  );
}

/** Start polling the terminal bridge for bash tool requests (pty mode). */
export function startTerminalBridge(): void {
  if (pollTimer) return;
  mkdirSync(getBridgeRoot(), { recursive: true });
  pollTimer = setInterval(() => {
    void pollBridge();
  }, 50);
  log.info("Terminal bridge started (PTY stream)");
}

export function stopTerminalBridge(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export { setAiBashRunnerWindow as setTerminalBridgeWindow } from "./ai-bash-runner";

/** @internal Test helper */
export async function processBridgeOnceForTests(): Promise<void> {
  await pollBridge();
}
