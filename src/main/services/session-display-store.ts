import * as fs from "node:fs";
import * as path from "node:path";

/** Persisted user-message display payload (renderer ContentBlock[]). */
export type UserDisplayContent = Record<string, unknown>[];

/**
 * Prism-local plan UI cards (not stored in OpenCode session history).
 * `afterIndex` = count of OpenCode user/assistant messages before insert.
 */
export type PlanUiEvent =
  | {
      kind: "plan-artifact";
      path: string;
      title?: string;
      discarded?: boolean;
      afterIndex: number;
    }
  | {
      kind: "plan-decision";
      decision: "approved" | "rejected";
      path?: string;
      title?: string;
      afterIndex: number;
    };

interface SessionDisplayEntry {
  userDisplays: UserDisplayContent[];
  planEvents?: PlanUiEvent[];
  updatedAt: number;
}

type SessionDisplayStore = Record<string, SessionDisplayEntry>;

function storePath(projectRoot: string): string {
  return path.join(projectRoot, ".prismnext", "agent", "sessions-display.json");
}

function readStore(projectRoot: string): SessionDisplayStore {
  const file = storePath(projectRoot);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as SessionDisplayStore;
  } catch {
    return {};
  }
}

function writeStore(projectRoot: string, store: SessionDisplayStore): void {
  const file = storePath(projectRoot);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2), "utf-8");
}

function ensureEntry(
  store: SessionDisplayStore,
  sessionId: string,
): SessionDisplayEntry {
  return store[sessionId] ?? { userDisplays: [], planEvents: [], updatedAt: Date.now() };
}

export function appendUserDisplay(
  projectRoot: string,
  sessionId: string,
  content: UserDisplayContent,
): void {
  if (!projectRoot || !sessionId || !content.length) return;
  const store = readStore(projectRoot);
  const entry = ensureEntry(store, sessionId);
  entry.userDisplays.push(content);
  entry.updatedAt = Date.now();
  store[sessionId] = entry;
  writeStore(projectRoot, store);
}

export function getUserDisplays(
  projectRoot: string,
  sessionId: string,
): UserDisplayContent[] {
  if (!projectRoot || !sessionId) return [];
  return readStore(projectRoot)[sessionId]?.userDisplays ?? [];
}

export function getPlanEvents(
  projectRoot: string,
  sessionId: string,
): PlanUiEvent[] {
  if (!projectRoot || !sessionId) return [];
  return readStore(projectRoot)[sessionId]?.planEvents ?? [];
}

/** Upsert the latest living plan-artifact, or append a new one. */
export function upsertPlanArtifactEvent(
  projectRoot: string,
  sessionId: string,
  event: Extract<PlanUiEvent, { kind: "plan-artifact" }>,
): void {
  if (!projectRoot || !sessionId) return;
  const store = readStore(projectRoot);
  const entry = ensureEntry(store, sessionId);
  const events = [...(entry.planEvents ?? [])];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const cur = events[i];
    if (cur?.kind !== "plan-artifact" || cur.discarded) continue;
    events[i] = { ...cur, ...event, kind: "plan-artifact" };
    entry.planEvents = events;
    entry.updatedAt = Date.now();
    store[sessionId] = entry;
    writeStore(projectRoot, store);
    return;
  }
  events.push(event);
  entry.planEvents = events;
  entry.updatedAt = Date.now();
  store[sessionId] = entry;
  writeStore(projectRoot, store);
}

export function appendPlanDecisionEvent(
  projectRoot: string,
  sessionId: string,
  event: Extract<PlanUiEvent, { kind: "plan-decision" }>,
): void {
  if (!projectRoot || !sessionId) return;
  const store = readStore(projectRoot);
  const entry = ensureEntry(store, sessionId);
  entry.planEvents = [...(entry.planEvents ?? []), event];
  entry.updatedAt = Date.now();
  store[sessionId] = entry;
  writeStore(projectRoot, store);
}

/** Mark the latest non-discarded artifact as discarded (Deny). */
export function markLatestPlanArtifactDiscarded(
  projectRoot: string,
  sessionId: string,
): void {
  if (!projectRoot || !sessionId) return;
  const store = readStore(projectRoot);
  const entry = store[sessionId];
  if (!entry?.planEvents?.length) return;
  const events = [...entry.planEvents];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const cur = events[i];
    if (cur?.kind !== "plan-artifact" || cur.discarded) continue;
    events[i] = { ...cur, discarded: true, path: "" };
    entry.planEvents = events;
    entry.updatedAt = Date.now();
    store[sessionId] = entry;
    writeStore(projectRoot, store);
    return;
  }
}

export function truncateUserDisplays(
  projectRoot: string,
  sessionId: string,
  turnIndex: number,
): void {
  if (!projectRoot || !sessionId || turnIndex < 0) return;
  const store = readStore(projectRoot);
  const entry = store[sessionId];
  if (!entry) return;
  entry.userDisplays = entry.userDisplays.slice(0, turnIndex);
  // Drop plan cards that would sit after the truncated OpenCode prefix.
  // turnIndex+1 user displays ≈ remaining user turns; keep a generous afterIndex cap.
  const maxAfter = Math.max(0, turnIndex * 2 + 2);
  if (entry.planEvents?.length) {
    entry.planEvents = entry.planEvents.filter((e) => e.afterIndex <= maxAfter);
  }
  entry.updatedAt = Date.now();
  store[sessionId] = entry;
  writeStore(projectRoot, store);
}

export function deleteSessionDisplays(projectRoot: string, sessionId: string): void {
  if (!projectRoot || !sessionId) return;
  const store = readStore(projectRoot);
  if (!store[sessionId]) return;
  delete store[sessionId];
  writeStore(projectRoot, store);
}

/** Replace all display snapshots for a session (used when undoing truncation). */
export function restoreUserDisplays(
  projectRoot: string,
  sessionId: string,
  displays: UserDisplayContent[],
  planEvents?: PlanUiEvent[],
): void {
  if (!projectRoot || !sessionId) return;
  const store = readStore(projectRoot);
  const prev = store[sessionId];
  store[sessionId] = {
    userDisplays: displays,
    planEvents: planEvents ?? prev?.planEvents ?? [],
    updatedAt: Date.now(),
  };
  writeStore(projectRoot, store);
}

export function getSessionDisplayBackup(
  projectRoot: string,
  sessionId: string,
): SessionDisplayEntry | null {
  if (!projectRoot || !sessionId) return null;
  return readStore(projectRoot)[sessionId] ?? null;
}

export function restoreSessionDisplayEntry(
  projectRoot: string,
  sessionId: string,
  entry: SessionDisplayEntry,
): void {
  if (!projectRoot || !sessionId) return;
  const store = readStore(projectRoot);
  store[sessionId] = { ...entry, updatedAt: Date.now() };
  writeStore(projectRoot, store);
}
