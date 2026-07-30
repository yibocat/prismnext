/**
 * Composer chrome for live experiment-run visibility.
 */
import type { ChatStreamMessage, ContentBlock } from "@/stores/chat-store";
import { contentBlocks } from "@/components/modules/chat/tools/tool-result-map";
import {
  isHiddenToolResultCarrier,
  isToolResultUserMessage,
} from "@/components/modules/chat/chat-turns";
import type { ComposerPendingStoreSlice } from "@/lib/chat/composer-pending-tools";
import { composerChromeLive } from "@/lib/chat/composer-pending-tools";

export type ComposerPendingExperimentRun = {
  toolUse: ContentBlock;
  experimentId: string;
  command: string;
};

function activeTurnMessages(
  messages: ChatStreamMessage[],
  streamingMessage: ChatStreamMessage | null | undefined,
): ChatStreamMessage[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.type === "user" && !isToolResultUserMessage(msg)) {
      lastUserIdx = i;
      break;
    }
  }
  const turn = messages.slice(lastUserIdx + 1).filter((m) => !isHiddenToolResultCarrier(m));
  if (streamingMessage) turn.push(streamingMessage);
  return turn;
}

function collectAssistantBlocks(turnMessages: ChatStreamMessage[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const msg of turnMessages) {
    if (msg.type !== "assistant") continue;
    blocks.push(...contentBlocks(msg.message?.content));
  }
  return blocks;
}

function readExperimentId(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null;
  const id = input.experimentId ?? input.id ?? input.experiment_id;
  if (typeof id === "string" && id.trim()) return id.trim();
  return null;
}

function readCommand(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  const cmd = input.command ?? input.cmd;
  return typeof cmd === "string" ? cmd.trim() : "";
}

export function findComposerPendingExperimentRun(args: {
  messages: ChatStreamMessage[];
  streamingMessage: ChatStreamMessage | null | undefined;
  isStreaming: boolean;
  chromeLive?: boolean;
}): ComposerPendingExperimentRun | null {
  if (args.chromeLive === false) return null;

  const turnMessages = activeTurnMessages(args.messages, args.streamingMessage);
  const blocks = collectAssistantBlocks(turnMessages);

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!;
    if (block.type !== "tool_use" || (block.name || "").toLowerCase() !== "experiment-run") {
      continue;
    }
    const experimentId = readExperimentId(block.input);
    if (!experimentId) continue;
    return {
      toolUse: block,
      experimentId,
      command: readCommand(block.input),
    };
  }
  return null;
}

function activeChatTab(state: ComposerPendingStoreSlice) {
  return state.tabs.find((t) => t.id === state.activeTabId);
}

export function selectComposerHostedExperimentRunId(
  state: ComposerPendingStoreSlice,
): string | null {
  const tab = activeChatTab(state);
  if (!tab || !composerChromeLive(tab)) return null;
  return (
    findComposerPendingExperimentRun({
      messages: tab.messages,
      streamingMessage: tab.streamingMessage,
      isStreaming: tab.isStreaming,
      chromeLive: true,
    })?.toolUse.id ?? null
  );
}

export function resolveComposerPendingExperimentRun(
  state: ComposerPendingStoreSlice,
): ComposerPendingExperimentRun | null {
  const tab = activeChatTab(state);
  if (!tab || !composerChromeLive(tab)) return null;
  return findComposerPendingExperimentRun({
    messages: tab.messages,
    streamingMessage: tab.streamingMessage,
    isStreaming: tab.isStreaming,
    chromeLive: true,
  });
}
