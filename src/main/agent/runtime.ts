/**
 * AgentRuntime — lifecycle surface used by RuntimeRegistry / AgentService.
 */

import type { AgentCompactResult } from "../../shared/agent/api";

export interface AgentTruncateEngineResult {
  ok: boolean;
  previousLeafId?: string | null;
  error?: string;
}
import type {
  AgentEvent,
  CreateSessionInput,
  CreateSessionResult,
  RuntimeSessionId,
  TurnInput,
} from "../../shared/agent/runtime";

export type AgentEventListener = (event: AgentEvent) => void;

export interface AgentRuntime {
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  sendTurn(input: TurnInput): Promise<void>;
  cancelTurn(runtimeSessionId: RuntimeSessionId): Promise<void>;
  disposeSession(runtimeSessionId: RuntimeSessionId): Promise<void>;
  compact?(runtimeSessionId: RuntimeSessionId): Promise<AgentCompactResult>;
  truncate?(
    runtimeSessionId: RuntimeSessionId,
    keepThroughTurnIndex: number,
  ): Promise<AgentTruncateEngineResult>;
  restoreLeaf?(
    runtimeSessionId: RuntimeSessionId,
    leafId: string,
  ): Promise<{ ok: boolean; error?: string }>;
  subscribe(listener: AgentEventListener): () => void;
  /** Re-arm the silent-turn watchdog (e.g. while a child subagent is still emitting). */
  touchTurnWatchdog?(runtimeSessionId: RuntimeSessionId): void;
  isTurnLive?(runtimeSessionId: RuntimeSessionId, turnId?: string): boolean;
  cancelPendingPermissions?(runtimeSessionId: RuntimeSessionId): number;
}

export function newRuntimeSessionId(): RuntimeSessionId {
  return `rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newTurnId(): string {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newToolCallId(): string {
  return `call-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
