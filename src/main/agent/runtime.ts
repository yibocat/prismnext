/**
 * AgentRuntime — lifecycle surface used by ChatGateway / IPC later.
 * Production chat still goes through AcpService; this is the future contract.
 */

import type {
  AgentEvent,
  CreateSessionInput,
  CreateSessionResult,
  RuntimeSessionId,
  TurnInput,
} from "../../shared/agent-runtime";

export type AgentEventListener = (event: AgentEvent) => void;

export interface AgentRuntime {
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  sendTurn(input: TurnInput): Promise<void>;
  cancelTurn(runtimeSessionId: RuntimeSessionId): Promise<void>;
  disposeSession(runtimeSessionId: RuntimeSessionId): Promise<void>;
  subscribe(listener: AgentEventListener): () => void;
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
