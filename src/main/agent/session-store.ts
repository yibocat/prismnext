/**
 * PrismNext-private session metadata for the Pi / in-process runtime.
 * Never reads OpenCode SQLite (opencode.db) or hydrates historical ACP sessions.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeSessionId } from "../../shared/agent-runtime";
import type { PermissionMode, SessionAgent } from "../../shared/session-agent";

export const PI_AGENT_DIR_NAME = "pi-agent";
export const FORBIDDEN_PROJECT_RESOURCE_DIRS = [".pi", ".agents", ".opencode"] as const;

export interface AgentSessionRecord {
  runtimeSessionId: RuntimeSessionId;
  tabId: string;
  projectRoot: string;
  backend: "in-process" | "pi-sdk";
  permissionMode: PermissionMode;
  sessionAgent: SessionAgent;
  createdAt: string;
  updatedAt: string;
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

  put(record: AgentSessionRecord): void {
    mkdirSync(this.sessionsDir(), { recursive: true });
    const next = { ...record, updatedAt: new Date().toISOString() };
    writeFileSync(this.fileFor(record.runtimeSessionId), JSON.stringify(next, null, 2), "utf-8");
  }

  get(id: RuntimeSessionId): AgentSessionRecord | null {
    const path = this.fileFor(id);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as AgentSessionRecord;
    } catch {
      return null;
    }
  }

  delete(id: RuntimeSessionId): void {
    const path = this.fileFor(id);
    if (existsSync(path)) rmSync(path, { force: true });
  }
}

export function resolvePiAgentRoot(userDataDir: string): string {
  return join(userDataDir, PI_AGENT_DIR_NAME);
}

export function isForbiddenProjectResourceDir(name: string): boolean {
  return (FORBIDDEN_PROJECT_RESOURCE_DIRS as readonly string[]).includes(name);
}
