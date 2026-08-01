/**
 * Pending interactive tools: Question (composer chrome) + TodoWrite (message drawer).
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

/** Todo plan shown under a user message bubble (drawer). */
export type MessageTodoPlan = {
  toolUse: ContentBlock;
  /** Index into committed `messages` (not display) for the anchor user bubble. */
  anchorUserMessageIndex: number;
};

const TODO_PLAN_DISMISS_PREFIX = "todo-plan-dismiss:";

export function isTodoPlanDismissed(toolUseId: string | undefined): boolean {
  const id = toolUseId?.trim();
  if (!id) return false;
  try {
    return localStorage.getItem(`${TODO_PLAN_DISMISS_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

export function dismissTodoPlan(toolUseId: string): void {
  const id = toolUseId.trim();
  if (!id) return;
  try {
    localStorage.setItem(`${TODO_PLAN_DISMISS_PREFIX}${id}`, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

function isRealUserMessage(msg: ChatStreamMessage): boolean {
  return msg.type === "user" && !isToolResultUserMessage(msg);
}

function activeTurnMessages(
  messages: ChatStreamMessage[],
  streamingMessage: ChatStreamMessage | null | undefined,
): ChatStreamMessage[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (isRealUserMessage(msg)) {
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

/**
 * Open task plan for composer-chrome hydrate rules (Question suppress etc.).
 * Completed plans are not “pending chrome”.
 */
export function findOpenTodoPlan(args: {
  messages: ChatStreamMessage[];
  streamingMessage: ChatStreamMessage | null | undefined;
}): ContentBlock | null {
  const turnMessages = activeTurnMessages(args.messages, args.streamingMessage);
  const activeBlock = findTodoInTurnMessages(turnMessages);
  if (activeBlock) {
    const todos: Array<{ status?: string }> = activeBlock.input?.todos ?? [];
    if (todoPlanHasOpenWork(todos)) return activeBlock;
  }

  const sessionBlock = findLatestSessionTodoBlock(args);
  if (!sessionBlock) return null;
  const todos: Array<{ status?: string }> = sessionBlock.input?.todos ?? [];
  if (!todoPlanHasOpenWork(todos)) return null;
  return sessionBlock;
}

/**
 * Latest TodoWrite plan for the message drawer — open or completed.
 * Open plans follow the latest user bubble; completed plans pin under the
 * user bubble that was current when the plan finished.
 */
export function findMessageTodoPlan(args: {
  messages: ChatStreamMessage[];
  streamingMessage: ChatStreamMessage | null | undefined;
}): MessageTodoPlan | null {
  const turnMessages = activeTurnMessages(args.messages, args.streamingMessage);
  let block = findTodoInTurnMessages(turnMessages);
  if (!block) {
    block = findLatestSessionTodoBlock(args);
  }
  if (!block?.id || isTodoPlanDismissed(block.id)) return null;

  const todos: Array<{ status?: string }> = block.input?.todos ?? [];
  if (!Array.isArray(todos) || todos.length === 0) return null;

  const anchorUserMessageIndex = resolveTodoPlanAnchorUserMessageIndex({
    messages: args.messages,
    streamingMessage: args.streamingMessage,
    toolUse: block,
  });
  if (anchorUserMessageIndex < 0) return null;

  return { toolUse: block, anchorUserMessageIndex };
}

/**
 * Index of the user message that should host the todo drawer.
 * Open → latest real user; completed → last real user at/before the assistant
 * message that carries this tool_use (so “continue” keeps the pin after done).
 */
export function resolveTodoPlanAnchorUserMessageIndex(args: {
  messages: ChatStreamMessage[];
  streamingMessage: ChatStreamMessage | null | undefined;
  toolUse: ContentBlock;
}): number {
  const committed = args.messages;
  const todos: Array<{ status?: string }> = args.toolUse.input?.todos ?? [];
  const open = todoPlanHasOpenWork(todos);

  let lastUserIdx = -1;
  for (let i = committed.length - 1; i >= 0; i--) {
    if (isRealUserMessage(committed[i]!)) {
      lastUserIdx = i;
      break;
    }
  }

  if (open) return lastUserIdx;

  const toolId = args.toolUse.id;
  if (!toolId) return lastUserIdx;

  let toolMsgIdx = -1;
  for (let i = 0; i < committed.length; i++) {
    const msg = committed[i]!;
    if (msg.type !== "assistant") continue;
    if (isHiddenToolResultCarrier(msg)) continue;
    const has = contentBlocks(msg.message?.content).some(
      (b) => b.type === "tool_use" && b.id === toolId,
    );
    if (has) toolMsgIdx = i;
  }

  // Completing only in the live streaming message → still under latest user.
  if (toolMsgIdx < 0 && args.streamingMessage) {
    const has = contentBlocks(args.streamingMessage.message?.content).some(
      (b) => b.type === "tool_use" && b.id === toolId,
    );
    if (has) return lastUserIdx;
  }

  if (toolMsgIdx < 0) return lastUserIdx;

  let pinIdx = -1;
  for (let i = 0; i <= toolMsgIdx; i++) {
    if (isRealUserMessage(committed[i]!)) pinIdx = i;
  }
  return pinIdx;
}

/** @deprecated Prefer findOpenTodoPlan / findMessageTodoPlan */
export function findComposerPendingTodo(args: {
  messages: ChatStreamMessage[];
  streamingMessage: ChatStreamMessage | null | undefined;
  /** When false (cold-loaded tab), open-plan composer chrome stayed hidden. */
  chromeLive?: boolean;
}): ComposerPendingTodo | null {
  if (args.chromeLive === false) return null;
  const block = findOpenTodoPlan(args);
  return block ? { toolUse: block } : null;
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

/**
 * Whether composer Question chrome stays hidden after loading session history.
 * Stopped mid-turn sessions with an open task plan resume composer panels that
 * still live above the input (Question — Todo moved to the message drawer).
 */
export function composerToolsSuppressedOnSessionHydrate(
  messages: ChatStreamMessage[],
): boolean {
  const todo = findOpenTodoPlan({
    messages,
    streamingMessage: null,
  });
  if (!todo) return true;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.type === "assistant") {
      return !msg.stopped;
    }
    if (isRealUserMessage(msg)) {
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
  /** Bumped when the user dismisses a message todo drawer (re-read localStorage). */
  todoPlanDismissEpoch?: number;
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

/**
 * Todo plan id hosted in the message drawer (hides full inline widget → stub).
 * Ignores composerToolsSuppressed — drawer lives in the transcript.
 */
export function selectComposerHostedTodoId(state: ComposerPendingStoreSlice): string | null {
  const tab = activeChatTab(state);
  if (!tab) return null;
  // epoch in deps via store subscription when bumped
  void state.todoPlanDismissEpoch;
  return (
    findMessageTodoPlan({
      messages: tab.messages,
      streamingMessage: tab.streamingMessage,
    })?.toolUse.id ?? null
  );
}

export function selectMessageTodoAnchorUserIndex(
  state: ComposerPendingStoreSlice,
): number | null {
  const tab = activeChatTab(state);
  if (!tab) return null;
  void state.todoPlanDismissEpoch;
  const plan = findMessageTodoPlan({
    messages: tab.messages,
    streamingMessage: tab.streamingMessage,
  });
  return plan?.anchorUserMessageIndex ?? null;
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
  void state.todoPlanDismissEpoch;
  const plan = findMessageTodoPlan({
    messages: tab.messages,
    streamingMessage: tab.streamingMessage,
  });
  return plan ? { toolUse: plan.toolUse } : null;
}

export function resolveMessageTodoPlan(
  state: ComposerPendingStoreSlice,
): MessageTodoPlan | null {
  const tab = activeChatTab(state);
  if (!tab) return null;
  void state.todoPlanDismissEpoch;
  return findMessageTodoPlan({
    messages: tab.messages,
    streamingMessage: tab.streamingMessage,
  });
}
