/** Maps OpenCode ACP sessionId ↔ renderer chat tabId + project root (shared across main services). */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTerminalBridgeRoot } from "./prism-bridge-paths";
import { formatTaskError } from "../../shared/task-error-codes";
import { createLogger } from "./logger";

const log = createLogger("chat-session-registry", "agent");

const sessionToTab = new Map<string, string>();
const tabToSession = new Map<string, string>();
const sessionToProjectRoot = new Map<string, string>();
/** Bibkeys allowed for `literature-read-pdf` in this chat session. */
const sessionIntensiveBibkeys = new Map<string, Set<string>>();
/** Composer @-mentioned expert ids — this turn's Task allowlist (empty = no restriction). */
const sessionTaskAllowlist = new Map<string, string[]>();
/** Allowlisted ids that completed successfully via OpenCode Task this turn. */
const sessionTaskAllowlistSatisfied = new Map<string, Set<string>>();
/** At most one auto follow-up prompt per user turn when required Tasks are missing. */
const sessionTaskAllowlistFollowUpUsed = new Set<string>();

/** Follow-up deferred while a Task is still open at parent end_turn. */
export interface DeferredTaskAllowlistFollowUp {
  tabId: string;
  model?: string;
  provider?: string;
  cwd?: string;
  projectRoot?: string;
  effort?: string;
}
const sessionDeferredTaskAllowlistFollowUp = new Map<string, DeferredTaskAllowlistFollowUp>();

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
  clearSessionTaskAllowlist(sessionId);
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

/** Add one bibkey to the intensive-reading allowlist; returns the new list. */
export function addSessionIntensiveBibkey(sessionId: string, bibkey: string): readonly string[] {
  const key = bibkey.trim();
  if (!sessionId.trim() || !key) return getSessionIntensiveBibkeys(sessionId);
  const next = [...new Set([...getSessionIntensiveBibkeys(sessionId), key])];
  setSessionIntensiveBibkeys(sessionId, next);
  return next;
}

/** Remove one bibkey from the intensive-reading allowlist; returns the new list. */
export function removeSessionIntensiveBibkey(sessionId: string, bibkey: string): readonly string[] {
  const key = bibkey.trim();
  if (!sessionId.trim() || !key) return getSessionIntensiveBibkeys(sessionId);
  const next = getSessionIntensiveBibkeys(sessionId).filter((k) => k !== key);
  setSessionIntensiveBibkeys(sessionId, next);
  return next;
}

/**
 * Bind composer @ expert ids for this turn:
 * - Task allowlist (who may be Task'd)
 * - must-invoke tracking (each id should get a successful Task)
 */
export function setSessionTaskAllowlist(
  sessionId: string,
  expertIds: readonly string[],
): void {
  const id = sessionId.trim();
  if (!id) return;
  const normalized = [
    ...new Set(
      expertIds
        .map((e) => e.trim().replace(/^@/, "").toLowerCase())
        .filter(Boolean),
    ),
  ];
  sessionTaskAllowlistSatisfied.delete(id);
  sessionTaskAllowlistFollowUpUsed.delete(id);
  sessionDeferredTaskAllowlistFollowUp.delete(id);
  if (normalized.length === 0) {
    sessionTaskAllowlist.delete(id);
    return;
  }
  sessionTaskAllowlist.set(id, normalized);
}

export function getSessionTaskAllowlist(sessionId: string): readonly string[] {
  return sessionTaskAllowlist.get(sessionId.trim()) ?? [];
}

export function clearSessionTaskAllowlist(sessionId: string): void {
  const id = sessionId.trim();
  if (!id) return;
  sessionTaskAllowlist.delete(id);
  sessionTaskAllowlistSatisfied.delete(id);
  sessionTaskAllowlistFollowUpUsed.delete(id);
  sessionDeferredTaskAllowlistFollowUp.delete(id);
}

export function deferTaskAllowlistFollowUp(
  sessionId: string,
  opts: DeferredTaskAllowlistFollowUp,
): void {
  const sid = sessionId.trim();
  if (!sid || !opts.tabId.trim()) return;
  sessionDeferredTaskAllowlistFollowUp.set(sid, {
    ...opts,
    tabId: opts.tabId.trim(),
  });
}

export function takeDeferredTaskAllowlistFollowUp(
  sessionId: string,
): DeferredTaskAllowlistFollowUp | null {
  const sid = sessionId.trim();
  if (!sid) return null;
  const deferred = sessionDeferredTaskAllowlistFollowUp.get(sid) ?? null;
  if (deferred) sessionDeferredTaskAllowlistFollowUp.delete(sid);
  return deferred;
}

/**
 * After the last open Task settles, claim + nudge for any @ experts still missing.
 */
export async function flushDeferredTaskAllowlistFollowUp(
  sessionId: string,
): Promise<void> {
  const deferred = takeDeferredTaskAllowlistFollowUp(sessionId);
  if (!deferred) return;

  const missing = claimTaskAllowlistFollowUp(sessionId);
  if (missing.length === 0) return;

  const followUp = formatTaskError("task_allowlist_not_invoked", {
    allowlist: missing,
  });
  log.info(
    `task-allowlist-follow-up(deferred): sessionId=${sessionId} missing=${missing.join(",")}`,
  );

  try {
    const { AcpService } = await import("../acp/service");
    const service = AcpService.getInstanceForSession(sessionId);
    await service.sendPrompt(sessionId, followUp, {
      model: deferred.model,
      provider: deferred.provider,
      cwd: deferred.cwd,
      projectRoot: deferred.projectRoot,
      effort: deferred.effort,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`task-allowlist-follow-up(deferred) failed: ${message}`);
  }

  const stillMissing = getSessionMissingTaskAllowlist(sessionId);
  if (stillMissing.length > 0) {
    try {
      const { AcpService } = await import("../acp/service");
      AcpService.getInstanceForSession(sessionId).setPendingTaskDenial(
        sessionId,
        formatTaskError("task_allowlist_not_invoked", {
          allowlist: stillMissing,
        }),
      );
    } catch {
      // ignore
    }
  }
}

/** Record a successful Task completion for an allowlisted @ id. */
export function markSessionTaskAllowlistSatisfied(
  sessionId: string,
  subagentId: string,
): void {
  const sid = sessionId.trim();
  const expert = subagentId.trim().replace(/^@/, "").toLowerCase();
  if (!sid || !expert || expert === "expert") return;
  const allow = sessionTaskAllowlist.get(sid);
  if (!allow?.includes(expert)) return;
  let set = sessionTaskAllowlistSatisfied.get(sid);
  if (!set) {
    set = new Set();
    sessionTaskAllowlistSatisfied.set(sid, set);
  }
  set.add(expert);
}

export function getSessionMissingTaskAllowlist(sessionId: string): string[] {
  const sid = sessionId.trim();
  const allow = sessionTaskAllowlist.get(sid);
  if (!allow?.length) return [];
  const done = sessionTaskAllowlistSatisfied.get(sid);
  return allow.filter((id) => !done?.has(id));
}

/**
 * Claim the single auto follow-up when @ experts were never Task'd.
 * Returns missing ids, or [] if none / already claimed.
 */
export function claimTaskAllowlistFollowUp(sessionId: string): string[] {
  const sid = sessionId.trim();
  if (!sid) return [];
  const missing = getSessionMissingTaskAllowlist(sid);
  if (missing.length === 0) return [];
  if (sessionTaskAllowlistFollowUpUsed.has(sid)) return [];
  sessionTaskAllowlistFollowUpUsed.add(sid);
  return missing;
}

/** @internal */
export function _resetChatSessionRegistryForTests(): void {
  sessionToTab.clear();
  tabToSession.clear();
  sessionToProjectRoot.clear();
  sessionIntensiveBibkeys.clear();
  sessionTaskAllowlist.clear();
  sessionTaskAllowlistSatisfied.clear();
  sessionTaskAllowlistFollowUpUsed.clear();
  sessionDeferredTaskAllowlistFollowUp.clear();
}
