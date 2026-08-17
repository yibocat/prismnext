/**
 * pi-subsession-runtime.ts — Coordinates lightweight, in-memory expert agent execution
 * for the Pi Host environment.
 *
 * Scopes ToolHost to the expert's allowed tools, creates isolated child sessions,
 * tags nested events with parentToolCallId, and guarantees cascading cancellation.
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentEvent } from "../../shared/agent-runtime";
import type { PermissionMode } from "../../shared/session-agent";
import type { PermissionGate } from "./permission-gate";
import { ToolHost } from "./tool-host";
import type { NativeToolDefinition } from "./tools/types";
import type { ResolvedPiRosterEntry } from "./team-binding";
import { ALL_NATIVE_TOOLS } from "./tools/index";

export interface SubagentSessionRunnerInput {
  runtimeSessionId: string;
  tabId: string;
  turnId: string;
  projectRoot: string;
  boundCheckoutPath: string;
  systemPrompt: string;
  scopedToolHost: ToolHost;
  modelRef?: { provider: string; modelId: string };
  thoughtLevel?: string;
  temperature?: number;
  allowedToolNames?: string[];
  emitEvent: (event: AgentEvent) => void;
  abortSignal: AbortSignal;
}

export interface SubagentSessionRunnerHandle {
  prompt: (userPrompt: string) => Promise<void>;
  abort: () => Promise<void> | void;
  dispose: () => void;
}

export type SubagentSessionRunnerFactory = (
  input: SubagentSessionRunnerInput,
) => Promise<SubagentSessionRunnerHandle>;

export interface PiSubsessionRuntimeOpts {
  allTools?: readonly NativeToolDefinition[];
  gate: PermissionGate;
  createRunner?: SubagentSessionRunnerFactory;
  onEvent?: (event: AgentEvent) => void;
}

export interface RunSubagentTaskInput {
  parentSessionId: string;
  parentTabId: string;
  parentTurnId: string;
  parentToolCallId: string;
  projectRoot: string;
  boundCheckoutPath: string;
  permissionMode: PermissionMode;
  expert: ResolvedPiRosterEntry;
  prompt: string;
  context?: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

export interface RunSubagentTaskResult {
  ok: boolean;
  text?: string;
  error?: string;
}

interface ActiveChildSession {
  taskId: string;
  parentSessionId: string;
  parentToolCallId: string;
  abortController: AbortController;
  handle?: SubagentSessionRunnerHandle;
}

export class PiSubsessionRuntime {
  private readonly allTools: readonly NativeToolDefinition[];
  private readonly activeSubsessions = new Map<string, ActiveChildSession>();

  constructor(private readonly opts: PiSubsessionRuntimeOpts) {
    this.allTools = opts.allTools ?? ALL_NATIVE_TOOLS;
  }

  activeSubsessionCount(): number {
    return this.activeSubsessions.size;
  }

  cancelAllForParentSession(parentSessionId: string): number {
    let count = 0;
    for (const [taskId, child] of Array.from(this.activeSubsessions.entries())) {
      if (child.parentSessionId === parentSessionId) {
        child.abortController.abort();
        void child.handle?.abort();
        this.activeSubsessions.delete(taskId);
        count += 1;
      }
    }
    return count;
  }

  cancelByParentToolCallId(parentToolCallId: string): boolean {
    const id = parentToolCallId.trim();
    if (!id) return false;
    for (const child of this.activeSubsessions.values()) {
      if (child.parentToolCallId !== id) continue;
      child.abortController.abort();
      void child.handle?.abort();
      return true;
    }
    return false;
  }

  private emitTagged(event: AgentEvent, subagentContext: { parentToolCallId: string; expertFqid: string; expertName: string }): void {
    const tagged: AgentEvent = {
      ...event,
      subagent: subagentContext,
    };
    this.opts.onEvent?.(tagged);
  }

  async runSubagentTask(input: RunSubagentTaskInput): Promise<RunSubagentTaskResult> {
    if (input.abortSignal?.aborted) {
      return { ok: false, error: "cancelled" };
    }

    const taskId = `${input.parentToolCallId}-${Date.now()}`;
    const abortController = new AbortController();
    const onParentAbort = () => abortController.abort();
    input.abortSignal?.addEventListener("abort", onParentAbort, { once: true });

    const activeRecord: ActiveChildSession = {
      taskId,
      parentSessionId: input.parentSessionId,
      parentToolCallId: input.parentToolCallId,
      abortController,
    };
    this.activeSubsessions.set(taskId, activeRecord);

    const subagentCtx = {
      parentToolCallId: input.parentToolCallId,
      expertFqid: input.expert.fqid,
      expertName: input.expert.name,
    };

    const allowedSet = new Set(input.expert.allowedTools.map((t) => t.toLowerCase()));
    const scopedTools = this.allTools.filter((t) => allowedSet.has(t.name.toLowerCase()));

    const scopedToolHost = new ToolHost({
      gate: this.opts.gate,
      onEvent: (ev) => this.emitTagged(ev, subagentCtx),
    });
    scopedToolHost.registerAll(scopedTools);

    let childText = "";
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutMs = input.timeoutMs ?? 120_000;

    const timeoutPromise = new Promise<RunSubagentTaskResult>((_, reject) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        reject(new Error(`subagent_timeout:${input.expert.name} after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const executionPromise = (async (): Promise<RunSubagentTaskResult> => {
      try {
        if (!this.opts.createRunner) {
          return { ok: true, text: `[Simulated output from ${input.expert.name}]: task completed.` };
        }

        const childSessionId = `sub-${input.parentSessionId}-${Date.now()}`;
        const runner = await this.opts.createRunner({
          runtimeSessionId: childSessionId,
          tabId: input.parentTabId,
          turnId: input.parentTurnId,
          projectRoot: input.projectRoot,
          boundCheckoutPath: input.boundCheckoutPath,
          systemPrompt: input.expert.instructions,
          scopedToolHost,
          modelRef: input.expert.modelRef,
          thoughtLevel: input.expert.thoughtLevel,
          temperature: input.expert.temperature,
          allowedToolNames: input.expert.allowedTools,
          emitEvent: (ev) => {
            if (ev.type === "text_delta") {
              childText += ev.text;
            }
            this.emitTagged(ev, subagentCtx);
          },
          abortSignal: abortController.signal,
        });

        activeRecord.handle = runner;

        const fullUserPrompt = input.context?.trim()
          ? `Context:\n${input.context.trim()}\n\nTask:\n${input.prompt.trim()}`
          : input.prompt.trim();

        await runner.prompt(fullUserPrompt);
        runner.dispose();

        return { ok: true, text: childText };
      } catch (err) {
        if (abortController.signal.aborted) {
          return { ok: false, error: "cancelled" };
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })();

    const abortPromise = new Promise<RunSubagentTaskResult>((resolve) => {
      if (abortController.signal.aborted) {
        resolve({ ok: false, error: "cancelled" });
      } else {
        abortController.signal.addEventListener(
          "abort",
          () => resolve({ ok: false, error: "cancelled" }),
          { once: true },
        );
      }
    });

    try {
      const result = await Promise.race([executionPromise, timeoutPromise, abortPromise]);
      return result;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      input.abortSignal?.removeEventListener("abort", onParentAbort);
      this.activeSubsessions.delete(taskId);
    }
  }
}

export function createTaskDelegationTool(opts: {
  subsessionRuntime: PiSubsessionRuntime;
  roster: readonly ResolvedPiRosterEntry[];
}): NativeToolDefinition {
  return {
    name: "task",
    label: "Delegate Sub-task",
    description:
      "Delegate a specialized academic sub-task to an expert agent (e.g. citation-auditor, experiment-analyst). " +
      "The expert runs in an isolated sub-session with scoped tools and returns its findings.",
    parameters: Type.Object({
      expertId: Type.String({
        minLength: 1,
        description: "ID or FQID of the expert agent to delegate to",
      }),
      prompt: Type.String({
        minLength: 1,
        description: "Detailed instructions and requirements for the expert",
      }),
      context: Type.Optional(
        Type.String({
          description: "Optional background context, text snippets, or citation keys",
        }),
      ),
    }),
    permission: {
      category: "safe_write",
    },
    execute: async (args, ctx) => {
      const expertIdRaw = typeof args.expertId === "string" ? args.expertId.trim().toLowerCase() : "";
      if (!expertIdRaw) {
        return { ok: false, error: "missing_expert_id" };
      }

      const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
      if (!prompt) {
        return { ok: false, error: "missing_prompt" };
      }

      const target = opts.roster.find(
        (r) =>
          r.fqid.toLowerCase() === expertIdRaw ||
          r.runtimeName.toLowerCase() === expertIdRaw ||
          r.name.toLowerCase() === expertIdRaw,
      );

      if (!target) {
        return { ok: false, error: `unknown_expert:${args.expertId}` };
      }

      if (!target.available || !target.isDelegatable) {
        const reason = target.unavailableReason || target.delegationBlockedReason || "unavailable";
        return { ok: false, error: `expert_unavailable:${reason}` };
      }

      const result = await opts.subsessionRuntime.runSubagentTask({
        parentSessionId: ctx.runtimeSessionId,
        parentTabId: ctx.tabId,
        parentTurnId: ctx.turnId,
        parentToolCallId: ctx.toolCallId,
        projectRoot: ctx.projectRoot,
        boundCheckoutPath: ctx.projectRoot,
        permissionMode: ctx.permissionMode,
        expert: target,
        prompt,
        context: typeof args.context === "string" ? args.context : undefined,
        abortSignal: ctx.abortSignal,
      });

      if (!result.ok) {
        return { ok: false, error: result.error || "subagent_execution_failed" };
      }

      return { ok: true, result: result.text };
    },
  };
}
