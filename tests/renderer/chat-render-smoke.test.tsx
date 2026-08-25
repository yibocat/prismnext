/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { AssistantBlockList } from "@/components/modules/chat/assistant-block-list";
import { ToolWidget } from "@/components/modules/chat/tools";
import { TaskWidget } from "@/components/modules/chat/tools/task-widget";
import { ChatMessages } from "@/components/modules/chat/chat-messages";
import { useChatStore } from "@/stores/chat-store";

describe("chat render smoke", () => {
  it("exports ToolWidget and AssistantBlockList as functions", () => {
    expect(typeof ToolWidget).toBe("object");
    expect(typeof AssistantBlockList).toBe("object");
    expect(typeof TaskWidget).toBe("object");
  });

  it("renders AssistantBlockList with text block", () => {
    const { container } = render(
      <AssistantBlockList
        blocks={[{ type: "text", text: "hello" }]}
        toolResultMap={new Map()}
        msgIndex={0}
        sessionId="sess-1"
      />,
    );
    expect(container.textContent).toContain("hello");
  });

  it("renders TaskWidget without throwing", () => {
    useChatStore.setState({
      tabs: [
        {
          ...useChatStore.getState().tabs[0]!,
          sessionId: "sess-1",
          subAgentRuns: {},
        },
      ],
    });
    const { container } = render(
      <TaskWidget
        toolUse={{
          type: "tool_use",
          id: "task-1",
          name: "task",
          input: { prompt: "test", agent: "literature-scout" },
        }}
        toolName="task"
      />,
    );
    expect(container.textContent).toMatch(/Task/i);
  });

  it("renders ChatMessages with task tool_use without infinite loop", () => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const tab = useChatStore.getState().tabs[0]!;
    const conversation = {
      ...tab.conversation,
      turns: [{
        turnId: "t1",
        turnIndex: 0,
        user: { blocks: [{ type: "text" as const, text: "find papers" }] },
        assistant: {
          blocks: [{
            type: "tool_use" as const,
            id: "task-1",
            name: "task",
            input: { prompt: "find papers", agent: "literature-scout" },
          }],
        },
        status: "completed" as const,
      }],
    };
    useChatStore.setState({
      tabs: [{ ...tab, sessionId: "sess-1", conversation, isLoadingSession: false, isStreaming: false, subAgentRuns: {} }],
      activeTabId: tab.id,
      sessionId: "sess-1",
      isLoadingSession: false,
      isStreaming: false,
    });
    expect(() => render(<ChatMessages />)).not.toThrow();
  });
});
