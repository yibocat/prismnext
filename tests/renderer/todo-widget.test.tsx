import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
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
});
