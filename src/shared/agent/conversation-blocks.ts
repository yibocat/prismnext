/**
 * Event-order assistant timeline. Shared by the Conversation reducer and
 * the main-process turn accumulator so persist/hydrate match live folds.
 */

import type { ContentBlock, ConversationSubagentRun } from "./conversation";
import type { AgentEvent } from "./runtime";
import { toolArgsHaveContent } from "./runtime";

export function appendTextBlock(blocks: ContentBlock[], text: string): ContentBlock[] {
  const last = blocks.at(-1);
  if (last?.type === "text" && !last.is_error) {
    return [...blocks.slice(0, -1), { ...last, text: `${last.text ?? ""}${text}` }];
  }
  return [...blocks, { type: "text", text }];
}

export function appendThinkingBlock(blocks: ContentBlock[], text: string): ContentBlock[] {
  const last = blocks.at(-1);
  if (last?.type === "thinking" && typeof last.timeEnd !== "number") {
    return [...blocks.slice(0, -1), { ...last, thinking: `${last.thinking ?? ""}${text}` }];
  }
  const now = Date.now();
  return [...blocks, { type: "thinking", thinking: text, timeStart: now }];
}

/** Freeze open thinking so the live "Thinking…" timer stops when prose or a tool starts. */
export function sealOpenThinkingBlocks(blocks: ContentBlock[], at = Date.now()): ContentBlock[] {
  let changed = false;
  const next = blocks.map((block) => {
    if (block.type !== "thinking") return block;
    if (typeof block.timeEnd === "number") return block;
    changed = true;
    const duration = typeof block.timeStart === "number"
      ? Math.max(0, Math.round(((at - block.timeStart) / 1000) * 10) / 10)
      : undefined;
    return { ...block, timeEnd: at, ...(duration !== undefined ? { duration } : {}) };
  });
  return changed ? next : blocks;
}

export function upsertToolUseBlock(blocks: ContentBlock[], block: ContentBlock): ContentBlock[] {
  const idx = blocks.findIndex((item) => item.type === "tool_use" && item.id === block.id);
  if (idx >= 0) {
    const next = blocks.slice();
    next[idx] = { ...next[idx], ...block };
    return next;
  }
  return [...blocks, block];
}

export function updateToolUseBlock(
  blocks: ContentBlock[],
  toolCallId: string,
  patch: Partial<ContentBlock>,
): ContentBlock[] {
  return blocks.map((block) => (
    block.type === "tool_use" && block.id === toolCallId
      ? { ...block, ...patch }
      : block
  ));
}

export function finishToolBlock(
  blocks: ContentBlock[],
  event: Extract<AgentEvent, { type: "tool_finished" }>,
): ContentBlock[] {
  const status = event.ok && !event.denied ? "completed" : "failed";
  const withUse = updateToolUseBlock(blocks, event.toolCallId, { status });
  const hasResult = withUse.some((block) => (
    block.type === "tool_result" && block.tool_use_id === event.toolCallId
  ));
  if (hasResult) return withUse;
  return [
    ...withUse,
    {
      type: "tool_result",
      tool_use_id: event.toolCallId,
      name: event.toolName,
      content: event.error ?? event.result,
      is_error: Boolean(event.error || event.denied || !event.ok),
      status,
      outcome: event.outcome,
    },
  ];
}

/** Apply one incremental AgentEvent onto an assistant block list. */
export function applyAssistantEventToBlocks(
  blocks: ContentBlock[],
  event: AgentEvent,
): ContentBlock[] {
  switch (event.type) {
    case "text_delta":
      return appendTextBlock(sealOpenThinkingBlocks(blocks), event.text);
    case "thinking_delta":
      return appendThinkingBlock(blocks, event.text);
    case "tool_started": {
      const existing = blocks.find(
        (block) => block.type === "tool_use" && block.id === event.toolCallId,
      );
      const nextArgs = Object.keys(event.args).length > 0
        ? event.args
        : (existing?.input && typeof existing.input === "object" ? existing.input : event.args);
      const argsReady = toolArgsHaveContent(
        nextArgs && typeof nextArgs === "object" && !Array.isArray(nextArgs)
          ? nextArgs as Record<string, unknown>
          : undefined,
      );
      const status =
        existing?.status === "running" || argsReady
          ? "running"
          : event.preparing
            ? "preparing"
            : "running";
      return upsertToolUseBlock(sealOpenThinkingBlocks(blocks), {
        type: "tool_use",
        id: event.toolCallId,
        name: event.toolName,
        input: nextArgs,
        status,
        timeStart: typeof existing?.timeStart === "number" ? existing.timeStart : Date.now(),
      });
    }
    case "tool_progress":
      return updateToolUseBlock(blocks, event.toolCallId, {
        title: event.text,
        status: "running",
      });
    case "tool_finished":
      return finishToolBlock(blocks, event);
    default:
      return blocks;
  }
}

export interface DerivedToolCallSnapshot {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  denied?: boolean;
  startedAt: number;
  finishedAt?: number;
}

function argsFromBlockInput(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

/** Flatten blocks back into the legacy assistant fields for old hydrators. */
export function deriveFlattenedAssistant(blocks: ContentBlock[]): {
  text: string;
  thinking: string;
  toolCalls: DerivedToolCallSnapshot[];
} {
  const text = blocks
    .filter((block) => block.type === "text" && !block.is_error)
    .map((block) => block.text ?? "")
    .join("");
  const thinking = blocks
    .filter((block) => block.type === "thinking")
    .map((block) => block.thinking ?? "")
    .join("");
  const results = new Map<string, ContentBlock>();
  for (const block of blocks) {
    if (block.type === "tool_result" && block.tool_use_id) {
      results.set(block.tool_use_id, block);
    }
  }
  const toolCalls: DerivedToolCallSnapshot[] = [];
  for (const block of blocks) {
    if (block.type !== "tool_use" || !block.id) continue;
    const result = results.get(block.id);
    const snapshot: DerivedToolCallSnapshot = {
      toolCallId: block.id,
      toolName: block.name ?? "",
      args: argsFromBlockInput(block.input),
      startedAt: typeof block.timeStart === "number" ? block.timeStart : 0,
    };
    if (typeof block.timeEnd === "number") snapshot.finishedAt = block.timeEnd;
    if (result) {
      if (result.is_error) {
        snapshot.error = typeof result.content === "string"
          ? result.content
          : "Execution denied or failed";
      } else {
        snapshot.result = result.content;
      }
    }
    toolCalls.push(snapshot);
  }
  return { text, thinking, toolCalls };
}

/** Close open thinking/tool timings at turn end so settled folds show real durations. */
export function sealTurnBlockTimings(blocks: ContentBlock[]): ContentBlock[] {
  const now = Date.now();
  let changed = false;
  const next = blocks.map((block) => {
    if (block.type !== "thinking" && block.type !== "tool_use") return block;
    if (typeof block.timeEnd === "number") return block;
    changed = true;
    const timeEnd = now;
    const duration = typeof block.timeStart === "number"
      ? Math.max(0, Math.round(((timeEnd - block.timeStart) / 1000) * 10) / 10)
      : undefined;
    return { ...block, timeEnd, ...(duration !== undefined ? { duration } : {}) };
  });
  return changed ? next : blocks;
}

export function taskExpertIdFromInput(input: unknown): string {
  const rec = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  for (const key of ["expertId", "subagent_type", "subagentType", "agent"] as const) {
    const value = rec[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().replace(/^@/, "");
    }
  }
  return "";
}

export function taskPromptFromInput(input: unknown): string {
  const rec = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  for (const key of ["prompt", "description"] as const) {
    const value = rec[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Unwrap Pi / host tool payloads to the text the user should see. */
export function contentBlockPlainText(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content === "object") {
    const rec = content as Record<string, unknown>;
    if (typeof rec.result === "string" && rec.result.trim()) return rec.result.trim();
    if (typeof rec.text === "string" && rec.text.trim()) return rec.text.trim();
    if (typeof rec.output === "string" && rec.output.trim()) return rec.output.trim();
    if ("content" in rec) {
      const inner = contentBlockPlainText(rec.content);
      if (inner) return inner;
    }
    if (typeof rec.error === "string" && rec.error.trim()) return rec.error.trim();
  }
  return "";
}

/** Rebuild Task runs from a turn's tool_use / tool_result pair (hydrate / late open). */
export function collectTaskRunsFromBlocks(blocks: ContentBlock[]): ConversationSubagentRun[] {
  const results = new Map<string, ContentBlock>();
  for (const block of blocks) {
    if (block.type === "tool_result" && block.tool_use_id) {
      results.set(block.tool_use_id, block);
    }
  }
  const runs: ConversationSubagentRun[] = [];
  for (const block of blocks) {
    if (block.type !== "tool_use" || (block.name || "").toLowerCase() !== "task" || !block.id) {
      continue;
    }
    const expertId = taskExpertIdFromInput(block.input);
    const prompt = taskPromptFromInput(block.input);
    const result = results.get(block.id);
    const text = contentBlockPlainText(result?.content);
    const failed = Boolean(result?.is_error);
    runs.push({
      parentToolCallId: block.id,
      expertFqid: expertId,
      expertName: expertId,
      status: result ? (failed ? "error" : "done") : "running",
      blocks: text && !failed ? [{ type: "text", text }] : [],
      prompt,
      ...(failed ? { error: text || "subagent_failed" } : {}),
    });
  }
  return runs;
}

export function applySubagentEventToRuns(
  runs: Record<string, ConversationSubagentRun>,
  event: AgentEvent,
): Record<string, ConversationSubagentRun> {
  const ctx = event.subagent;
  if (!ctx) return runs;
  const id = ctx.parentToolCallId;
  const existing = runs[id];
  let run: ConversationSubagentRun = existing ?? {
    parentToolCallId: id,
    expertFqid: ctx.expertFqid,
    expertName: ctx.expertName,
    status: "running",
    blocks: [],
  };
  if (ctx.expertFqid) run = { ...run, expertFqid: ctx.expertFqid };
  if (ctx.expertName) run = { ...run, expertName: ctx.expertName };

  switch (event.type) {
    case "text_delta":
    case "thinking_delta":
    case "tool_started":
    case "tool_progress":
    case "tool_finished":
      run = { ...run, blocks: applyAssistantEventToBlocks(run.blocks, event) };
      break;
    case "turn_finished":
      if (run.status === "running" || run.status === "stopping") {
        run = { ...run, status: run.status === "stopping" ? "error" : "done" };
      }
      break;
    case "turn_cancelled":
      run = { ...run, status: "error", error: run.error || "cancelled" };
      break;
    case "turn_failed":
      run = { ...run, status: "error", error: event.error };
      break;
    default:
      break;
  }
  return { ...runs, [id]: run };
}
