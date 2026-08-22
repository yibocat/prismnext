/**
 * PrismNext Native JSON Session Store for Pi / Host runtime.
 *
 * Provides atomic file persistence, self-healing corruption recovery,
 * Git Worktree isolation, and atomic Checkpoint-aligned rollback & regret.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { HOME_RUNTIME_SESSIONS_DIRNAME } from "../../shared/workbench/paths";
import { resolveWorkbenchHome } from "../workbench/home";
import { ensureWorkbenchId, mintProjectId, readWorkbenchJson } from "../workbench/identity";
import type { AgentPlanEvent } from "../../shared/agent/api";
import type { RuntimeSessionId } from "../../shared/agent/runtime";
import type { PermissionMode, SessionAgent } from "../../shared/agent/session-agent";
import type { ContentBlock, ConversationSubagentRun, TurnMessageMeta } from "../../shared/agent/conversation";
import type { SessionUsageTotals } from "../../shared/agent/context-usage";
import { createLogger } from "../app/logger";

const log = createLogger("session-store", "agent");

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
    /** Event-order timeline. Present on turns persisted after P9; older records omit it. */
    blocks?: ContentBlock[];
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    /** This turn's billed USD (not session cumulative). */
    costUsd?: number;
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
  /** Workbench project id. Required on records written after P1. */
  projectId: string;
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
  subagentRuns?: Record<string, ConversationSubagentRun>;
  compacted?: {
    throughTurnIndex: number;
    summary?: string;
    at?: number;
  };
  /** Latest Pi occupancy / cumulative spend / category estimate. */
  usageTotals?: SessionUsageTotals;
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
  projectId?: string;
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
    const existing = this.getByConversationId(conversationId);
    if (existing) {
      const next: AgentSessionRecord = {
        ...existing,
        runtimeSessionId: input.runtimeSessionId,
        tabId: input.tabId ?? existing.tabId,
        projectRoot: input.projectRoot || existing.projectRoot,
        projectId: input.projectId || existing.projectId || assignProjectId(input),
        boundCheckoutPath: input.boundCheckoutPath || existing.boundCheckoutPath,
        ...(input.modelRef ? { modelRef: input.modelRef } : {}),
        ...(input.piSessionFile ? { piSessionFile: input.piSessionFile } : {}),
        ...(input.permissionMode ? { permissionMode: input.permissionMode } : {}),
        ...(input.sessionAgent ? { sessionAgent: input.sessionAgent } : {}),
        ...(input.title && input.title !== "New Chat" ? { title: input.title } : {}),
      };
      return this.writeExclusive(next);
    }
    const record: AgentSessionRecord = {
      version: SESSION_SCHEMA_VERSION,
      conversationId,
      runtimeSessionId: input.runtimeSessionId,
      tabId: input.tabId,
      title: input.title || "New Chat",
      projectRoot: input.projectRoot,
      projectId: assignProjectId(input),
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
    return this.writeExclusive(record);
  }

  put(record: AgentSessionRecord): void {
    this.writeExclusive(record);
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
        log.warn("session.corrupt", {
          runtimeSessionId: basename(path, ".json"),
        });
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
    const matches = this.recordsForConversation(conversationId);
    if (matches.length === 0) return null;
    return newestSessionRecord(matches);
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

  setUsageTotals(id: RuntimeSessionId, totals: SessionUsageTotals): AgentSessionRecord | null {
    const session = this.getSession(id);
    if (!session) return null;
    session.usageTotals = totals;
    this.put(session);
    return session;
  }

  setModelRef(
    id: RuntimeSessionId,
    modelRef: { provider: string; modelId: string },
  ): AgentSessionRecord | null {
    const session = this.getSession(id);
    if (!session) return null;
    session.modelRef = modelRef;
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
    const normTarget = normalizePath(boundCheckoutPath);
    return this.collapseConversationDuplicates(
      this.loadActiveSessions().filter((session) => (
        normalizePath(session.boundCheckoutPath || session.projectRoot) === normTarget
      )),
    );
  }

  listSessionsByProjectId(projectId: string): AgentSessionRecord[] {
    const id = projectId.trim();
    if (!id) return [];
    return this.collapseConversationDuplicates(
      this.loadActiveSessions().filter((session) => session.projectId === id),
    );
  }

  listSessionsByProject(projectRoot: string): AgentSessionRecord[] {
    const id = readWorkbenchJson(projectRoot)?.id;
    if (id) return this.listSessionsByProjectId(id);

    const normTarget = normalizePath(projectRoot);
    return this.collapseConversationDuplicates(
      this.loadActiveSessions().filter((session) => (
        normalizePath(session.projectRoot) === normTarget
      )),
    );
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

  deleteByConversationId(conversationId: string): void {
    for (const id of this.sessionFileIds()) {
      const session = this.getSession(id);
      if ((session?.conversationId || session?.runtimeSessionId) === conversationId) {
        this.deleteSession(id);
      }
    }
  }

  delete(id: RuntimeSessionId): void {
    this.deleteSession(id);
  }

  /** One conversationId = one JSON file. Reopen must not leave the previous runtime file behind. */
  private writeExclusive(record: AgentSessionRecord): AgentSessionRecord {
    const next = migrateSessionRecord({
      ...record,
      updatedAt: new Date().toISOString(),
    });
    atomicWriteJsonSync(this.fileFor(next.runtimeSessionId), next);
    this.removeSiblingConversationFiles(
      next.conversationId || next.runtimeSessionId,
      next.runtimeSessionId,
    );
    return next;
  }

  private loadActiveSessions(): AgentSessionRecord[] {
    const results: AgentSessionRecord[] = [];
    for (const id of this.sessionFileIds()) {
      const session = this.getSession(id);
      if (!session || session.archivedAt) continue;
      results.push(session);
    }
    return results;
  }

  private sessionFileIds(): string[] {
    const dir = this.sessionsDir();
    if (!existsSync(dir)) return [];
    try {
      return readdirSync(dir)
        .filter((entry) => (
          entry.endsWith(".json")
          && !entry.includes(".corrupted.")
          && !entry.includes(".tmp.")
        ))
        .map((entry) => entry.replace(/\.json$/, ""));
    } catch {
      return [];
    }
  }

  private recordsForConversation(conversationId: string): AgentSessionRecord[] {
    const matches: AgentSessionRecord[] = [];
    for (const id of this.sessionFileIds()) {
      const session = this.getSession(id);
      if ((session?.conversationId || session?.runtimeSessionId) === conversationId) {
        matches.push(session);
      }
    }
    return matches;
  }

  private removeSiblingConversationFiles(conversationId: string, keepRuntimeSessionId: string): void {
    for (const id of this.sessionFileIds()) {
      if (id === keepRuntimeSessionId) continue;
      const session = this.getSession(id);
      if ((session?.conversationId || session?.runtimeSessionId) === conversationId) {
        this.deleteSession(id);
      }
    }
  }

  private collapseConversationDuplicates(records: AgentSessionRecord[]): AgentSessionRecord[] {
    const best = new Map<string, AgentSessionRecord>();
    for (const record of records) {
      const id = record.conversationId || record.runtimeSessionId;
      const prev = best.get(id);
      if (!prev || sessionUpdatedAt(record) >= sessionUpdatedAt(prev)) {
        best.set(id, record);
      }
    }
    const winners = [...best.values()];
    for (const winner of winners) {
      this.removeSiblingConversationFiles(
        winner.conversationId || winner.runtimeSessionId,
        winner.runtimeSessionId,
      );
    }
    return winners.sort((a, b) => sessionUpdatedAt(b) - sessionUpdatedAt(a));
  }
}

export function resolvePiAgentRoot(): string {
  return resolveWorkbenchHome();
}

export function resolvePiRuntimeSessionDir(): string {
  return join(resolveWorkbenchHome(), HOME_RUNTIME_SESSIONS_DIRNAME);
}

function assignProjectId(input: CreateSessionRecordInput): string {
  if (input.projectId?.trim()) return input.projectId.trim();
  const root = input.projectRoot?.trim();
  if (root) {
    try {
      if (existsSync(root) && statSync(root).isDirectory()) {
        return ensureWorkbenchId(root);
      }
    } catch {
      // mint below
    }
  }
  return mintProjectId();
}

function sessionUpdatedAt(record: AgentSessionRecord): number {
  return Date.parse(record.updatedAt) || 0;
}

function newestSessionRecord(records: AgentSessionRecord[]): AgentSessionRecord {
  return records.reduce((best, current) => (
    sessionUpdatedAt(current) >= sessionUpdatedAt(best) ? current : best
  ));
}

function migrateSessionRecord(raw: unknown): AgentSessionRecord {
  const record = raw as AgentSessionRecord & { conversationId?: string; eventJournal?: unknown[] };
  const conversationId = record.conversationId || record.runtimeSessionId;
  return {
    ...record,
    version: SESSION_SCHEMA_VERSION,
    conversationId,
    projectId: typeof record.projectId === "string" ? record.projectId : "",
    eventJournal: record.eventJournal ?? [],
  };
}

export function isForbiddenProjectResourceDir(name: string): boolean {
  return (FORBIDDEN_PROJECT_RESOURCE_DIRS as readonly string[]).includes(name);
}
