import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TodoWriteWidget } from "../../src/renderer/components/modules/chat/tools/todo-widget";
import { useChatStore } from "../../src/renderer/stores/chat-store";

describe("TodoWriteWidget", () => {
  beforeEach(() => {
    useChatStore.getState().clearAllSessions();
  });

  it("does not animate stale in-progress todos when chat is not streaming", () => {
    useChatStore.getState()._setStreaming(useChatStore.getState().activeTabId, false);

    const { container } = render(
      <TodoWriteWidget
        toolName="plan"
        toolUse={{
          type: "tool_use",
          id: "todo-1",
          name: "plan",
          input: { todos: [{ content: "Draft section", status: "in_progress" }] },
        }}
      />,
    );

    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("composer surface shows status icons and todo text by default expanded", () => {
    useChatStore.getState()._setStreaming(useChatStore.getState().activeTabId, true);

    const { container } = render(
      <TodoWriteWidget
        surface="composer"
        toolName="todowrite"
        toolUse={{
          type: "tool_use",
          id: "todo-composer-1",
          name: "todowrite",
          input: {
            todos: [
              { content: "Review manuscript structure", status: "completed" },
              { content: "Create initial skeleton", status: "in_progress" },
              { content: "Run LaTeX compilation", status: "pending" },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText("Review manuscript structure")).toBeTruthy();
    expect(screen.getByText("Create initial skeleton")).toBeTruthy();
    expect(screen.getByText("Run LaTeX compilation")).toBeTruthy();
    expect(container.querySelectorAll(".text-success").length).toBeGreaterThan(0);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });
});
