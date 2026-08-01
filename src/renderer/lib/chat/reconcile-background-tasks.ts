/**
 * After session hydrate: rebuild SubAgentRun completion from persisted messages.
 * Live `subAgentRuns` are memory-only — without this, reload shows Task cards
 * as done merely because a Timeline-A "started" tool_result exists.
 *
 * Join must be per child session id — a single inject in history must NOT mark
 * every background Task done (that hid the multi-Task live-join bug on reopen).
 */
import type { ChatStreamMessage, ContentBlock, SubAgentRun } from "@/stores/chat-store";
import { contentBlocks } from "@/components/modules/chat/tools/tool-result-map";
import {
  extractBackgroundTaskSessionId,
  listBackgroundTaskJoins,
  isBackgroundTaskStartedResult,
  type BackgroundTaskInject,
} from "@shared/opencode-background-task";

function messagePlainText(msg: ChatStreamMessage): string {
  return contentBlocks(msg.message?.content)
    .filter((b) => b.type === "text" && b.text?.trim())
    .map((b) => b.text!.trim())
    .join("\n");
}

function collectJoinsBySessionId(
  messages: ChatStreamMessage[],
): Map<string, BackgroundTaskInject> {
  const byId = new Map<string, BackgroundTaskInject>();
  for (const msg of messages) {
    const text = messagePlainText(msg);
    if (!text) continue;
    for (const join of listBackgroundTaskJoins(text)) {
      byId.set(join.sessionId, join);
    }
  }
  return byId;
}

export function reconcileBackgroundSubAgentRunsFromMessages(
  messages: ChatStreamMessage[],
  existing: Record<string, SubAgentRun> = {},
): Record<string, SubAgentRun> {
  const toolUses = new Map<string, ContentBlock>();
  const toolResults = new Map<string, ContentBlock>();

  for (const msg of messages) {
    for (const block of contentBlocks(msg.message?.content)) {
      if (block.type === "tool_use" && (block.name || "").toLowerCase() === "task" && block.id) {
        toolUses.set(block.id, block);
      }
      if (block.type === "tool_result" && block.tool_use_id) {
        toolResults.set(block.tool_use_id, block);
      }
    }
  }

  const joinsByChild = collectJoinsBySessionId(messages);
  const next: Record<string, SubAgentRun> = { ...existing };

  for (const [id, toolUse] of toolUses) {
    const result = toolResults.get(id);
    if (!result || result.is_error) continue;
    const started = isBackgroundTaskStartedResult({
      rawInput: toolUse.input ?? toolUse._backfillInput,
      content: result.content,
    });
    if (!started) continue;

    const prev = next[id];
    const expertId =
      String(
        (toolUse.input as Record<string, unknown> | undefined)?.subagent_type
        ?? (toolUse.input as Record<string, unknown> | undefined)?.subagentType
        ?? (toolUse.input as Record<string, unknown> | undefined)?.agent
        ?? prev?.expertId
        ?? "general",
      ).replace(/^@/, "") || "general";
    const prompt = String(
      (toolUse.input as Record<string, unknown> | undefined)?.prompt
      ?? (toolUse.input as Record<string, unknown> | undefined)?.description
      ?? prev?.prompt
      ?? "",
    );

    const childSessionId =
      extractBackgroundTaskSessionId({ content: result.content })
      || prev?.subSessionId
      || undefined;
    const join = childSessionId ? joinsByChild.get(childSessionId) : undefined;

    let status: SubAgentRun["status"] = prev?.status ?? "running";
    if (prev?.status === "done" || prev?.status === "error") {
      status = prev.status;
    } else if (join) {
      status = join.state === "error" ? "error" : "done";
    } else if (status === "stopping") {
      // keep stopping
    } else {
      status = "running";
    }

    next[id] = {
      expertId,
      prompt,
      mode: "background",
      status,
      subSessionId: childSessionId,
      blocks: prev?.blocks ?? [],
      error: join?.state === "error" ? (join.body || join.summary || prev?.error) : prev?.error,
      linkDegraded: prev?.linkDegraded,
    };
  }

  return next;
}
