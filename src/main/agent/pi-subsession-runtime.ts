/**
 * pi-subsession-runtime.ts — Coordinates lightweight, in-memory expert agent execution
 * for the Pi Host environment.
 *
 * Scopes ToolHost to the expert's allowed tools, creates isolated child sessions,
 * tags nested events with parentToolCallId, and guarantees cascading cancellation.
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentEvent } from "../../shared/agent/runtime";
import type { PermissionMode } from "../../shared/agent/session-agent";
import type { PermissionGate } from "./permission-gate";
import { ToolHost } from "./tool-host";
import type { NativeToolDefinition } from "./tools/types";
import type { ResolvedPiRosterEntry } from "./team-binding";
import { ALL_NATIVE_TOOLS } from "./tools/index";
import type { HostSkillDir } from "./skill-loader";
import { createLogger } from "../app/logger";

const log = createLogger("subagent", "agent");

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
  skills?: HostSkillDir[];
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
  /** Team skills shared with every expert sub-session (loaded into the child loader). */
  skills?: HostSkillDir[];
  /** Pre-rendered subagent profile module prompts appended to each expert system prompt. */
  profileModules?: string;
  /** Live team roster — used to prewarm a child session while Task args are still streaming. */
  roster?: readonly ResolvedPiRosterEntry[];
  projectRoot?: string;
  boundCheckoutPath?: string;
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

/** Default child budget — literature / review Tasks routinely run well past a few minutes. */
export const DEFAULT_SUBAGENT_TIMEOUT_MS = 3_600_000;

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

interface PrewarmedChild {
  expertFqid: string;
  parentSessionId: string;
  abortController: AbortController;
  scopedToolHost: ToolHost;
  childText: { current: string };
  runnerPromise: Promise<SubagentSessionRunnerHandle>;
}

export function findRosterExpert(
  roster: readonly ResolvedPiRosterEntry[],
  expertId: string,
): ResolvedPiRosterEntry | undefined {
  const raw = expertId.trim().toLowerCase();
  if (!raw) return undefined;
  return roster.find(
    (entry) =>
      entry.fqid.toLowerCase() === raw
      || entry.runtimeName.toLowerCase() === raw
      || entry.name.toLowerCase() === raw,
  );
}

export class PiSubsessionRuntime {
  private readonly allTools: readonly NativeToolDefinition[];
  private readonly activeSubsessions = new Map<string, ActiveChildSession>();
  private readonly prewarms = new Map<string, PrewarmedChild>();
  private readonly cancelledParentToolCalls = new Set<string>();

  constructor(private readonly opts: PiSubsessionRuntimeOpts) {
    this.allTools = opts.allTools ?? ALL_NATIVE_TOOLS;
  }

  activeSubsessionCount(): number {
    return this.activeSubsessions.size;
  }

  cancelAllForParentSession(parentSessionId: string): number {
    let count = 0;
    for (const [taskId, child] of Array.from(this.activeSubsessions.entries())) {
      if (!parentSessionId || child.parentSessionId === parentSessionId) {
        child.abortController.abort();
        void child.handle?.abort();
        this.activeSubsessions.delete(taskId);
        count += 1;
      }
    }
    for (const [id, slot] of Array.from(this.prewarms.entries())) {
      if (!parentSessionId || slot.parentSessionId === parentSessionId) {
        this.abortPrewarm(id);
        count += 1;
      }
    }
    return count;
  }

  cancelByParentToolCallId(parentToolCallId: string): boolean {
    const id = parentToolCallId.trim();
    if (!id) return false;
    this.cancelledParentToolCalls.add(id);
    let hit = this.abortPrewarm(id);
    for (const child of this.activeSubsessions.values()) {
      if (child.parentToolCallId !== id) continue;
      child.abortController.abort();
      void child.handle?.abort();
      return true;
    }
    return hit || true;
  }

  /**
   * Start the child Pi session as soon as the parent Task streams an expertId,
   * so execute() can prompt() without waiting on session + skills setup.
   */
  prewarmFromParentTool(input: {
    parentSessionId: string;
    parentTabId: string;
    parentTurnId: string;
    parentToolCallId: string;
    expertId: string;
  }): void {
    const id = input.parentToolCallId.trim();
    if (!id || !this.opts.createRunner) return;
    if (this.cancelledParentToolCalls.has(id) || this.prewarms.has(id)) return;
    if ([...this.activeSubsessions.values()].some((child) => child.parentToolCallId === id)) {
      return;
    }
    const projectRoot = this.opts.projectRoot?.trim();
    if (!projectRoot) return;
    const expert = findRosterExpert(this.opts.roster ?? [], input.expertId);
    if (!expert?.available || !expert.isDelegatable) return;

    const abortController = new AbortController();
    const built = this.beginChildSession({
      parentSessionId: input.parentSessionId,
      parentTabId: input.parentTabId,
      parentTurnId: input.parentTurnId,
      parentToolCallId: id,
      expert,
      projectRoot,
      boundCheckoutPath: this.opts.boundCheckoutPath || projectRoot,
      abortController,
    });
    this.prewarms.set(id, {
      expertFqid: expert.fqid,
      parentSessionId: input.parentSessionId,
      abortController,
      ...built,
    });
  }

  private emitTagged(event: AgentEvent, subagentContext: { parentToolCallId: string; expertFqid: string; expertName: string }): void {
    const tagged: AgentEvent = {
      ...event,
      subagent: subagentContext,
    };
    this.opts.onEvent?.(tagged);
  }

  private abortPrewarm(parentToolCallId: string): boolean {
    const slot = this.prewarms.get(parentToolCallId);
    if (!slot) return false;
    this.prewarms.delete(parentToolCallId);
    slot.abortController.abort();
    void slot.runnerPromise.then((handle) => {
      void handle.abort();
      handle.dispose();
    }).catch(() => {});
    return true;
  }

  private takePrewarm(parentToolCallId: string, expertFqid: string): PrewarmedChild | null {
    const slot = this.prewarms.get(parentToolCallId);
    if (!slot) return null;
    this.prewarms.delete(parentToolCallId);
    if (slot.expertFqid !== expertFqid) {
      slot.abortController.abort();
      void slot.runnerPromise.then((handle) => {
        void handle.abort();
        handle.dispose();
      }).catch(() => {});
      return null;
    }
    return slot;
  }

  /** Parent worktree checkout when set; else the paper root. */
  parentCheckoutPath(): string {
    return this.opts.boundCheckoutPath?.trim() || this.opts.projectRoot?.trim() || "";
  }

  private resolveChildCheckout(input: { boundCheckoutPath?: string; projectRoot: string }): string {
    return this.parentCheckoutPath() || input.boundCheckoutPath?.trim() || input.projectRoot;
  }

  private beginChildSession(input: {
    parentSessionId: string;
    parentTabId: string;
    parentTurnId: string;
    parentToolCallId: string;
    expert: ResolvedPiRosterEntry;
    projectRoot: string;
    boundCheckoutPath: string;
    abortController: AbortController;
  }): {
    scopedToolHost: ToolHost;
    childText: { current: string };
    runnerPromise: Promise<SubagentSessionRunnerHandle>;
  } {
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
    const childText = { current: "" };
    const profilePart = this.opts.profileModules?.trim()
      ? `\n\n${this.opts.profileModules.trim()}`
      : "";
    if (!this.opts.createRunner) {
      return {
        scopedToolHost,
        childText,
        runnerPromise: Promise.reject(new Error("no_create_runner")),
      };
    }
    const runnerPromise = this.opts.createRunner({
      runtimeSessionId: `sub-${input.parentSessionId}-${Date.now()}`,
      tabId: input.parentTabId,
      turnId: input.parentTurnId,
      projectRoot: input.projectRoot,
      boundCheckoutPath: input.boundCheckoutPath,
      systemPrompt: `${input.expert.instructions}${profilePart}`,
      scopedToolHost,
      modelRef: input.expert.modelRef,
      thoughtLevel: input.expert.thoughtLevel,
      temperature: input.expert.temperature,
      allowedToolNames: input.expert.allowedTools,
      skills: this.opts.skills,
      emitEvent: (ev) => {
        if (ev.type === "text_delta") childText.current += ev.text;
        this.emitTagged(ev, subagentCtx);
      },
      abortSignal: input.abortController.signal,
    });
    return { scopedToolHost, childText, runnerPromise };
  }

  async runSubagentTask(input: RunSubagentTaskInput): Promise<RunSubagentTaskResult> {
    if (
      input.abortSignal?.aborted
      || this.cancelledParentToolCalls.has(input.parentToolCallId)
    ) {
      this.cancelledParentToolCalls.delete(input.parentToolCallId);
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

    const warmed = this.takePrewarm(input.parentToolCallId, input.expert.fqid);
    if (warmed) {
      const onRunAbort = () => warmed.abortController.abort();
      abortController.signal.addEventListener("abort", onRunAbort, { once: true });
    }

    let timedOut = false;
    const timeoutMs = input.timeoutMs ?? DEFAULT_SUBAGENT_TIMEOUT_MS;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      abortController.abort();
      void activeRecord.handle?.abort();
    }, timeoutMs);
    const abortError = () =>
      timedOut
        ? `subagent_timeout:${input.expert.name} after ${timeoutMs}ms`
        : "cancelled";

    const executionPromise = (async (): Promise<RunSubagentTaskResult> => {
      try {
        if (!this.opts.createRunner) {
          log.info("subagent.start", {
            parentToolCallId: input.parentToolCallId,
            expertFqid: input.expert.fqid,
          });
          return { ok: true, text: `[Simulated output from ${input.expert.name}]: task completed.` };
        }

        let childText = warmed?.childText ?? { current: "" };
        let runner: SubagentSessionRunnerHandle;
        if (warmed && !warmed.abortController.signal.aborted) {
          try {
            runner = await warmed.runnerPromise;
          } catch {
            const built = this.beginChildSession({
              parentSessionId: input.parentSessionId,
              parentTabId: input.parentTabId,
              parentTurnId: input.parentTurnId,
              parentToolCallId: input.parentToolCallId,
              expert: input.expert,
              projectRoot: input.projectRoot,
              boundCheckoutPath: this.resolveChildCheckout(input),
              abortController,
            });
            childText = built.childText;
            runner = await built.runnerPromise;
          }
        } else {
          const built = this.beginChildSession({
            parentSessionId: input.parentSessionId,
            parentTabId: input.parentTabId,
            parentTurnId: input.parentTurnId,
            parentToolCallId: input.parentToolCallId,
            expert: input.expert,
            projectRoot: input.projectRoot,
            boundCheckoutPath: this.resolveChildCheckout(input),
            abortController,
          });
          childText = built.childText;
          runner = await built.runnerPromise;
        }

        activeRecord.handle = runner;
        if (abortController.signal.aborted) {
          void runner.abort();
          runner.dispose();
          return { ok: false, error: abortError() };
        }

        const fullUserPrompt = input.context?.trim()
          ? `Context:\n${input.context.trim()}\n\nTask:\n${input.prompt.trim()}`
          : input.prompt.trim();

        log.info("subagent.start", {
          parentToolCallId: input.parentToolCallId,
          expertFqid: input.expert.fqid,
        });
        await runner.prompt(fullUserPrompt);
        runner.dispose();

        return { ok: true, text: childText.current };
      } catch (err) {
        if (abortController.signal.aborted) {
          return { ok: false, error: abortError() };
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })();

    const abortPromise = new Promise<RunSubagentTaskResult>((resolve) => {
      const finish = () => resolve({ ok: false, error: abortError() });
      if (abortController.signal.aborted) {
        finish();
        return;
      }
      abortController.signal.addEventListener("abort", finish, { once: true });
    });

    try {
      const result = await Promise.race([executionPromise, abortPromise]);
      const outcome = result.ok
        ? "ok"
        : result.error?.startsWith("subagent_timeout")
          ? "subagent_timeout"
          : result.error === "cancelled" || result.error?.startsWith("cancelled")
            ? "cancelled"
            : "error";
      log.info("subagent.end", {
        parentToolCallId: input.parentToolCallId,
        expertFqid: input.expert.fqid,
        ok: outcome,
      });
      return result;
    } finally {
      clearTimeout(timeoutId);
      input.abortSignal?.removeEventListener("abort", onParentAbort);
      this.activeSubsessions.delete(taskId);
    }
  }
}

function taskRosterIds(roster: readonly ResolvedPiRosterEntry[]): string[] {
  return roster
    .filter((entry) => entry.available && entry.isDelegatable)
    .map((entry) => entry.runtimeName);
}

export function createTaskDelegationTool(opts: {
  subsessionRuntime: PiSubsessionRuntime;
  roster: readonly ResolvedPiRosterEntry[];
}): NativeToolDefinition {
  const ids = taskRosterIds(opts.roster);
  const idList = ids.length > 0 ? ids.join(", ") : "(none enabled)";
  return {
    name: "task",
    label: "Delegate Sub-task",
    description:
      `Delegate a scoped sub-problem to a team expert. Call this tool directly — do not search the project for team.json or subagents folders. This session's experts: ${idList}.`,
    promptSnippet: `Delegate to a listed expert: ${idList}`,
    promptGuidelines: [
      "When the user asks for a subagent or team expert, call this tool immediately with expertId from this session's roster.",
      "Do not ls, find, grep, or read team.json, teams.json, or subagents/ folders to discover experts.",
      `expertId must be one of: ${idList}`,
      "Write one scoped prompt: question, materials, and constraints.",
    ],
    parameters: Type.Object({
      expertId: Type.String({
        minLength: 1,
        description: `ID of a listed expert (${idList}). Also accepts that expert's FQID or display name.`,
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

      const target = findRosterExpert(opts.roster, expertIdRaw);

      if (!target) {
        return {
          ok: false,
          error: `unknown_expert:${args.expertId}. Available: ${idList}`,
        };
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
        boundCheckoutPath: opts.subsessionRuntime.parentCheckoutPath() || ctx.projectRoot,
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
