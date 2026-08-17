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
import type {
  AgentSessionStore,
  AgentToolCallSnapshot,
  AgentTurnRecord,
} from "./session-store";
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
    const boundCheckoutPath = input.boundCheckoutPath || input.projectRoot;
    this.sessions.set(runtimeSessionId, {
      runtimeSessionId,
      tabId: input.tabId,
      projectRoot: input.projectRoot,
      abort: null,
      cancelled: false,
    });
    this.opts.store.createSession({
      runtimeSessionId,
      tabId: input.tabId,
      projectRoot: input.projectRoot,
      boundCheckoutPath,
      backend: "in-process",
      permissionMode: input.permissionMode ?? "edit_auto",
      sessionAgent: input.sessionAgent ?? "build",
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

    const existingRecord = this.opts.store.getSession(session.runtimeSessionId);
    const turnIndex = existingRecord?.turns.length ?? 0;
    const createdAt = Date.now();
    let assistantText = "";
    const toolCallSnapshots: AgentToolCallSnapshot[] = [];

    try {
      if (abort.signal.aborted || session.cancelled) {
        emit({
          type: "turn_cancelled",
          runtimeSessionId: session.runtimeSessionId,
          tabId: session.tabId,
          turnId,
        });
        this.opts.store.appendTurn(session.runtimeSessionId, {
          turnIndex,
          turnId,
          createdAt,
          finishedAt: Date.now(),
          user: { text: input.text },
          assistant: { text: "", toolCalls: [] },
          status: "cancelled",
        });
        return;
      }

      const calls = this.scripted.get(session.runtimeSessionId) ?? [];
      this.scripted.delete(session.runtimeSessionId);

      if (calls.length === 0 && input.text.trim()) {
        assistantText = input.text;
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
          this.opts.store.appendTurn(session.runtimeSessionId, {
            turnIndex,
            turnId,
            createdAt,
            finishedAt: Date.now(),
            user: { text: input.text },
            assistant: { text: assistantText, toolCalls: toolCallSnapshots },
            status: "cancelled",
          });
          return;
        }
        const callId = call.toolCallId || `scripted-${turnId}-${index}`;
        const start = Date.now();
        const execResult = await this.opts.toolHost.execute(call.toolName, call.args, {
          runtimeSessionId: session.runtimeSessionId,
          tabId: session.tabId,
          turnId,
          toolCallId: callId,
          projectRoot: session.projectRoot,
          permissionMode: input.permissionMode,
          sessionAgent: input.sessionAgent,
          allowedPaths: input.allowedPaths,
          abortSignal: abort.signal,
        });
        toolCallSnapshots.push({
          toolCallId: callId,
          toolName: call.toolName,
          args: call.args,
          startedAt: start,
          finishedAt: Date.now(),
          result: execResult.result,
          error: execResult.error,
          denied: execResult.denied,
        });
      }

      if (abort.signal.aborted || session.cancelled) {
        emit({
          type: "turn_cancelled",
          runtimeSessionId: session.runtimeSessionId,
          tabId: session.tabId,
          turnId,
        });
        this.opts.store.appendTurn(session.runtimeSessionId, {
          turnIndex,
          turnId,
          createdAt,
          finishedAt: Date.now(),
          user: { text: input.text },
          assistant: { text: assistantText, toolCalls: toolCallSnapshots },
          status: "cancelled",
        });
        return;
      }

      emit({
        type: "turn_finished",
        runtimeSessionId: session.runtimeSessionId,
        tabId: session.tabId,
        turnId,
      });
      this.opts.store.appendTurn(session.runtimeSessionId, {
        turnIndex,
        turnId,
        createdAt,
        finishedAt: Date.now(),
        user: { text: input.text },
        assistant: { text: assistantText, toolCalls: toolCallSnapshots },
        status: "completed",
      });
    } catch (err) {
      if (abort.signal.aborted || session.cancelled) {
        emit({
          type: "turn_cancelled",
          runtimeSessionId: session.runtimeSessionId,
          tabId: session.tabId,
          turnId,
        });
        this.opts.store.appendTurn(session.runtimeSessionId, {
          turnIndex,
          turnId,
          createdAt,
          finishedAt: Date.now(),
          user: { text: input.text },
          assistant: { text: assistantText, toolCalls: toolCallSnapshots },
          status: "cancelled",
        });
        return;
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      emit({
        type: "turn_failed",
        runtimeSessionId: session.runtimeSessionId,
        tabId: session.tabId,
        turnId,
        error: errorMsg,
      });
      this.opts.store.appendTurn(session.runtimeSessionId, {
        turnIndex,
        turnId,
        createdAt,
        finishedAt: Date.now(),
        user: { text: input.text },
        assistant: { text: assistantText, toolCalls: toolCallSnapshots },
        status: "failed",
        error: errorMsg,
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
    // Note: Do not delete session from store; preserve JSON history
  }
}
