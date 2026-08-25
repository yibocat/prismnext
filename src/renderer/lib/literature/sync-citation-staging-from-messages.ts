import type { Conversation } from "@shared/agent/conversation";
import { collectConversationAssistantBlocks } from "@/lib/chat/conversation-view";
import type { ChatStreamMessage, ContentBlock, SubAgentRun } from "@/stores/chat-store";
import {
  buildToolResultMap,
  buildToolResultMapFromBlocks,
  contentBlocks,
} from "@/components/modules/chat/tools/tool-result-map";
import { useCitationStagingStore } from "@/stores/citation-staging-store";
import { parseStageToolResult } from "./parse-stage-tool-result";
import type { StageResult } from "@shared/literature/citation-staging";

/** Sessions already backfilled from transcript this app run (live capture handles new stages). */
const backfilledFromTranscript = new Set<string>();

/** @internal test helper */
export function resetCitationStagingBackfillForTests(): void {
  backfilledFromTranscript.clear();
}

/** Collect verified literature-stage payloads from tool_use + tool_result pairs. */
export function collectStageResultsFromBlocks(
  blocks: ContentBlock[],
  toolResultMap: Map<string, ContentBlock>,
): StageResult[] {
  const results: StageResult[] = [];
  for (const block of blocks) {
    if (block.type !== "tool_use" || !block.id) continue;
    if ((block.name || "").toLowerCase() !== "literature-stage") continue;
    const resultBlock = toolResultMap.get(block.id);
    if (!resultBlock || resultBlock.is_error) continue;
    const stagePayload = parseStageToolResult(resultBlock.content);
    if (stagePayload?.verified && stagePayload.citation) {
      results.push(stagePayload);
    }
  }
  return results;
}

/** Live capture from a flat block list (e.g. subAgent run activity). */
export function captureLiteratureStageForSession(
  sessionId: string,
  blocks: ContentBlock[],
  toolResultMap?: Map<string, ContentBlock>,
): void {
  if (!sessionId || blocks.length === 0) return;
  const map = toolResultMap ?? buildToolResultMapFromBlocks(blocks, { isStreaming: true });
  const results = collectStageResultsFromBlocks(blocks, map);
  if (results.length === 0) return;
  const store = useCitationStagingStore.getState();
  if (results.length === 1) {
    store.upsertFromStageResult(sessionId, results[0]!);
  } else {
    store.mergeStageResultsBatch(sessionId, results);
  }
  store.setActiveSession(sessionId);
}

/** Live capture from a single literature-stage tool_result payload. */
export function captureLiteratureStageFromToolResult(
  sessionId: string,
  content: unknown,
): void {
  if (!sessionId) return;
  try {
    const stagePayload = parseStageToolResult(content);
    if (!stagePayload?.verified || !stagePayload.citation) return;
    const store = useCitationStagingStore.getState();
    store.upsertFromStageResult(sessionId, stagePayload);
    store.setActiveSession(sessionId);
  } catch {
    // ignore malformed tool output
  }
}

/**
 * Backfill citation staging from literature-stage tool_use + tool_result pairs
 * in the chat transcript and sub-agent Task activity. Runs at most once per
 * session per app run unless `force` is set. Skipped after the user clears session citations.
 */
export function syncCitationStagingFromMessages(
  sessionId: string,
  messages: ChatStreamMessage[],
  toolResultMap: Map<string, ContentBlock>,
  options?: { force?: boolean; subAgentRuns?: Record<string, SubAgentRun> },
): void {
  if (!sessionId) return;
  const store = useCitationStagingStore.getState();
  if (store.backfillSuppressedSessions[sessionId]) return;
  if (!options?.force && backfilledFromTranscript.has(sessionId)) return;

  const results: StageResult[] = [];
  for (const msg of messages) {
    results.push(...collectStageResultsFromBlocks(contentBlocks(msg.message?.content), toolResultMap));
  }

  if (options?.subAgentRuns) {
    for (const run of Object.values(options.subAgentRuns)) {
      const runMap = buildToolResultMapFromBlocks(run.blocks, { isStreaming: false });
      results.push(...collectStageResultsFromBlocks(run.blocks, runMap));
    }
  }

  if (results.length > 0) {
    store.mergeStageResultsBatch(sessionId, results);
    store.setActiveSession(sessionId);
    backfilledFromTranscript.add(sessionId);
  }
}

export function scheduleCitationStagingBackfill(
  sessionId: string,
  messages: ChatStreamMessage[],
  subAgentRuns?: Record<string, SubAgentRun>,
): void {
  if (!sessionId) return;
  const hasSubAgentBlocks =
    subAgentRuns != null && Object.values(subAgentRuns).some((r) => r.blocks.length > 0);
  if (messages.length === 0 && !hasSubAgentBlocks) return;
  const toolResultMap = buildToolResultMap(messages, { isStreaming: false });
  syncCitationStagingFromMessages(sessionId, messages, toolResultMap, { subAgentRuns });
}

export function scheduleCitationStagingBackfillFromConversation(
  sessionId: string,
  conv: Conversation | null | undefined,
  subAgentRuns?: Record<string, SubAgentRun>,
): void {
  if (!sessionId || !conv) return;
  const blocks = collectConversationAssistantBlocks(conv);
  const hasSubAgentBlocks =
    subAgentRuns != null && Object.values(subAgentRuns).some((r) => r.blocks.length > 0);
  if (blocks.length === 0 && !hasSubAgentBlocks) return;
  const toolResultMap = buildToolResultMapFromBlocks(blocks, { isStreaming: false });
  const store = useCitationStagingStore.getState();
  if (store.backfillSuppressedSessions[sessionId]) return;
  if (backfilledFromTranscript.has(sessionId)) return;
  const results = collectStageResultsFromBlocks(blocks, toolResultMap);
  if (subAgentRuns) {
    for (const run of Object.values(subAgentRuns)) {
      const runMap = buildToolResultMapFromBlocks(run.blocks, { isStreaming: false });
      results.push(...collectStageResultsFromBlocks(run.blocks, runMap));
    }
  }
  if (results.length > 0) {
    store.mergeStageResultsBatch(sessionId, results);
    store.setActiveSession(sessionId);
    backfilledFromTranscript.add(sessionId);
  }
}
