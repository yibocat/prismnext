/**
 * Persist per-session context ring data under
 * `.prismnext/agent/sessions-context.json`.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "./logger";
import type { ContextUsageSource } from "../../shared/session-context-usage";

const log = createLogger("session-context-store", "agent");

export interface SessionContextData {
  tokens: number;
  updatedAt: number;
  /** OpenCode usage_update.size when known. */
  windowSize?: number | null;
  /** How `tokens` was derived. */
  source?: ContextUsageSource;
  /** Fingerprint of stable system file content (OpenCode instructions). */
  promptFingerprint?: string;
  /** @deprecated Legacy flag — stable system no longer uses user content blocks. */
  hasSystemPromptBlock?: boolean;
}

function contextStorePath(projectRoot: string): string {
  return path.join(projectRoot, ".prismnext", "agent", "sessions-context.json");
}

export function persistSessionContext(
  projectRoot: string,
  sessionId: string,
  data: SessionContextData,
): void {
  if (!projectRoot || !sessionId) return;
  try {
    const storePath = contextStorePath(projectRoot);
    let store: Record<string, SessionContextData> = {};
    if (fs.existsSync(storePath)) {
      store = JSON.parse(fs.readFileSync(storePath, "utf-8"));
    }
    store[sessionId] = data;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const [id, entry] of Object.entries(store)) {
      if (entry.updatedAt < cutoff) delete store[id];
    }
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
    log.debug(`Context persisted for session ${sessionId}`);
  } catch (err) {
    log.warn(`Failed to persist session context: ${(err as Error).message}`);
  }
}

export function loadSessionContext(
  projectRoot: string,
  sessionId: string,
): SessionContextData | null {
  if (!projectRoot || !sessionId) return null;
  try {
    const storePath = contextStorePath(projectRoot);
    if (!fs.existsSync(storePath)) return null;
    const store = JSON.parse(fs.readFileSync(storePath, "utf-8"));
    const raw = store[sessionId];
    if (!raw || typeof raw !== "object") return null;
    return {
      tokens: typeof raw.tokens === "number" ? raw.tokens : 0,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
      windowSize: raw.windowSize ?? null,
      source: raw.source,
      promptFingerprint: raw.promptFingerprint,
      hasSystemPromptBlock: raw.hasSystemPromptBlock,
    };
  } catch {
    return null;
  }
}

/** Clear ring numbers after compact. */
export function clearSessionContextUsage(
  projectRoot: string,
  sessionId: string,
): void {
  if (!projectRoot || !sessionId) return;
  try {
    const storePath = contextStorePath(projectRoot);
    if (!fs.existsSync(storePath)) return;
    const store = JSON.parse(fs.readFileSync(storePath, "utf-8")) as Record<
      string,
      SessionContextData
    >;
    const prev = store[sessionId];
    if (!prev) return;
    store[sessionId] = {
      ...prev,
      tokens: 0,
      windowSize: prev.windowSize ?? null,
      source: undefined,
      updatedAt: Date.now(),
    };
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    log.warn(`Failed to clear session context: ${(err as Error).message}`);
  }
}
