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
import { createLogger, shortLogDetail } from "../services/logger";

const log = createLogger("tool-host", "agent");

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
    /** Prefer the parent toolCallId so chrome and the transcript share one id. */
    requestId?: string;
  }) => Promise<{ ok: boolean; answer?: string; selected?: string[]; cancelled?: boolean; reason?: string }>;
  suggestPlan?: (input: {
    reason: string;
  }) => Promise<{ accepted: boolean; reason?: string; runtimeSessionId?: string }>;
}

export interface ToolExecuteResult {
  ok: boolean;
  denied?: boolean;
  error?: string;
  result?: unknown;
  reused?: boolean;
}

export type ToolHostEventSink = (event: AgentEvent) => void;

function interpretExecuteResult(value: unknown): ToolExecuteResult {
  if (value && typeof value === "object" && "ok" in value) {
    const rec = value as {
      ok?: unknown;
      error?: unknown;
      denied?: unknown;
      result?: unknown;
    };
    if (rec.ok === false) {
      return {
        ok: false,
        denied: rec.denied === true,
        error: typeof rec.error === "string" && rec.error.trim()
          ? rec.error
          : "tool_failed",
        result: rec.result ?? value,
      };
    }
  }
  return { ok: true, result: value };
}

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
        ...(tool.promptSnippet ? { promptSnippet: tool.promptSnippet } : {}),
        ...(tool.promptGuidelines?.length
          ? { promptGuidelines: tool.promptGuidelines }
          : {}),
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
      log.warn("tool.execute.error", { toolName, toolCallId: ctx.toolCallId, error: `unknown_tool:${toolName}` });
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
      sessionId: ctx.tabId,
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

    const startedAt = Date.now();
    log.info("tool.execute.start", { toolName, toolCallId: ctx.toolCallId });
    try {
      const result = interpretExecuteResult(await tool.execute(args, ctx));
      const ok = result.ok ? "ok" : result.denied ? "denied" : "error";
      log.info("tool.execute.end", {
        toolName,
        toolCallId: ctx.toolCallId,
        durationMs: Date.now() - startedAt,
        ok,
      });
      if (ok === "error") {
        log.warn("tool.execute.error", {
          toolName,
          toolCallId: ctx.toolCallId,
          error: shortLogDetail(result.error),
        });
      }
      return this.finish(ctx, toolName, result);
    } catch (err) {
      log.info("tool.execute.end", {
        toolName,
        toolCallId: ctx.toolCallId,
        durationMs: Date.now() - startedAt,
        ok: "error",
      });
      log.warn("tool.execute.error", {
        toolName,
        toolCallId: ctx.toolCallId,
        error: shortLogDetail(err),
      });
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
