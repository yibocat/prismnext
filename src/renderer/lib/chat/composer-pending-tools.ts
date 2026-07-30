/**
 * Pending interactive tools surfaced above the chat composer (Question, TodoWrite).
 */
import type { ChatStreamMessage, ContentBlock } from "@/stores/chat-store";
import { contentBlocks } from "@/components/modules/chat/tools/tool-result-map";
import {
  isHiddenToolResultCarrier,
  isToolResultUserMessage,
} from "@/components/modules/chat/chat-turns";

export type ComposerPendingQuestion = {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
};

export type ComposerPendingTodo = {
  toolUse: ContentBlock;
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

function isQuestionToolName(name: string | undefined): boolean {
  return (name || "").toLowerCase() === "question";
}

function isTodoWriteToolName(name: string | undefined): boolean {
  return (name || "").toLowerCase() === "todowrite";
}

function todoWriteBlocksFromMessages(messages: ChatStreamMessage[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const msg of messages) {
    if (isHiddenToolResultCarrier(msg)) continue;
    if (msg.type !== "assistant") continue;
    blocks.push(...contentBlocks(msg.message?.content));
  }
  return blocks;
}

function pickLatestTodoBlock(blocks: ContentBlock[]): ContentBlock | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!;
    if (block.type !== "tool_use" || !isTodoWriteToolName(block.name)) continue;
    const todos = block.input?.todos;
    if (!Array.isArray(todos) || todos.length === 0) continue;
    return block;
  }
  return null;
}

/** True when the plan still has open work (not every item completed). */
export function todoPlanHasOpenWork(todos: Array<{ status?: string }>): boolean {
  if (todos.length === 0) return false;
  return todos.some((t) => t.status !== "completed");
}

function findTodoInTurnMessages(turnMessages: ChatStreamMessage[]): ContentBlock | null {
  return pickLatestTodoBlock(todoWriteBlocksFromMessages(turnMessages));
}

function findLatestSessionTodoBlock(args: {
  messages: ChatStreamMessage[];
  streamingMessage: ChatStreamMessage | null | undefined;
}): ContentBlock | null {
  const allMessages = [
    ...args.messages.filter((m) => !isHiddenToolResultCarrier(m)),
    ...(args.streamingMessage ? [args.streamingMessage] : []),
  ];
  return pickLatestTodoBlock(todoWriteBlocksFromMessages(allMessages));
}

/** Mirrors AskUserQuestionWidget — question awaiting a user reply. */
export function questionNeedsUserAnswer(
  toolUse: ContentBlock,
  toolResult: ContentBlock | undefined,
  isStreaming: boolean,
): boolean {
  const isError = toolResult?.is_error;
  const hasResult = toolResult?.content != null;
  const isAlreadyAnswered = hasResult && !isError;
  if (isAlreadyAnswered || isError) return false;
  const isPrismQuestion = isQuestionToolName(toolUse.name);
  return isPrismQuestion || (!isStreaming && !!toolResult);
}

function buildActualToolResultMap(messages: ChatStreamMessage[]): Map<string, ContentBlock> {
  const map = new Map<string, ContentBlock>();
  for (const msg of messages) {
    for (const block of contentBlocks(msg.message?.content)) {
      if (block.type === "tool_result" && block.tool_use_id) {
        map.set(block.tool_use_id, block);
      }
    }
  }
  return map;
}

export function findComposerPendingQuestion(args: {
  messages: ChatStreamMessage[];
  streamingMessage: ChatStreamMessage | null | undefined;
  isStreaming: boolean;
}): ComposerPendingQuestion | null {
  const turnMessages = activeTurnMessages(args.messages, args.streamingMessage);
  const allMessages = [
    ...args.messages,
    ...(args.streamingMessage ? [args.streamingMessage] : []),
  ];
  const toolResultMap = buildActualToolResultMap(allMessages);
  const blocks = collectAssistantBlocks(turnMessages);

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!;
    if (block.type !== "tool_use" || !isQuestionToolName(block.name)) continue;
    const toolResult = block.id ? toolResultMap.get(block.id) : undefined;
    if (!questionNeedsUserAnswer(block, toolResult, args.isStreaming)) continue;
    return { toolUse: block, toolResult };
  }
  return null;
}

export function findComposerPendingTodo(args: {
  messages: ChatStreamMessage[];
  streamingMessage: ChatStreamMessage | null | undefined;
  /** When false (cold-loaded tab), composer todo chrome stays hidden. */
  chromeLive?: boolean;
}): ComposerPendingTodo | null {
  if (args.chromeLive === false) return null;

  const turnMessages = activeTurnMessages(args.messages, args.streamingMessage);
  const activeBlock = findTodoInTurnMessages(turnMessages);
  if (activeBlock) {
    return { toolUse: activeBlock };
  }

  // After Stop, tab reopen + user "continue", or a new user turn before the next
  // todowrite — resume the latest open plan from session history.
  const sessionBlock = findLatestSessionTodoBlock(args);
  if (!sessionBlock) return null;
  const todos: Array<{ status?: string }> = sessionBlock.input?.todos ?? [];
  if (!todoPlanHasOpenWork(todos)) return null;
  return { toolUse: sessionBlock };
}

/**
 * Whether composer Question/Todo chrome stays hidden after loading session history.
 * Stopped mid-turn sessions with an open task plan resume the composer panel.
 */
export function composerToolsSuppressedOnSessionHydrate(
  messages: ChatStreamMessage[],
): boolean {
  const todo = findComposerPendingTodo({
    messages,
    streamingMessage: null,
    chromeLive: true,
  });
  if (!todo) return true;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.type === "assistant") {
      return !msg.stopped;
    }
    if (msg.type === "user" && !isToolResultUserMessage(msg)) {
      return true;
    }
  }
  return true;
}

export function isComposerHostedToolId(
  toolUseId: string | undefined,
  questionId: string | null | undefined,
  todoId: string | null | undefined,
  experimentRunId?: string | null | undefined,
): boolean {
  if (!toolUseId?.trim()) return false;
  return (
    toolUseId === questionId
    || toolUseId === todoId
    || toolUseId === experimentRunId
  );
}

/** Minimal chat-store slice for composer pending selectors (return primitives only). */
export type ComposerPendingStoreSlice = {
  activeTabId: string;
  tabs: Array<{
    id: string;
    messages: ChatStreamMessage[];
    streamingMessage: ChatStreamMessage | null;
    isStreaming: boolean;
    composerToolsSuppressed?: boolean;
  }>;
};

export function composerChromeLive(tab: ComposerPendingStoreSlice["tabs"][number] | undefined): boolean {
  return !tab?.composerToolsSuppressed;
}

function activeChatTab(state: ComposerPendingStoreSlice) {
  return state.tabs.find((t) => t.id === state.activeTabId);
}

/** Zustand selector — stable string | null (never return fresh objects). */
export function selectComposerHostedQuestionId(
  state: ComposerPendingStoreSlice,
): string | null {
  const tab = activeChatTab(state);
  if (!tab || !composerChromeLive(tab)) return null;
  return (
    findComposerPendingQuestion({
      messages: tab.messages,
      streamingMessage: tab.streamingMessage,
      isStreaming: tab.isStreaming,
    })?.toolUse.id ?? null
  );
}

/** Zustand selector — stable string | null (never return fresh objects). */
export function selectComposerHostedTodoId(state: ComposerPendingStoreSlice): string | null {
  const tab = activeChatTab(state);
  if (!tab) return null;
  return (
    findComposerPendingTodo({
      messages: tab.messages,
      streamingMessage: tab.streamingMessage,
      chromeLive: composerChromeLive(tab),
    })?.toolUse.id ?? null
  );
}

export function resolveComposerPendingQuestion(
  state: ComposerPendingStoreSlice,
): ComposerPendingQuestion | null {
  const tab = activeChatTab(state);
  if (!tab || !composerChromeLive(tab)) return null;
  return findComposerPendingQuestion({
    messages: tab.messages,
    streamingMessage: tab.streamingMessage,
    isStreaming: tab.isStreaming,
  });
}

export function resolveComposerPendingTodo(
  state: ComposerPendingStoreSlice,
): ComposerPendingTodo | null {
  const tab = activeChatTab(state);
  if (!tab) return null;
  return findComposerPendingTodo({
    messages: tab.messages,
    streamingMessage: tab.streamingMessage,
    chromeLive: composerChromeLive(tab),
  });
}
