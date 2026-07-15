/** Maps OpenCode ACP sessionId ↔ renderer chat tabId + project root (shared across main services). */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTerminalBridgeRoot } from "./prism-bridge-paths";

const sessionToTab = new Map<string, string>();
const tabToSession = new Map<string, string>();
const sessionToProjectRoot = new Map<string, string>();
/** Bibkeys allowed for `literature-read-pdf` in this chat session. */
const sessionIntensiveBibkeys = new Map<string, Set<string>>();

function getBridgeRoot(): string {
  return getTerminalBridgeRoot();
}

function persistSessionMapping(sessionId: string, tabId: string, projectRoot?: string): void {
  try {
    const dir = join(getBridgeRoot(), "sessions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${sessionId}.json`),
      JSON.stringify({ sessionId, tabId, projectRoot: projectRoot ?? null }),
      "utf-8",
    );
  } catch {
    // ignore
  }
}

export function registerChatSession(sessionId: string, tabId: string, projectRoot?: string): void {
  const prev = tabToSession.get(tabId);
  if (prev && prev !== sessionId) {
    sessionToTab.delete(prev);
    sessionToProjectRoot.delete(prev);
  }
  sessionToTab.set(sessionId, tabId);
  tabToSession.set(tabId, sessionId);
  if (projectRoot?.trim()) {
    sessionToProjectRoot.set(sessionId, projectRoot.trim());
  }
  persistSessionMapping(sessionId, tabId, projectRoot);
}

export function resolveChatTabId(sessionId: string): string | undefined {
  return sessionToTab.get(sessionId);
}

export function resolveChatSessionId(tabId: string): string | undefined {
  return tabToSession.get(tabId);
}

export function getSessionProjectRoot(sessionId: string): string | undefined {
  return sessionToProjectRoot.get(sessionId);
}

/** Active ACP sessions registered for a project (for MCP apply / reload). */
export function listSessionsForProject(projectRoot: string): string[] {
  const root = projectRoot.trim();
  if (!root) return [];
  const out: string[] = [];
  for (const [sessionId, mapped] of sessionToProjectRoot) {
    if (mapped === root) out.push(sessionId);
  }
  return out;
}

export function setSessionProjectRoot(sessionId: string, projectRoot: string): void {
  const root = projectRoot.trim();
  if (!root) return;
  sessionToProjectRoot.set(sessionId, root);
  const tabId = sessionToTab.get(sessionId);
  if (tabId) persistSessionMapping(sessionId, tabId, root);
}

export function unregisterChatSession(sessionId: string): void {
  const tabId = sessionToTab.get(sessionId);
  if (tabId) tabToSession.delete(tabId);
  sessionToTab.delete(sessionId);
  sessionToProjectRoot.delete(sessionId);
  sessionIntensiveBibkeys.delete(sessionId);
}

/** Replace the intensive-reading bibkey allowlist for a chat session. */
export function setSessionIntensiveBibkeys(sessionId: string, bibkeys: readonly string[]): void {
  const id = sessionId.trim();
  if (!id) return;
  const normalized = [...new Set(bibkeys.map((k) => k.trim()).filter(Boolean))];
  if (normalized.length === 0) {
    sessionIntensiveBibkeys.delete(id);
    return;
  }
  sessionIntensiveBibkeys.set(id, new Set(normalized));
}

export function getSessionIntensiveBibkeys(sessionId: string): readonly string[] {
  const set = sessionIntensiveBibkeys.get(sessionId.trim());
  return set ? [...set] : [];
}

export function isSessionIntensiveBibkey(sessionId: string | undefined, bibkey: string): boolean {
  if (!sessionId?.trim() || !bibkey.trim()) return false;
  const set = sessionIntensiveBibkeys.get(sessionId.trim());
  if (!set || set.size === 0) return false;
  return set.has(bibkey.trim());
}

/** @internal */
export function _resetChatSessionRegistryForTests(): void {
  sessionToTab.clear();
  tabToSession.clear();
  sessionToProjectRoot.clear();
  sessionIntensiveBibkeys.clear();
}
