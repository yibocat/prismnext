import type { ChatStreamMessage } from "@/stores/chat-store";
import type { ContentBlock } from "@/stores/chat-store";
import { buildToolResultMap, contentBlocks } from "@/components/modules/chat/tools/tool-result-map";
import { useCitationStagingStore } from "@/stores/citation-staging-store";
import { parseStageToolResult } from "./parse-stage-tool-result";

/** Sessions already backfilled from transcript this app run (live capture handles new stages). */
const backfilledFromTranscript = new Set<string>();

/** @internal test helper */
export function resetCitationStagingBackfillForTests(): void {
  backfilledFromTranscript.clear();
}

/**
 * Backfill citation staging from literature-stage tool_use + tool_result pairs
 * in the chat transcript. Runs at most once per session per app run unless
 * `force` is set. Skipped after the user clears session citations.
 */
export function syncCitationStagingFromMessages(
  sessionId: string,
  messages: ChatStreamMessage[],
  toolResultMap: Map<string, ContentBlock>,
  options?: { force?: boolean },
): void {
  if (!sessionId) return;
  const store = useCitationStagingStore.getState();
  if (store.backfillSuppressedSessions[sessionId]) return;
  if (!options?.force && backfilledFromTranscript.has(sessionId)) return;

  const results = [];
  for (const msg of messages) {
    for (const block of contentBlocks(msg.message?.content)) {
      if (block.type !== "tool_use" || !block.id) continue;
      const name = (block.name || "").toLowerCase();
      if (name !== "literature-stage") continue;
      const resultBlock = toolResultMap.get(block.id);
      if (!resultBlock || resultBlock.is_error) continue;
      const stagePayload = parseStageToolResult(resultBlock.content);
      if (stagePayload?.verified && stagePayload.citation) {
        results.push(stagePayload);
      }
    }
  }

  if (results.length > 0) {
    store.mergeStageResultsBatch(sessionId, results);
  }
  backfilledFromTranscript.add(sessionId);
}

export function scheduleCitationStagingBackfill(
  sessionId: string,
  messages: ChatStreamMessage[],
): void {
  if (!sessionId || messages.length === 0) return;
  const toolResultMap = buildToolResultMap(messages, { isStreaming: false });
  syncCitationStagingFromMessages(sessionId, messages, toolResultMap);
}
