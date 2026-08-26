import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  remoteWinsSessionConflict,
  type SessionMutatedEvent,
} from "../../shared/remote";
import { remoteCacheRoot } from "./sync-client";

export interface MirroredSessionSummary {
  id: string;
  conversationId: string;
  title: string;
  updatedAt: string;
  projectId: string;
  fromCache: true;
  readOnly: true;
}

function sessionsDir(profileId: string, projectId: string): string {
  return join(remoteCacheRoot(profileId, projectId), "sessions");
}

function fileFor(profileId: string, projectId: string, conversationId: string): string {
  return join(sessionsDir(profileId, projectId), `${conversationId}.json`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function listMirroredSessions(profileId: string, projectId: string): MirroredSessionSummary[] {
  const dir = sessionsDir(profileId, projectId);
  if (!existsSync(dir)) return [];
  const out: MirroredSessionSummary[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name.includes(".local-conflict.")) continue;
    const rec = readJson(join(dir, name));
    if (!rec) continue;
    const conversationId = String(rec.conversationId ?? rec.runtimeSessionId ?? name.replace(/\.json$/, ""));
    out.push({
      id: conversationId,
      conversationId,
      title: typeof rec.title === "string" ? rec.title : "Chat",
      updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : "",
      projectId,
      fromCache: true,
      readOnly: true,
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readMirroredSession(
  profileId: string,
  projectId: string,
  conversationId: string,
): Record<string, unknown> | null {
  return readJson(fileFor(profileId, projectId, conversationId));
}

export function applyMirroredSession(
  profileId: string,
  projectId: string,
  remote: Record<string, unknown>,
): { path: string; conflicted?: string } {
  const conversationId = String(remote.conversationId ?? remote.runtimeSessionId ?? "").trim();
  if (!conversationId) throw new Error("session_missing_id");
  const dest = fileFor(profileId, projectId, conversationId);
  mkdirSync(sessionsDir(profileId, projectId), { recursive: true });
  const existing = existsSync(dest) ? readJson(dest) : null;
  let conflicted: string | undefined;
  if (existing) {
    const localUpdated = typeof existing.updatedAt === "string" ? existing.updatedAt : "";
    const remoteUpdated = typeof remote.updatedAt === "string" ? remote.updatedAt : "";
    const same = JSON.stringify(existing) === JSON.stringify(remote);
    if (!same && localUpdated && !remoteWinsSessionConflict(localUpdated, remoteUpdated)) {
      // Remote still wins (D10). Keep a backup of the older laptop copy.
    }
    if (!same && localUpdated && remoteUpdated && localUpdated !== remoteUpdated) {
      conflicted = dest.replace(/\.json$/, `.local-conflict.json`);
      writeFileSync(conflicted, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
    }
  }
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(remote, null, 2)}\n`, "utf8");
  renameSync(tmp, dest);
  return { path: dest, conflicted };
}

export async function pullAndMirrorSession(
  broker: { invoke(profileId: string, method: string, params: unknown): Promise<unknown> },
  event: SessionMutatedEvent,
  profileId: string,
): Promise<{ path: string; conflicted?: string } | { deleted: true } | null> {
  if (event.action === "delete") {
    const dest = fileFor(profileId, event.projectId, event.conversationId);
    if (existsSync(dest)) {
      const backup = dest.replace(/\.json$/, `.local-conflict.json`);
      renameSync(dest, backup);
    }
    return { deleted: true };
  }
  const raw = await broker.invoke(profileId, "session:read", {
    conversationId: event.conversationId,
    projectId: event.projectId,
  });
  const rec = asRecord(raw);
  if (!rec) return null;
  return applyMirroredSession(profileId, event.projectId, rec);
}
