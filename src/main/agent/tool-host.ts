/**
 * Native ToolHost — Single host execution layer for PrismNext Pi Agent.
 *
 * Enforces PermissionGate.decide() before execution, ensures toolCallId idempotency,
 * and emits standardized AgentEvents (tool_started / tool_finished).
 */

import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AgentEvent, AgentToolCallId } from "../../shared/agent-runtime";
import type { PermissionMode, SessionAgent } from "../../shared/session-agent";
import {
  extractToolPathContext,
  type PermissionGate,
  type PermissionGateRequest,
} from "./permission-gate";
import type { NativeToolDefinition } from "./tools/types";

export type { NativeToolDefinition } from "./tools/types";

export interface ToolExecuteContext {
  runtimeSessionId: string;
  tabId: string;
  turnId: string;
  toolCallId: AgentToolCallId;
  projectRoot: string;
  permissionMode: PermissionMode;
  sessionAgent?: SessionAgent;
  allowedPaths?: string[];
  abortSignal?: AbortSignal;
  askUser?: (input: {
    prompt: string;
    options?: string[];
    multiSelect?: boolean;
  }) => Promise<{ ok: boolean; answer?: string; selected?: string[]; cancelled?: boolean; reason?: string }>;
  suggestPlan?: (input: {
    reason: string;
  }) => Promise<{ accepted: boolean; reason?: string }>;
}

export interface ToolExecuteResult {
  ok: boolean;
  denied?: boolean;
  error?: string;
  result?: unknown;
  reused?: boolean;
}

export type ToolHostEventSink = (event: AgentEvent) => void;

export class ToolHost {
  private readonly tools = new Map<string, NativeToolDefinition>();
  private readonly executed = new Map<string, Promise<ToolExecuteResult>>();
  private readonly sinks = new Set<ToolHostEventSink>();

  constructor(
    private readonly opts: {
      gate: PermissionGate;
      onEvent?: ToolHostEventSink;
    },
  ) {}

  addEventSink(sink: ToolHostEventSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  private dispatchEvent(event: AgentEvent): void {
    this.opts.onEvent?.(event);
    for (const sink of this.sinks) {
      sink(event);
    }
  }

  register(tool: NativeToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: readonly NativeToolDefinition[]): void {
    for (const tool of tools) this.register(tool);
  }

  get(name: string): NativeToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): NativeToolDefinition[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  forget(toolCallId: string): void {
    this.executed.delete(toolCallId);
  }

  /** Convert registered native tools into Pi SDK ToolDefinition objects dynamically. */
  toPiTools(getContext: () => Omit<ToolExecuteContext, "toolCallId" | "abortSignal">): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) =>
      defineTool({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        parameters: tool.parameters,
        execute: async (toolCallId, args, signal) => {
          const result = await this.execute(tool.name, args as Record<string, unknown>, {
            ...getContext(),
            toolCallId,
            abortSignal: signal,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            details: result,
          };
        },
      }),
    );
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    ctx: ToolExecuteContext,
  ): Promise<ToolExecuteResult> {
    const existing = this.executed.get(ctx.toolCallId);
    if (existing) {
      const result = await existing;
      return { ...result, reused: true };
    }

    const run = this.runOnce(toolName, args, ctx);
    this.executed.set(ctx.toolCallId, run);
    return run;
  }

  private async runOnce(
    toolName: string,
    args: Record<string, unknown>,
    ctx: ToolExecuteContext,
  ): Promise<ToolExecuteResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { ok: false, error: `unknown_tool:${toolName}` };
    }

    this.dispatchEvent({
      type: "tool_started",
      runtimeSessionId: ctx.runtimeSessionId,
      tabId: ctx.tabId,
      turnId: ctx.turnId,
      toolCallId: ctx.toolCallId,
      toolName,
      args,
    });

    if (ctx.abortSignal?.aborted) {
      return this.finish(ctx, toolName, {
        ok: false,
        denied: true,
        error: "cancelled",
      });
    }

    const paths = extractToolPathContext(toolName, args, ctx.projectRoot);
    const request: PermissionGateRequest = {
      requestId: `perm-${ctx.toolCallId}`,
      runtimeSessionId: ctx.runtimeSessionId,
      tabId: ctx.tabId,
      turnId: ctx.turnId,
      toolCallId: ctx.toolCallId,
      toolName,
      args,
      projectRoot: ctx.projectRoot,
      permissionMode: ctx.permissionMode,
      sessionAgent: ctx.sessionAgent,
      allowedPaths: ctx.allowedPaths,
      ...paths,
    };

    const decision = await this.opts.gate.decide(request);
    if (decision.decision === "deny") {
      return this.finish(ctx, toolName, {
        ok: false,
        denied: true,
        error: decision.reason,
      });
    }

    if (ctx.abortSignal?.aborted) {
      return this.finish(ctx, toolName, {
        ok: false,
        denied: true,
        error: "cancelled",
      });
    }

    try {
      const result = await tool.execute(args, ctx);
      return this.finish(ctx, toolName, { ok: true, result });
    } catch (err) {
      return this.finish(ctx, toolName, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private finish(
    ctx: ToolExecuteContext,
    toolName: string,
    result: ToolExecuteResult,
  ): ToolExecuteResult {
    this.dispatchEvent({
      type: "tool_finished",
      runtimeSessionId: ctx.runtimeSessionId,
      tabId: ctx.tabId,
      turnId: ctx.turnId,
      toolCallId: ctx.toolCallId,
      toolName,
      ok: result.ok,
      denied: result.denied,
      error: result.error,
      result: result.result,
    });
    return result;
  }
}
