import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { ChatStreamMessage, ContentBlock } from "../../src/renderer/stores/chat-store";
import { emptyConversation } from "../../src/shared/agent/conversation";
import type { Conversation } from "../../src/shared/agent/conversation";
import {
  findComposerPendingQuestion,
  findComposerPendingQuestionFromConversation,
  findComposerPendingTodo,
  findMessageTodoPlan,
  findMessageTodoPlanFromConversation,
  findOpenTodoPlan,
  composerToolsSuppressedOnSessionHydrate,
  questionNeedsUserAnswer,
  resolveTodoPlanAnchorUserMessageIndex,
  selectComposerHostedQuestionId,
  selectComposerHostedTodoId,
  dismissTodoPlan,
  isTodoPlanDismissed,
} from "../../src/renderer/lib/chat/composer-pending-tools";

function conversationWithTodo(todos: Array<{ content: string; status: string }>): Conversation {
  return {
    ...emptyConversation({ conversationId: "c1" }),
    turns: [{
      turnId: "turn-1",
      turnIndex: 0,
      user: { blocks: [{ type: "text", text: "plan this" }] },
      assistant: {
        blocks: [{
          type: "tool_use",
          id: "todo-1",
          name: "todowrite",
          input: { todos },
        }],
      },
      status: "completed",
    }],
  };
}

function assistantMsg(blocks: ContentBlock[]): ChatStreamMessage {
  return { type: "assistant", message: { content: blocks } };
}

function userMsg(text: string): ChatStreamMessage {
  return { type: "user", message: { content: [{ type: "text", text }] } };
}

function resultMsg(toolUseId: string, content: string): ChatStreamMessage {
  return {
    type: "result",
    message: {
      content: [{ type: "tool_result", tool_use_id: toolUseId, content }],
    },
  };
}

describe("composer-pending-tools", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: () => null,
      length: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("finds pending question in active turn", () => {
    const messages = [
      userMsg("hi"),
      assistantMsg([
        { type: "tool_use", id: "q1", name: "question", input: { question: "Pick one?" } },
      ]),
    ];
    const pending = findComposerPendingQuestion({
      messages,
      streamingMessage: null,
      isStreaming: false,
    });
    expect(pending?.toolUse.id).toBe("q1");
  });

  it("ignores answered question", () => {
    const messages = [
      userMsg("hi"),
      assistantMsg([
        { type: "tool_use", id: "q1", name: "question", input: { question: "Pick?" } },
      ]),
      resultMsg("q1", "Option A"),
    ];
    const pending = findComposerPendingQuestion({
      messages,
      streamingMessage: null,
      isStreaming: false,
    });
    expect(pending).toBeNull();
  });

  it("finds latest todowrite in active turn", () => {
    const messages = [
      userMsg("go"),
      assistantMsg([
        {
          type: "tool_use",
          id: "t1",
          name: "todowrite",
          input: { todos: [{ content: "Step 1", status: "pending" }] },
        },
        {
          type: "tool_use",
          id: "t2",
          name: "todowrite",
          input: {
            todos: [
              { content: "Step 1", status: "completed" },
              { content: "Step 2", status: "in_progress" },
            ],
          },
        },
      ]),
    ];
    const pending = findComposerPendingTodo({ messages, streamingMessage: null, chromeLive: true });
    expect(pending?.toolUse.id).toBe("t2");
  });

  it("resumes latest open session todo after a new user turn (reopen + continue)", () => {
    const messages = [
      userMsg("debug"),
      assistantMsg([
        {
          type: "tool_use",
          id: "t-old",
          name: "todowrite",
          input: {
            todos: [
              { content: "Review structure", status: "pending" },
              { content: "Check citations", status: "pending" },
            ],
          },
        },
      ]),
      userMsg("continue"),
    ];
    const pending = findComposerPendingTodo({ messages, streamingMessage: null, chromeLive: true });
    expect(pending?.toolUse.id).toBe("t-old");
    const plan = findMessageTodoPlan({ messages, streamingMessage: null });
    expect(plan?.toolUse.id).toBe("t-old");
    // Open plan follows the latest user ("continue")
    expect(plan?.anchorUserMessageIndex).toBe(2);
  });

  it("pins completed plan under the user bubble current when it finished", () => {
    const messages = [
      userMsg("debug"),
      assistantMsg([
        {
          type: "tool_use",
          id: "t-done",
          name: "todowrite",
          input: {
            todos: [{ content: "Step 1", status: "in_progress" }],
          },
        },
      ]),
      userMsg("continue"),
      assistantMsg([
        {
          type: "tool_use",
          id: "t-done",
          name: "todowrite",
          input: {
            todos: [{ content: "Step 1", status: "completed" }],
          },
        },
      ]),
      userMsg("thanks"),
    ];
    // Open-plan helpers must not resume completed plans into a new turn
    expect(findOpenTodoPlan({ messages, streamingMessage: null })).toBeNull();
    expect(findComposerPendingTodo({ messages, streamingMessage: null, chromeLive: true })).toBeNull();

    const plan = findMessageTodoPlan({ messages, streamingMessage: null });
    expect(plan?.toolUse.id).toBe("t-done");
    // Completed while "continue" was the latest user → pin at index 2, not "thanks"
    expect(plan?.anchorUserMessageIndex).toBe(2);
  });

  it("open plan anchors to the latest user message", () => {
    const messages = [
      userMsg("go"),
      assistantMsg([
        {
          type: "tool_use",
          id: "t1",
          name: "todowrite",
          input: { todos: [{ content: "Step 1", status: "pending" }] },
        },
      ]),
      userMsg("keep going"),
    ];
    expect(
      resolveTodoPlanAnchorUserMessageIndex({
        messages,
        streamingMessage: null,
        toolUse: {
          type: "tool_use",
          id: "t1",
          name: "todowrite",
          input: { todos: [{ content: "Step 1", status: "pending" }] },
        },
      }),
    ).toBe(2);
  });

  it("hides message todo after dismiss (UI only)", () => {
    const messages = [
      userMsg("go"),
      assistantMsg([
        {
          type: "tool_use",
          id: "t1",
          name: "todowrite",
          input: { todos: [{ content: "Step 1", status: "pending" }] },
        },
      ]),
    ];
    expect(findMessageTodoPlan({ messages, streamingMessage: null })?.toolUse.id).toBe("t1");
    dismissTodoPlan("t1");
    expect(isTodoPlanDismissed("t1")).toBe(true);
    expect(findMessageTodoPlan({ messages, streamingMessage: null })).toBeNull();
  });

  it("hides composer question when session chrome is suppressed after cold load", () => {
    const messages = [
      userMsg("go"),
      assistantMsg([
        {
          type: "tool_use",
          id: "t1",
          name: "todowrite",
          input: { todos: [{ content: "Step 1", status: "in_progress" }] },
        },
      ]),
    ];
    const state = {
      activeTabId: "tab-1",
      tabs: [{
        id: "tab-1",
        messages,
        streamingMessage: null,
        isStreaming: false,
        composerToolsSuppressed: true,
      }],
    };
    expect(findComposerPendingTodo({
      messages,
      streamingMessage: null,
      chromeLive: false,
    })).toBeNull();
    // Message drawer still shows open todos (ignores composerToolsSuppressed)
    expect(selectComposerHostedTodoId(state)).toBe("t1");
    expect(selectComposerHostedQuestionId({
      ...state,
      tabs: [{
        ...state.tabs[0]!,
        messages: [
          userMsg("pick"),
          assistantMsg([
            { type: "tool_use", id: "q1", name: "question", input: { question: "Which?" } },
          ]),
        ],
      }],
    })).toBeNull();
  });

  it("shows message todo when chrome is live", () => {
    const messages = [
      userMsg("go"),
      assistantMsg([
        {
          type: "tool_use",
          id: "t1",
          name: "todowrite",
          input: { todos: [{ content: "Step 1", status: "in_progress" }] },
        },
      ]),
    ];
    expect(
      selectComposerHostedTodoId({
        activeTabId: "tab-1",
        tabs: [{
          id: "tab-1",
          messages,
          streamingMessage: null,
          isStreaming: false,
          composerToolsSuppressed: false,
        }],
      }),
    ).toBe("t1");
  });

  it("questionNeedsUserAnswer for prism question while streaming", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "q1",
      name: "question",
      input: { question: "?" },
    };
    expect(questionNeedsUserAnswer(toolUse, undefined, true)).toBe(true);
  });

  it("does not suppress composer chrome when session ended on user stop with open todos", () => {
    const messages = [
      userMsg("debug"),
      {
        type: "assistant" as const,
        stopped: true,
        message: {
          content: [{
            type: "tool_use" as const,
            id: "t1",
            name: "todowrite",
            input: {
              todos: [{ content: "Review structure", status: "pending" }],
            },
          }],
        },
      },
    ];
    expect(composerToolsSuppressedOnSessionHydrate(messages)).toBe(false);
  });

  it("suppresses composer chrome when session ended normally with open todos", () => {
    const messages = [
      userMsg("debug"),
      assistantMsg([
        {
          type: "tool_use",
          id: "t1",
          name: "todowrite",
          input: { todos: [{ content: "Review structure", status: "pending" }] },
        },
      ]),
    ];
    expect(composerToolsSuppressedOnSessionHydrate(messages)).toBe(true);
  });

  it("finds a todo plan from Conversation turns, not ChatStreamMessage", () => {
    const plan = findMessageTodoPlanFromConversation(conversationWithTodo([
      { content: "Review structure", status: "pending" },
    ]));
    expect(plan?.toolUse.id).toBe("todo-1");
    expect(plan?.turnIndex).toBe(0);
  });

  it("hosts a pendingQuestion in composer chrome before the tool card exists", () => {
    const conv: Conversation = {
      ...emptyConversation({ conversationId: "c1" }),
      pendingQuestion: {
        requestId: "q-hang",
        prompt: "Pick one?",
        options: ["A", "B"],
      },
    };
    expect(selectComposerHostedQuestionId({
      activeTabId: "tab-1",
      tabs: [{
        id: "tab-1",
        conversation: conv,
        messages: [],
        streamingMessage: null,
        isStreaming: true,
        composerToolsSuppressed: false,
      }],
    })).toBe("q-hang");
  });

  it("hosts a pending hang even when a different unanswered question tool is in the live turn", () => {
    const conv: Conversation = {
      ...emptyConversation({ conversationId: "c1" }),
      pendingQuestion: {
        requestId: "q-hang",
        prompt: "Current hang?",
        options: ["Yes", "No"],
      },
      live: {
        turnId: "turn-1",
        turnIndex: 0,
        user: { blocks: [{ type: "text", text: "ask" }] },
        assistant: {
          blocks: [{
            type: "tool_use",
            id: "q-old",
            name: "question",
            input: { question: "Older unanswered?" },
          }],
        },
        status: "streaming",
      },
    };
    expect(selectComposerHostedQuestionId({
      activeTabId: "tab-1",
      tabs: [{
        id: "tab-1",
        conversation: conv,
        messages: [],
        streamingMessage: null,
        isStreaming: true,
        composerToolsSuppressed: false,
      }],
    })).toBe("q-hang");
    expect(findComposerPendingQuestionFromConversation(conv, true)?.toolUse.id).toBe("q-hang");
    expect(findComposerPendingQuestionFromConversation(conv, true)?.toolUse.input).toMatchObject({
      question: "Current hang?",
    });
  });

  it("does not host an unanswered question from a settled turn", () => {
    const conv: Conversation = {
      ...emptyConversation({ conversationId: "c1" }),
      turns: [{
        turnId: "turn-0",
        turnIndex: 0,
        user: { blocks: [{ type: "text", text: "old" }] },
        assistant: {
          blocks: [{
            type: "tool_use",
            id: "q-old",
            name: "question",
            input: { question: "Leftover?" },
          }],
        },
        status: "completed",
      }],
    };
    expect(findComposerPendingQuestionFromConversation(conv, false)).toBeNull();
  });

  it("finds a pending question from Conversation assistant blocks", () => {
    const conv: Conversation = {
      ...emptyConversation({ conversationId: "c1" }),
      live: {
        turnId: "turn-1",
        turnIndex: 0,
        user: { blocks: [{ type: "text", text: "ask" }] },
        assistant: {
          blocks: [{
            type: "tool_use",
            id: "q1",
            name: "question",
            input: { question: "Pick one?" },
          }],
        },
        status: "streaming",
      },
    };
    expect(findComposerPendingQuestionFromConversation(conv, true)?.toolUse.id).toBe("q1");
  });
});
