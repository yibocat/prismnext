/**
 * Polls the LaTeX file bridge for OpenCode latex tool requests.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createLogger } from "./logger";
import { getLatexBridgeRoot } from "./prism-bridge-paths";
import { getSessionProjectRoot } from "./chat-session-registry";
import { compileForAgent } from "./latex-service";
import { resolveLatexRoot } from "../lib/latex-root";

const log = createLogger("latex-bridge", "agent");

interface LatexBridgeRequest {
  action: "root" | "compile";
  sessionId?: string;
  projectRoot?: string;
  mainFile?: string;
  useTexlive?: boolean;
}

function bridgeRoot(): string {
  return getLatexBridgeRoot();
}

function resolveProjectRoot(req: LatexBridgeRequest): string {
  const fromSession = req.sessionId ? getSessionProjectRoot(req.sessionId) : undefined;
  return (fromSession || req.projectRoot?.trim() || "").replace(/\\/g, "/");
}

function dispatch(req: LatexBridgeRequest): unknown | Promise<unknown> {
  const projectRoot = resolveProjectRoot(req);
  if (!projectRoot) {
    return {
      error: "Project root unknown for this chat session.",
      hint: "Open a project in Prism and start a new chat tab from that project.",
    };
  }

  switch (req.action) {
    case "root": {
      const resolved = resolveLatexRoot(projectRoot, req.mainFile);
      if (!resolved) {
        return { error: "Could not resolve LaTeX main file.", projectRoot };
      }
      return {
        mainFile: resolved.mainFile,
        absolutePath: resolved.absolutePath,
        engine: resolved.engine,
        bibTool: resolved.bibTool,
        buildDir: resolved.buildDir,
        manuscriptFolder: resolved.manuscriptFolder,
        resolution: resolved.resolution,
      };
    }
    case "compile":
      return compileForAgent(projectRoot, req.mainFile, req.useTexlive === true);
    default:
      return { error: `Unknown latex bridge action: ${String((req as { action?: string }).action)}` };
  }
}

const processingRequests = new Set<string>();
let pollInFlight = false;

async function processSessionDir(sessionDir: string): Promise<void> {
  if (!existsSync(sessionDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(sessionDir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (!name.endsWith(".request.json")) continue;
    const reqPath = join(sessionDir, name);
    const requestId = name.replace(".request.json", "");
    const resPath = join(sessionDir, `${requestId}.result.json`);
    if (existsSync(resPath)) continue;
    if (processingRequests.has(reqPath)) continue;

    processingRequests.add(reqPath);
    try {
      const raw = readFileSync(reqPath, "utf-8");
      const req = JSON.parse(raw) as LatexBridgeRequest;
      const result = await Promise.resolve(dispatch(req));
      writeFileSync(resPath, JSON.stringify(result), "utf-8");
      try { unlinkSync(reqPath); } catch {}
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("latex bridge request failed", { session: basename(sessionDir), error: message });
      writeFileSync(resPath, JSON.stringify({ error: message }), "utf-8");
      try { unlinkSync(reqPath); } catch {}
    } finally {
      processingRequests.delete(reqPath);
    }
  }
}

async function pollBridge(): Promise<void> {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    mkdirSync(bridgeRoot(), { recursive: true });
    let sessions: string[];
    try {
      sessions = readdirSync(bridgeRoot());
    } catch {
      return;
    }
    for (const s of sessions) {
      await processSessionDir(join(bridgeRoot(), s));
    }
  } finally {
    pollInFlight = false;
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startLatexBridge(): void {
  if (pollTimer) return;
  mkdirSync(bridgeRoot(), { recursive: true });
  pollTimer = setInterval(() => {
    void pollBridge();
  }, 50);
  log.info("LaTeX bridge started");
}

export function stopLatexBridge(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** @internal */
export async function processLatexBridgeOnceForTests(): Promise<void> {
  await pollBridge();
}
