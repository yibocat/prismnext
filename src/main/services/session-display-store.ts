import * as fs from "node:fs";
import * as path from "node:path";

/** Persisted user-message display payload (renderer ContentBlock[]). */
export type UserDisplayContent = Record<string, unknown>[];

interface SessionDisplayEntry {
  userDisplays: UserDisplayContent[];
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

export function appendUserDisplay(
  projectRoot: string,
  sessionId: string,
  content: UserDisplayContent,
): void {
  if (!projectRoot || !sessionId || !content.length) return;
  const store = readStore(projectRoot);
  const entry = store[sessionId] ?? { userDisplays: [], updatedAt: Date.now() };
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
): void {
  if (!projectRoot || !sessionId) return;
  const store = readStore(projectRoot);
  store[sessionId] = { userDisplays: displays, updatedAt: Date.now() };
  writeStore(projectRoot, store);
}
