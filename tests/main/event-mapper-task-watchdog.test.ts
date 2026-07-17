import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("electron", () => ({
  app: { isPackaged: true },
}));

// electron-store fails to construct without a projectName option; stub it so
// transitive imports of settings.ts don't blow up at import time.
vi.mock("electron-store", () => ({
  default: class {
    constructor() {}
    get() { return undefined; }
    set() {}
    store = {};
  },
}));

// AcpService stub: track markSubAgentSession + isSubAgentSession so mapSessionUpdate
// can run without a real OpenCode process.
const acpStub = {
  markSubAgentSession: vi.fn(),
  isSubAgentSession: vi.fn().mockReturnValue(false),
  isSessionReplaySuppressed: vi.fn().mockReturnValue(false),
  getSessionParentId: vi.fn().mockReturnValue(null),
  resolveCitationStagingSessionId: vi.fn().mockReturnValue(null),
  abort: vi.fn().mockResolvedValue(undefined),
};
vi.mock("../../src/main/acp/service", () => ({
  AcpService: { getInstance: () => acpStub },
}));

import { EventMapper } from "../../src/main/acp/event-mapper";

function makeMockWin() {
  const send = vi.fn();
  return {
    win: { webContents: { send } } as any,
    send,
  };
}

describe("EventMapper Task link watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires subAgent.completed(error) when a tracked Task never links", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-1";
    const toolUseId = "tooluse-1";
    (mapper as any).pendingTasksByTab.set(tabId, [
      { toolUseId, expertId: "citation-auditor", prompt: "audit my cites" },
    ]);

    (mapper as any).startTaskLinkWatchdog(tabId, toolUseId, "citation-auditor");

    // Not fired yet.
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(89_999);
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1); // cross the 90s threshold
    // UI fail + tool_result (parent abort only when tabToSession is set).
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith("chat:stream", {
      tabId,
      type: "subAgent.completed",
      data: expect.objectContaining({
        taskToolUseId: toolUseId,
        status: "error",
        error: expect.stringContaining("citation-auditor"),
      }),
    });
    expect(send).toHaveBeenCalledWith("chat:stream", {
      tabId,
      type: "tool_result",
      data: expect.objectContaining({
        tool_use_id: toolUseId,
        is_error: true,
        name: "task",
      }),
    });
    // Pending task consumed.
    expect((mapper as any).pendingTasksByTab.get(tabId)).toBeUndefined();
  });

  it("does NOT fire when cleared by link before timeout", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-2";
    const toolUseId = "tooluse-2";
    (mapper as any).pendingTasksByTab.set(tabId, [
      { toolUseId, expertId: "literature-scout", prompt: "find papers" },
    ]);
    (mapper as any).startTaskLinkWatchdog(tabId, toolUseId, "literature-scout");

    // Simulate a successful link before timeout: linkSubAgentSession clears the
    // watchdog. We call the private clearer directly to isolate watchdog behavior.
    (mapper as any).clearTaskLinkWatchdog(toolUseId);

    vi.advanceTimersByTime(120_000);
    expect(send).not.toHaveBeenCalled();
  });

  it("handleTaskLinkTimeout is a no-op if the task already linked/completed", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    // No pending task for this tab — already consumed.
    (mapper as any).handleTaskLinkTimeout("tab-3", "tooluse-3", "library-scout");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("EventMapper Task dispatch recognition (kind:think, title:task)", () => {
  // Regression: OpenCode dispatches the Task tool (subagent delegation) as a
  // tool_call with kind:"think" and title:"task" and an EMPTY rawInput. Before
  // the fix, this fell through to KIND_TO_TOOL["think"]="todowrite", so the
  // subagent was never tracked (Q2: invisible hang) and the later tool_call_update
  // carrying <task_result> couldn't complete it (Q1: "No result received" live).
  it("recognizes title:task + kind:think + empty input as a Task (not todowrite) and tracks it", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-task";
    // Simulate the tab<->session mapping that registerSession would set up.
    (mapper as any).tabToSession.set(tabId, "ses-parent");
    (mapper as any).sessionToTab.set("ses-parent", tabId);

    // Real-shaped ACP tool_call event captured from prism-next.log.
    const toolCallParams = {
      sessionId: "ses-parent",
      update: {
        sessionUpdate: "tool_call",
        messageId: "msg-1",
        tool_call: {
          kind: "think",
          title: "task",
          toolCallId: "call_00_taskdispatch",
          rawInput: {},
          status: "pending",
          locations: [],
        },
      },
    };

    (mapper as any).mapSessionUpdate(tabId, "ses-parent", toolCallParams);

    // The tool_call should have been emitted with name "task" (NOT "todowrite").
    const partUpdate = send.mock.calls.find(
      (c) => c[0] === "chat:stream" && c[1]?.type === "message.part.updated",
    );
    expect(partUpdate).toBeTruthy();
    expect(partUpdate![1].data.part.name).toBe("task");

    // And a pending subAgent.linked must have been emitted (trackTaskToolUse ran).
    const linked = send.mock.calls.find(
      (c) => c[0] === "chat:stream" && c[1]?.type === "subAgent.linked",
    );
    expect(linked).toBeTruthy();
    expect(linked![1].data.taskToolUseId).toBe("call_00_taskdispatch");

    // And the link watchdog must be armed.
    expect((mapper as any).taskLinkTimeouts.has("call_00_taskdispatch")).toBe(true);

    // CRUCIALLY: no deny was emitted (empty input must not false-trigger the
    // built-in deny gate).
    const denied = send.mock.calls.find(
      (c) => c[0] === "chat:stream" && c[1]?.type === "tool_result" && c[1]?.data?.is_error,
    );
    expect(denied).toBeUndefined();
  });

  it("completes the Task when its tool_call_update carries <task_result> with title:task", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-task2";
    (mapper as any).tabToSession.set(tabId, "ses-parent2");
    (mapper as any).sessionToTab.set("ses-parent2", tabId);

    // First the tool_call (tracked).
    (mapper as any).mapSessionUpdate(tabId, "ses-parent2", {
      sessionId: "ses-parent2",
      update: {
        sessionUpdate: "tool_call",
        messageId: "msg-2",
        tool_call: {
          kind: "think",
          title: "task",
          toolCallId: "call_task2",
          rawInput: {},
          status: "pending",
          locations: [],
        },
      },
    });

    // Then the tool_call_update with the <task_result> content + title:task.
    (mapper as any).mapSessionUpdate(tabId, "ses-parent2", {
      sessionId: "ses-parent2",
      update: {
        sessionUpdate: "tool_call_update",
        messageId: "msg-2",
        tool_call_update: {
          toolCallId: "call_task2",
          title: "task",
          kind: "think",
          status: "completed",
          rawInput: {},
          rawOutput: '<task id="ses_child" state="completed"><task_result>done</task_result></task>',
          content: [],
          locations: [],
        },
      },
    });

    // completeSubAgentTask should have emitted subAgent.completed.
    const completed = send.mock.calls.find(
      (c) => c[0] === "chat:stream" && c[1]?.type === "subAgent.completed",
    );
    expect(completed).toBeTruthy();
    expect(completed![1].data.taskToolUseId).toBe("call_task2");
    expect(completed![1].data.status).toBe("done");
    // Watchdog cleared after completion.
    expect((mapper as any).taskLinkTimeouts.has("call_task2")).toBe(false);
  });
});

describe("EventMapper resolveTabForSession — no sole-pending heuristic (Bug #7)", () => {
  beforeEach(() => {
    acpStub.getSessionParentId.mockReset();
    acpStub.getSessionParentId.mockReturnValue(null);
    acpStub.markSubAgentSession.mockClear();
    acpStub.abort.mockClear();
  });

  it("does not bind an unmapped child session to the sole pending-task tab", () => {
    const { win } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabA = "tab-a";
    (mapper as any).pendingTasksByTab.set(tabA, [
      { toolUseId: "tool-a", expertId: "citation-auditor", prompt: "audit" },
    ]);

    const resolved = (mapper as any).resolveTabForSession("ses-orphan-child");
    expect(resolved).toBeUndefined();
    expect((mapper as any).sessionToTab.has("ses-orphan-child")).toBe(false);
  });

  it("still resolves via parentSessionId when present", () => {
    const { win } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabA = "tab-a";
    (mapper as any).tabToSession.set(tabA, "ses-parent-a");
    (mapper as any).sessionToTab.set("ses-parent-a", tabA);
    acpStub.getSessionParentId.mockReturnValueOnce("ses-parent-a");

    const resolved = (mapper as any).resolveTabForSession("ses-child-a");
    expect(resolved).toBe(tabA);
    expect((mapper as any).sessionToTab.get("ses-child-a")).toBe(tabA);
  });

  it("links orphan child after parent_id appears on retry (late SQLite commit)", () => {
    vi.useFakeTimers();
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-late-parent";
    const childId = "ses-child-late";
    const parentId = "ses-parent-late";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).pendingTasksByTab.set(tabId, [
      { toolUseId: "tool-late", expertId: "literature-scout", prompt: "find" },
    ]);

    // First lookup: parent_id not committed yet (the historical null-cache bug).
    acpStub.getSessionParentId.mockReturnValue(null);
    (mapper as any).handleNotification("session/update", {
      sessionId: childId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
    });
    expect((mapper as any).sessionToTab.has(childId)).toBe(false);
    expect((mapper as any).orphanSubSessions.has(childId)).toBe(true);

    // Later commit: parent_id available on retry.
    acpStub.getSessionParentId.mockReturnValue(parentId);
    vi.advanceTimersByTime(400);

    expect((mapper as any).sessionToTab.get(childId)).toBe(tabId);
    expect((mapper as any).subSessionToTaskTool.get(childId)).toBe("tool-late");
    expect(
      send.mock.calls.some(
        (c) => c[0] === "chat:stream" && c[1]?.type === "subAgent.linked" && c[1]?.data?.subSessionId === childId,
      ),
    ).toBe(true);
    vi.useRealTimers();
  });

  it("links orphan child immediately when Task is enqueued after early child updates", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-enqueue-late";
    const childId = "ses-child-early";
    const parentId = "ses-parent-early";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);

    // Child activity arrives before Task is tracked → orphan buffer.
    acpStub.getSessionParentId.mockReturnValue(parentId);
    (mapper as any).rememberOrphanSubSession(childId);
    expect((mapper as any).orphanSubSessions.has(childId)).toBe(true);

    // Parent Task tool_call finally enqueued.
    (mapper as any).trackTaskToolUse(tabId, "tool-early", {
      subagent_type: "citation-auditor",
      prompt: "audit",
    });

    expect((mapper as any).subSessionToTaskTool.get(childId)).toBe("tool-early");
    expect((mapper as any).orphanSubSessions.has(childId)).toBe(false);
    expect(
      send.mock.calls.some(
        (c) => c[0] === "chat:stream" && c[1]?.type === "subAgent.linked" && c[1]?.data?.subSessionId === childId,
      ),
    ).toBe(true);
  });
});

