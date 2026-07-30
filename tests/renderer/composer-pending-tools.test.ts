import { describe, expect, it } from "vitest";
import type { ChatStreamMessage, ContentBlock } from "../../src/renderer/stores/chat-store";
import {
  findComposerPendingQuestion,
  findComposerPendingTodo,
  composerToolsSuppressedOnSessionHydrate,
  questionNeedsUserAnswer,
  selectComposerHostedQuestionId,
  selectComposerHostedTodoId,
} from "../../src/renderer/lib/chat/composer-pending-tools";

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
  });

  it("does not resume a fully completed session todo in a new turn", () => {
    const messages = [
      userMsg("go"),
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
    expect(findComposerPendingTodo({ messages, streamingMessage: null, chromeLive: true })).toBeNull();
  });

  it("hides composer todo when session chrome is suppressed after cold load", () => {
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

  it("shows composer todo again when chrome is live", () => {
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
});
