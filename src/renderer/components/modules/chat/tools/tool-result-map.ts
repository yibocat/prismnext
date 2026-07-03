import type { ChatStreamMessage, ContentBlock } from "@/stores/chat-store";

/** Safely iterate content blocks, handling both array and string formats. */
export function contentBlocks(
  content: string | ContentBlock[] | undefined,
): ContentBlock[] {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}

const ACTIVE_TOOL_STATUSES = new Set([
  "",
  "running",
  "pending",
  "in_progress",
  "in-progress",
  "executing",
  "started",
]);

const ERROR_TOOL_STATUSES = new Set([
  "failed",
  "cancelled",
  "canceled",
  "denied",
  "rejected",
  "aborted",
  "error",
  "timeout",
  "timed_out",
]);

export function isActiveToolStatus(status: string | undefined | null): boolean {
  return ACTIVE_TOOL_STATUSES.has((status || "").toLowerCase());
}

/** Build a tool_result block from OpenCode's embedded tool part state. */
export function createToolResultFromState(
  toolUseId: string,
  status: string,
  output: unknown,
): ContentBlock | null {
  const normalized = (status || "").toLowerCase();
  if (isActiveToolStatus(normalized)) return null;

  const isCompleted = normalized === "completed" || (!normalized && output != null);
  const isError =
    normalized === "failed" ||
    ERROR_TOOL_STATUSES.has(normalized) ||
    (!isCompleted && !!normalized);

  let content: string;
  if (output == null) {
    content = isError ? "Permission denied" : "";
  } else {
    content = typeof output === "string" ? output : JSON.stringify(output);
  }

  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
    is_error: isError,
  };
}

export function createOrphanToolResult(toolUseId: string): ContentBlock {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: "Permission denied",
    is_error: true,
  };
}

/**
 * Map tool_use IDs → tool_result blocks across all messages (including hidden
 * `type: "result"` carrier messages). When the session is not streaming,
 * synthesize error results for orphan tool_use blocks so widgets don't spin
 * forever after deny/timeout on reloaded sessions.
 */
export function buildToolResultMap(
  messages: ChatStreamMessage[],
  options?: { isStreaming?: boolean },
): Map<string, ContentBlock> {
  const map = new Map<string, ContentBlock>();
  const toolUseIds = new Set<string>();

  for (const msg of messages) {
    for (const block of contentBlocks(msg.message?.content)) {
      if (block.type === "tool_use" && block.id) {
        toolUseIds.add(block.id);
      }
      if (block.type === "tool_result" && block.tool_use_id) {
        map.set(block.tool_use_id, block);
      }
    }
  }

  if (!options?.isStreaming) {
    for (const id of toolUseIds) {
      if (!map.has(id)) {
        map.set(id, createOrphanToolResult(id));
      }
    }
  }

  return map;
}

/** Same as buildToolResultMap but for a flat activity block list (e.g. subAgent runs). */
export function buildToolResultMapFromBlocks(
  blocks: ContentBlock[],
  options?: { isStreaming?: boolean },
): Map<string, ContentBlock> {
  const map = new Map<string, ContentBlock>();
  const toolUseIds = new Set<string>();

  for (const block of blocks) {
    if (block.type === "tool_use" && block.id) {
      toolUseIds.add(block.id);
    }
    if (block.type === "tool_result" && block.tool_use_id) {
      map.set(block.tool_use_id, block);
    }
  }

  if (!options?.isStreaming) {
    for (const id of toolUseIds) {
      if (!map.has(id)) {
        map.set(id, createOrphanToolResult(id));
      }
    }
  }

  return map;
}
