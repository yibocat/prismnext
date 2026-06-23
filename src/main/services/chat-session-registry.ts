/** Maps OpenCode ACP sessionId ↔ renderer chat tabId (shared across main services). */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const sessionToTab = new Map<string, string>();
const tabToSession = new Map<string, string>();

function getBridgeRoot(): string {
  return process.env.PRISM_TERMINAL_BRIDGE_ROOT || join(homedir(), ".prism-terminal-bridge");
}

function persistSessionMapping(sessionId: string, tabId: string): void {
  try {
    const dir = join(getBridgeRoot(), "sessions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ sessionId, tabId }), "utf-8");
  } catch {
    // ignore
  }
}

export function registerChatSession(sessionId: string, tabId: string): void {
  const prev = tabToSession.get(tabId);
  if (prev && prev !== sessionId) {
    sessionToTab.delete(prev);
  }
  sessionToTab.set(sessionId, tabId);
  tabToSession.set(tabId, sessionId);
  persistSessionMapping(sessionId, tabId);
}

export function resolveChatTabId(sessionId: string): string | undefined {
  return sessionToTab.get(sessionId);
}

export function resolveChatSessionId(tabId: string): string | undefined {
  return tabToSession.get(tabId);
}

export function unregisterChatSession(sessionId: string): void {
  const tabId = sessionToTab.get(sessionId);
  if (tabId) tabToSession.delete(tabId);
  sessionToTab.delete(sessionId);
}

/** @internal */
export function _resetChatSessionRegistryForTests(): void {
  sessionToTab.clear();
  tabToSession.clear();
}
