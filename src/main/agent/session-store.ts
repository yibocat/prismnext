/**
 * PrismNext Native JSON Session Store for Pi / Host runtime.
 *
 * Provides atomic file persistence, self-healing corruption recovery,
 * Git Worktree isolation, and atomic Checkpoint-aligned rollback & regret.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentPlanEvent } from "../../shared/agent-api";
import type { RuntimeSessionId } from "../../shared/agent-runtime";
import type { PermissionMode, SessionAgent } from "../../shared/session-agent";
import type { TurnMessageMeta } from "../../shared/agent-conversation";

export const PI_AGENT_DIR_NAME = "pi-agent";
export const FORBIDDEN_PROJECT_RESOURCE_DIRS = [".pi", ".agents", ".opencode"] as const;
export const SESSION_SCHEMA_VERSION = 2;

/** Snapshot of a single tool execution within an assistant turn */
export interface AgentToolCallSnapshot {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  denied?: boolean;
  startedAt: number;
  finishedAt?: number;
}

/** User message attachment */
export interface AgentMessageAttachment {
  name: string;
  kind: "image" | "file";
  path: string;
}

/** Single conversation turn (User → Assistant) */
export interface AgentTurnRecord {
  /** 0-based turn index, strictly aligned with Checkpoint turnIndex */
  turnIndex: number;
  turnId: string;
  createdAt: number;
  finishedAt?: number;
  user: {
    text: string;
    attachments?: AgentMessageAttachment[];
  };
  assistant: {
    text: string;
    thinking?: string;
    toolCalls: AgentToolCallSnapshot[];
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  status: "completed" | "failed" | "cancelled";
  error?: string;
  meta?: TurnMessageMeta;
}

/** Pruned turns backed up during a rollback for the "Regret / Undo" action */
export interface AgentSessionRegretState {
  prunedTurns: AgentTurnRecord[];
  rollbackAt: number;
  targetTurnIndex: number;
  piLeafId?: string | null;
}

export interface AgentSessionRecord {
  version: number;
  conversationId?: string;
  runtimeSessionId: RuntimeSessionId;
  tabId?: string;
  title: string;
  projectRoot: string;
  boundCheckoutPath: string;
  backend: "in-process" | "pi-sdk";
  permissionMode: PermissionMode;
  sessionAgent: SessionAgent;
  modelRef?: {
    provider: string;
    modelId: string;
  };
  piSessionFile?: string;
  eventJournal?: unknown[];
  turns: AgentTurnRecord[];
  planEvents?: AgentPlanEvent[];
  regret?: AgentSessionRegretState | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface CreateSessionRecordInput {
  conversationId?: string;
  runtimeSessionId: RuntimeSessionId;
  tabId?: string;
  title?: string;
  projectRoot: string;
  boundCheckoutPath?: string;
  backend?: "in-process" | "pi-sdk";
  permissionMode?: PermissionMode;
  sessionAgent?: SessionAgent;
  modelRef?: {
    provider: string;
    modelId: string;
  };
  piSessionFile?: string;
}

export interface RollbackSessionResult {
  ok: boolean;
  keptCount: number;
  prunedTurns: AgentTurnRecord[];
}

export interface RestoreRegretResult {
  ok: boolean;
  restoredCount: number;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

function atomicWriteJsonSync(filePath: string, data: unknown): void {
  const dir = join(filePath, "..");
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
}

export class AgentSessionStore {
  constructor(private readonly rootDir: string) {}

  get root(): string {
    return this.rootDir;
  }

  sessionsDir(): string {
    return join(this.rootDir, "sessions");
  }

  private fileFor(id: RuntimeSessionId): string {
    return join(this.sessionsDir(), `${id}.json`);
  }

  createSession(input: CreateSessionRecordInput): AgentSessionRecord {
    const now = new Date().toISOString();
    const conversationId = input.conversationId || input.runtimeSessionId;
    const record: AgentSessionRecord = {
      version: SESSION_SCHEMA_VERSION,
      conversationId,
      runtimeSessionId: input.runtimeSessionId,
      tabId: input.tabId,
      title: input.title || "New Chat",
      projectRoot: input.projectRoot,
      boundCheckoutPath: input.boundCheckoutPath || input.projectRoot,
      backend: input.backend || "pi-sdk",
      permissionMode: input.permissionMode || "edit_auto",
      sessionAgent: input.sessionAgent || "build",
      ...(input.modelRef ? { modelRef: input.modelRef } : {}),
      ...(input.piSessionFile ? { piSessionFile: input.piSessionFile } : {}),
      eventJournal: [],
      turns: [],
      planEvents: [],
      regret: null,
      createdAt: now,
      updatedAt: now,
    };
    atomicWriteJsonSync(this.fileFor(record.runtimeSessionId), record);
    return record;
  }

  put(record: AgentSessionRecord): void {
    const next = migrateSessionRecord({
      ...record,
      updatedAt: new Date().toISOString(),
    });
    atomicWriteJsonSync(this.fileFor(record.runtimeSessionId), next);
  }

  getSession(id: RuntimeSessionId): AgentSessionRecord | null {
    const path = this.fileFor(id);
    if (!existsSync(path)) return null;
    try {
      const raw = readFileSync(path, "utf-8");
      return migrateSessionRecord(JSON.parse(raw));
    } catch {
      // Self-healing: move corrupted file to backup rather than crashing host
      try {
        const corruptPath = `${path}.corrupted.${Date.now()}`;
        renameSync(path, corruptPath);
      } catch {
        // ignore rename error
      }
      return null;
    }
  }

  get(id: RuntimeSessionId): AgentSessionRecord | null {
    return this.getSession(id);
  }

  getByConversationId(conversationId: string): AgentSessionRecord | null {
    const direct = this.getSession(conversationId);
    if (direct?.conversationId === conversationId) return direct;
    const dir = this.sessionsDir();
    if (!existsSync(dir)) return null;
    try {
      for (const entry of readdirSync(dir)) {
        if (!entry.endsWith(".json") || entry.includes(".corrupted.") || entry.includes(".tmp.")) {
          continue;
        }
        const session = this.getSession(entry.replace(/\.json$/, ""));
        if (session?.conversationId === conversationId) return session;
      }
    } catch {
      return null;
    }
    return null;
  }

  appendTurn(id: RuntimeSessionId, turn: AgentTurnRecord): AgentSessionRecord | null {
    const session = this.getSession(id);
    if (!session) return null;

    const existingIndex = session.turns.findIndex((t) => t.turnIndex === turn.turnIndex);
    if (existingIndex >= 0) {
      session.turns[existingIndex] = turn;
    } else {
      session.turns.push(turn);
    }
    // Clear outdated regret on forward turn mutation
    session.regret = null;
    this.put(session);
    return session;
  }

  attachRegretPiLeaf(id: RuntimeSessionId, piLeafId: string | null | undefined): void {
    const session = this.getSession(id);
    if (!session?.regret) return;
    session.regret = { ...session.regret, piLeafId: piLeafId ?? null };
    this.put(session);
  }

  upsertTurnMeta(id: RuntimeSessionId, turnIndex: number, meta: TurnMessageMeta): boolean {
    const session = this.getSession(id);
    if (!session || turnIndex < 0) return false;
    const turn = session.turns.find((item) => item.turnIndex === turnIndex);
    if (!turn) return false;
    turn.meta = {
      completedAt: meta.completedAt ?? turn.meta?.completedAt,
      modelLabel: meta.modelLabel ?? turn.meta?.modelLabel,
      summary: meta.summary ?? turn.meta?.summary,
    };
    this.put(session);
    return true;
  }

  upsertPlanArtifact(
    id: RuntimeSessionId,
    event: Extract<AgentPlanEvent, { kind: "plan-artifact" }>,
  ): void {
    const session = this.getSession(id);
    if (!session) return;
    const events = [...(session.planEvents ?? [])];
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const cur = events[i];
      if (cur?.kind !== "plan-artifact" || cur.discarded) continue;
      events[i] = { ...cur, ...event, kind: "plan-artifact" };
      session.planEvents = events;
      this.put(session);
      return;
    }
    events.push(event);
    session.planEvents = events;
    this.put(session);
  }

  appendPlanDecision(
    id: RuntimeSessionId,
    event: Extract<AgentPlanEvent, { kind: "plan-decision" }>,
  ): void {
    const session = this.getSession(id);
    if (!session) return;
    session.planEvents = [...(session.planEvents ?? []), event];
    this.put(session);
  }

  markPlanArtifactDiscarded(id: RuntimeSessionId): void {
    const session = this.getSession(id);
    if (!session?.planEvents?.length) return;
    const events = [...session.planEvents];
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const cur = events[i];
      if (cur?.kind !== "plan-artifact" || cur.discarded) continue;
      events[i] = { ...cur, discarded: true, path: "" };
      session.planEvents = events;
      this.put(session);
      return;
    }
  }

  rollbackSession(id: RuntimeSessionId, targetTurnIndex: number): RollbackSessionResult {
    const session = this.getSession(id);
    if (!session) {
      return { ok: false, keptCount: 0, prunedTurns: [] };
    }

    const keptTurns = session.turns.filter((t) => t.turnIndex < targetTurnIndex);
    const prunedTurns = session.turns.filter((t) => t.turnIndex >= targetTurnIndex);

    session.turns = keptTurns;
    session.regret = {
      prunedTurns,
      rollbackAt: Date.now(),
      targetTurnIndex,
    };
    this.put(session);

    return {
      ok: true,
      keptCount: keptTurns.length,
      prunedTurns,
    };
  }

  restoreRegret(id: RuntimeSessionId): RestoreRegretResult {
    const session = this.getSession(id);
    if (!session || !session.regret || session.regret.prunedTurns.length === 0) {
      return { ok: false, restoredCount: session?.turns.length ?? 0 };
    }

    const restoredTurns = [...session.turns, ...session.regret.prunedTurns].sort(
      (a, b) => a.turnIndex - b.turnIndex,
    );
    session.turns = restoredTurns;
    session.regret = null;
    this.put(session);

    return {
      ok: true,
      restoredCount: restoredTurns.length,
    };
  }

  listSessionsByCheckout(boundCheckoutPath: string): AgentSessionRecord[] {
    const dir = this.sessionsDir();
    if (!existsSync(dir)) return [];

    const normTarget = normalizePath(boundCheckoutPath);
    const results: AgentSessionRecord[] = [];

    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (!entry.endsWith(".json") || entry.includes(".corrupted.") || entry.includes(".tmp.")) {
          continue;
        }
        const session = this.getSession(entry.replace(/\.json$/, ""));
        if (!session) continue;
        if (session.archivedAt) continue;

        const sessionBound = normalizePath(session.boundCheckoutPath || session.projectRoot);
        if (sessionBound === normTarget) {
          results.push(session);
        }
      }
    } catch {
      return [];
    }

    return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  listSessionsByProject(projectRoot: string): AgentSessionRecord[] {
    const dir = this.sessionsDir();
    if (!existsSync(dir)) return [];

    const normTarget = normalizePath(projectRoot);
    const results: AgentSessionRecord[] = [];

    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (!entry.endsWith(".json") || entry.includes(".corrupted.") || entry.includes(".tmp.")) {
          continue;
        }
        const session = this.getSession(entry.replace(/\.json$/, ""));
        if (!session) continue;
        if (session.archivedAt) continue;

        const sessionProject = normalizePath(session.projectRoot);
        if (sessionProject === normTarget) {
          results.push(session);
        }
      }
    } catch {
      return [];
    }

    return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  rebindCheckout(fromPath: string, toPath: string): number {
    const normFrom = normalizePath(fromPath);
    const normTo = normalizePath(toPath);
    const sessions = this.listSessionsByCheckout(fromPath);
    let count = 0;
    for (const s of sessions) {
      s.boundCheckoutPath = normTo;
      this.put(s);
      count += 1;
    }
    return count;
  }

  clearSessionsForWorktree(worktreePath: string): number {
    const sessions = this.listSessionsByCheckout(worktreePath);
    let count = 0;
    const now = new Date().toISOString();
    for (const s of sessions) {
      s.archivedAt = now;
      this.put(s);
      count += 1;
    }
    return count;
  }

  deleteSession(id: RuntimeSessionId): void {
    const path = this.fileFor(id);
    if (existsSync(path)) rmSync(path, { force: true });
  }

  delete(id: RuntimeSessionId): void {
    this.deleteSession(id);
  }
}

export function resolvePiAgentRoot(userDataDir: string): string {
  return join(userDataDir, PI_AGENT_DIR_NAME);
}

export function resolvePiRuntimeSessionDir(userDataDir: string): string {
  return join(userDataDir, PI_AGENT_DIR_NAME, "runtime-sessions");
}

function migrateSessionRecord(raw: unknown): AgentSessionRecord {
  const record = raw as AgentSessionRecord & { conversationId?: string; eventJournal?: unknown[] };
  const conversationId = record.conversationId || record.runtimeSessionId;
  return {
    ...record,
    version: SESSION_SCHEMA_VERSION,
    conversationId,
    eventJournal: record.eventJournal ?? [],
  };
}

export function isForbiddenProjectResourceDir(name: string): boolean {
  return (FORBIDDEN_PROJECT_RESOURCE_DIRS as readonly string[]).includes(name);
}
