/** Maps OpenCode ACP sessionId ↔ renderer chat tabId + project root (shared across main services). */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const sessionToTab = new Map<string, string>();
const tabToSession = new Map<string, string>();
const sessionToProjectRoot = new Map<string, string>();

function getBridgeRoot(): string {
  return process.env.PRISM_TERMINAL_BRIDGE_ROOT || join(homedir(), ".prism-terminal-bridge");
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
}

/** @internal */
export function _resetChatSessionRegistryForTests(): void {
  sessionToTab.clear();
  tabToSession.clear();
  sessionToProjectRoot.clear();
}
