/**
 * In-process AgentRuntime used by the Spike and contract tests.
 * No LLM and no Pi import — scripted tool calls exercise ToolHost + PermissionGate.
 */

import type {
  AgentEvent,
  CreateSessionInput,
  CreateSessionResult,
  RuntimeSessionId,
  TurnInput,
} from "../../shared/agent-runtime";
import type { AgentEventListener, AgentRuntime } from "./runtime";
import { newRuntimeSessionId, newTurnId } from "./runtime";
import type { AgentSessionStore } from "./session-store";
import { ToolHost, type NativeToolDefinition } from "./tool-host";
import { PermissionGate } from "./permission-gate";

export interface ScriptedToolCall {
  toolName: string;
  args: Record<string, unknown>;
  toolCallId?: string;
}

interface LiveSession {
  runtimeSessionId: RuntimeSessionId;
  tabId: string;
  projectRoot: string;
  abort: AbortController | null;
  cancelled: boolean;
}

export function createInProcessSpike(opts: {
  store: AgentSessionStore;
  tools: NativeToolDefinition[];
  timeoutMs?: number;
  onEvent?: (event: AgentEvent) => void;
}): {
  runtime: InProcessAgentRuntime;
  gate: PermissionGate;
  toolHost: ToolHost;
  events: AgentEvent[];
} {
  const events: AgentEvent[] = [];
  const emit = (event: AgentEvent) => {
    events.push(event);
    opts.onEvent?.(event);
  };
  const gate = new PermissionGate({
    timeoutMs: opts.timeoutMs,
    onPrompt: (req) => {
      emit({
        type: "permission_requested",
        runtimeSessionId: req.runtimeSessionId,
        tabId: req.tabId,
        turnId: req.turnId,
        requestId: req.requestId,
        toolCallId: req.toolCallId,
        toolName: req.toolName,
        args: req.args,
      });
    },
  });
  const toolHost = new ToolHost({ gate, onEvent: emit });
  toolHost.registerAll(opts.tools);
  const runtime = new InProcessAgentRuntime({ toolHost, store: opts.store, gate });
  runtime.subscribe(emit);
  return { runtime, gate, toolHost, events };
}

export class InProcessAgentRuntime implements AgentRuntime {
  private readonly sessions = new Map<RuntimeSessionId, LiveSession>();
  private readonly scripted = new Map<RuntimeSessionId, ScriptedToolCall[]>();
  private readonly listeners = new Set<AgentEventListener>();

  constructor(
    private readonly opts: {
      toolHost: ToolHost;
      store: AgentSessionStore;
      gate: PermissionGate;
    },
  ) {}

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Test / spike only — next sendTurn runs these tools instead of an LLM. */
  scriptNextTurn(runtimeSessionId: RuntimeSessionId, calls: ScriptedToolCall[]): void {
    this.scripted.set(runtimeSessionId, calls);
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    const runtimeSessionId = newRuntimeSessionId();
    const now = new Date().toISOString();
    this.sessions.set(runtimeSessionId, {
      runtimeSessionId,
      tabId: input.tabId,
      projectRoot: input.projectRoot,
      abort: null,
      cancelled: false,
    });
    this.opts.store.put({
      runtimeSessionId,
      tabId: input.tabId,
      projectRoot: input.projectRoot,
      backend: "in-process",
      permissionMode: input.permissionMode ?? "edit_auto",
      sessionAgent: input.sessionAgent ?? "build",
      createdAt: now,
      updatedAt: now,
    });
    return { runtimeSessionId, tabId: input.tabId };
  }

  async sendTurn(input: TurnInput): Promise<void> {
    const session = this.sessions.get(input.runtimeSessionId);
    if (!session) {
      throw new Error(`unknown_session:${input.runtimeSessionId}`);
    }
    if (session.tabId !== input.tabId) {
      throw new Error(`tab_mismatch:${input.tabId}`);
    }

    const turnId = newTurnId();
    const abort = new AbortController();
    session.abort = abort;
    session.cancelled = false;

    const onAbort = () => abort.abort();
    input.abortSignal?.addEventListener("abort", onAbort, { once: true });

    const emit = (event: AgentEvent) => {
      for (const listener of this.listeners) listener(event);
    };

    try {
      if (abort.signal.aborted || session.cancelled) {
        emit({
          type: "turn_cancelled",
          runtimeSessionId: session.runtimeSessionId,
          tabId: session.tabId,
          turnId,
        });
        return;
      }

      const calls = this.scripted.get(session.runtimeSessionId) ?? [];
      this.scripted.delete(session.runtimeSessionId);

      if (calls.length === 0 && input.text.trim()) {
        emit({
          type: "text_delta",
          runtimeSessionId: session.runtimeSessionId,
          tabId: session.tabId,
          turnId,
          text: input.text,
        });
      }

      for (const [index, call] of calls.entries()) {
        if (abort.signal.aborted || session.cancelled) {
          emit({
            type: "turn_cancelled",
            runtimeSessionId: session.runtimeSessionId,
            tabId: session.tabId,
            turnId,
          });
          return;
        }
        await this.opts.toolHost.execute(call.toolName, call.args, {
          runtimeSessionId: session.runtimeSessionId,
          tabId: session.tabId,
          turnId,
          toolCallId: call.toolCallId || `scripted-${turnId}-${index}`,
          projectRoot: session.projectRoot,
          permissionMode: input.permissionMode,
          sessionAgent: input.sessionAgent,
          allowedPaths: input.allowedPaths,
          abortSignal: abort.signal,
        });
      }

      if (abort.signal.aborted || session.cancelled) {
        emit({
          type: "turn_cancelled",
          runtimeSessionId: session.runtimeSessionId,
          tabId: session.tabId,
          turnId,
        });
        return;
      }

      emit({
        type: "turn_finished",
        runtimeSessionId: session.runtimeSessionId,
        tabId: session.tabId,
        turnId,
      });
    } catch (err) {
      if (abort.signal.aborted || session.cancelled) {
        emit({
          type: "turn_cancelled",
          runtimeSessionId: session.runtimeSessionId,
          tabId: session.tabId,
          turnId,
        });
        return;
      }
      emit({
        type: "turn_failed",
        runtimeSessionId: session.runtimeSessionId,
        tabId: session.tabId,
        turnId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      input.abortSignal?.removeEventListener("abort", onAbort);
      session.abort = null;
    }
  }

  async cancelTurn(runtimeSessionId: RuntimeSessionId): Promise<void> {
    const session = this.sessions.get(runtimeSessionId);
    if (!session) return;
    session.cancelled = true;
    session.abort?.abort();
    this.opts.gate.cancelSession(runtimeSessionId);
  }

  async disposeSession(runtimeSessionId: RuntimeSessionId): Promise<void> {
    await this.cancelTurn(runtimeSessionId);
    this.sessions.delete(runtimeSessionId);
    this.scripted.delete(runtimeSessionId);
    this.opts.store.delete(runtimeSessionId);
  }
}
