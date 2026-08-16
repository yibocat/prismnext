/**
 * Polls the research-brief file bridge for OpenCode tool requests.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createLogger } from "./logger";
import { getResearchBriefBridgeRoot } from "./prism-bridge-paths";
import { getSessionProjectRoot } from "./chat-session-registry";
import {
  readResearchBrief,
  updateResearchBriefSection,
} from "./research-brief-service";

const log = createLogger("research-brief-bridge", "agent");

export interface ResearchBriefActionRequest {
  action: "read" | "update";
  sessionId?: string;
  projectRoot?: string;
  section?: string;
  content?: string;
  append?: boolean;
}

/** In-memory entry for ToolHost — same work as the disk-bridge poller, no request.json. */
export function executeResearchBriefAction(
  req: ResearchBriefActionRequest,
): Record<string, unknown> {
  return dispatch(req);
}

function bridgeRoot(): string {
  return getResearchBriefBridgeRoot();
}

function resolveProjectRoot(req: ResearchBriefActionRequest): string {
  const fromSession = req.sessionId ? getSessionProjectRoot(req.sessionId) : undefined;
  return (fromSession || req.projectRoot?.trim() || "").replace(/\\/g, "/");
}

function dispatch(req: ResearchBriefActionRequest): Record<string, unknown> {
  const projectRoot = resolveProjectRoot(req);
  if (!projectRoot) {
    return {
      error: "Project root unknown for this chat session.",
      hint: "Open a project in prismnext and start a new chat tab from that project.",
    };
  }

  switch (req.action) {
    case "read":
      return readResearchBrief(projectRoot, { ensure: true }) as unknown as Record<string, unknown>;
    case "update": {
      const section = typeof req.section === "string" ? req.section.trim() : "";
      const content = typeof req.content === "string" ? req.content : "";
      if (!section) {
        return { error: "Missing section parameter.", ok: false };
      }
      if (!content.trim()) {
        return { error: "Missing content parameter.", ok: false };
      }
      return updateResearchBriefSection(projectRoot, section, content, {
        append: req.append === true,
      }) as unknown as Record<string, unknown>;
    }
    default:
      return { error: `Unknown research-brief bridge action: ${String((req as { action?: string }).action)}` };
  }
}

const processingRequests = new Set<string>();
let pollInFlight = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

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
      const req = JSON.parse(raw) as ResearchBriefActionRequest;
      const result = dispatch(req);
      writeFileSync(resPath, JSON.stringify(result), "utf-8");
      try { unlinkSync(reqPath); } catch {}
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("research-brief bridge request failed", { session: basename(sessionDir), error: message });
      writeFileSync(resPath, JSON.stringify({ error: message, ok: false }), "utf-8");
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

export function startResearchBriefBridge(): void {
  if (pollTimer) return;
  mkdirSync(bridgeRoot(), { recursive: true });
  pollTimer = setInterval(() => {
    void pollBridge();
  }, 50);
  log.info("Research brief bridge started");
}

export function stopResearchBriefBridge(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** @internal */
export async function processResearchBriefBridgeOnceForTests(): Promise<void> {
  await pollBridge();
}
