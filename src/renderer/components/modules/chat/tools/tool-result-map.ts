import type { ChatStreamMessage, ContentBlock } from "@/lib/chat/types";
export { contentBlocks } from "@/lib/chat/types";

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

/** Statuses OpenCode emits that mean "the tool finished successfully". The ACP
 *  binary uses several synonyms interchangeably (`completed`, `success`,
 *  `finished`); treating only `completed` as final caused the renderer to DROP
 *  tool_results whose status was `success`/`finished` — leaving the tool
 *  spinning forever, then orphan-synthesized as "No result received". */
const SUCCESS_TOOL_STATUSES = new Set([
  "completed",
  "success",
  "finished",
  "done",
]);

/** Is a status a terminal (final) result — success or error? Any non-active
 *  status is terminal. Used to decide whether to store a tool_result. */
export function isFinalToolStatus(status: string | undefined | null): boolean {
  const normalized = (status || "").toLowerCase();
  if (!normalized) return true; // empty status = treat as final (matches prior behavior)
  return !isActiveToolStatus(normalized);
}

/** Normalize a terminal success status to `completed` for internal use + display. */
export function normalizeToolStatus(status: string | undefined | null): string {
  const normalized = (status || "").toLowerCase();
  if (SUCCESS_TOOL_STATUSES.has(normalized)) return "completed";
  return normalized;
}

export function isActiveToolStatus(status: string | undefined | null): boolean {
  return ACTIVE_TOOL_STATUSES.has((status || "").toLowerCase());
}

/** Map an error status (no output) to a legible label. Avoids labeling every
 *  error as "Permission denied" — a cancelled or timed-out tool is not a denial.
 *  The real permission-deny path injects its own "Permission denied" result via
 *  `finalizePermissionDeny`/`_injectToolResult`, so this only runs when
 *  OpenCode stored an error status with no output. */
function errorLabelForStatus(normalized: string): string {
  if (normalized === "denied" || normalized === "rejected") return "Permission denied";
  if (normalized === "timeout" || normalized === "timed_out") return "Permission timed out";
  if (normalized === "cancelled" || normalized === "canceled") return "Cancelled";
  if (normalized === "aborted") return "Aborted";
  return "Tool failed";
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
    content = isError ? errorLabelForStatus(normalized) : "";
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

/** Synthesize a tool_result for an orphan `tool_use` (no matching result). This
 *  is the renderer-side fallback when a turn ends without the tool returning a
 *  result — usually a lost `tool_call_update` over IPC (see tool-name-infer.ts)
 *  or a turn interrupted mid-tool. Use a NEUTRAL label, NOT "Permission denied":
 *  we don't know *why* the result is missing, and the real deny path injects its
 *  own "Permission denied" content. Mislabeled orphans caused the "live = failed
 *  / reloaded = success" discrepancy. */
export function createOrphanToolResult(toolUseId: string): ContentBlock {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: "No result received",
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
