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
const subAgentSessionIds = new Set<string>();
const acpStub = {
  markSubAgentSession: vi.fn((id: string) => {
    subAgentSessionIds.add(id);
  }),
  isSubAgentSession: vi.fn((id: string) => subAgentSessionIds.has(id)),
  isSessionReplaySuppressed: vi.fn().mockReturnValue(false),
  getSessionParentId: vi.fn().mockReturnValue(null),
  listChildSessionIds: vi.fn().mockReturnValue([] as string[]),
  listSessionActivityParts: vi.fn().mockReturnValue([] as Array<{
    id: string;
    role: string;
    data: Record<string, unknown>;
  }>),
  getSessionAgentName: vi.fn().mockReturnValue(null as string | null),
  resolveChildSessionForTask: vi.fn().mockReturnValue(null as string | null),
  resolveCitationStagingSessionId: vi.fn().mockReturnValue(null),
  abort: vi.fn().mockResolvedValue(undefined),
  patchSessionToolOutput: vi.fn().mockResolvedValue(true),
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
    acpStub.abort.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits linkDegraded (not Task failure) after UI window; keeps pending for late link", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-1";
    const toolUseId = "tooluse-1";
    (mapper as any).pendingTasksByTab.set(tabId, [
      { toolUseId, expertId: "citation-auditor", prompt: "audit my cites" },
    ]);
    (mapper as any).openTaskToolToTab.set(toolUseId, tabId);
    (mapper as any).tabToSession.set(tabId, "ses-parent-1");

    (mapper as any).startTaskLinkWatchdog(tabId, toolUseId, "citation-auditor");

    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(11_999);
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(acpStub.abort).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("chat:stream", {
      tabId,
      type: "subAgent.linkDegraded",
      data: expect.objectContaining({
        taskToolUseId: toolUseId,
        expertId: "citation-auditor",
        code: "link_degraded",
      }),
    });
    const failedCompleted = send.mock.calls.find(
      (c) => c[1]?.type === "subAgent.completed" && c[1]?.data?.status === "error",
    );
    expect(failedCompleted).toBeUndefined();
    // Pending kept so orphan retries can still bind after UI degrade.
    expect((mapper as any).pendingTasksByTab.get(tabId)?.[0]?.toolUseId).toBe(toolUseId);
  });

  it("UI degrade does not abort parent and still allows later Task done", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-timeout";
    const toolUseId = "tooluse-timeout";
    (mapper as any).pendingTasksByTab.set(tabId, [
      { toolUseId, expertId: "explore", prompt: "find papers" },
    ]);
    (mapper as any).openTaskToolToTab.set(toolUseId, tabId);
    (mapper as any).tabToSession.set(tabId, "ses-parent-timeout");
    (mapper as any).sessionToTab.set("ses-parent-timeout", tabId);

    (mapper as any).startTaskLinkWatchdog(tabId, toolUseId, "explore");
    vi.advanceTimersByTime(12_000);
    expect(acpStub.abort).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      "chat:stream",
      expect.objectContaining({ type: "subAgent.linkDegraded" }),
    );

    send.mockClear();
    (mapper as any).completeSubAgentTask(tabId, toolUseId, false);
    expect(send).toHaveBeenCalledWith("chat:stream", {
      tabId,
      type: "subAgent.completed",
      data: { taskToolUseId: toolUseId, status: "done" },
    });
  });

  it("late parent_id can still link after UI degrade", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-late-after-degrade";
    const toolUseId = "tool-late-degrade";
    const parentId = "ses-parent-degrade";
    const childId = "ses-child-degrade";
    (mapper as any).pendingTasksByTab.set(tabId, [
      { toolUseId, expertId: "explore", prompt: "find" },
    ]);
    (mapper as any).openTaskToolToTab.set(toolUseId, tabId);
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);

    (mapper as any).startTaskLinkWatchdog(tabId, toolUseId, "explore");
    vi.advanceTimersByTime(12_000);
    expect(send).toHaveBeenCalledWith(
      "chat:stream",
      expect.objectContaining({ type: "subAgent.linkDegraded" }),
    );

    send.mockClear();
    acpStub.getSessionParentId.mockReturnValue(parentId);
    const resolved = (mapper as any).resolveTabForSession(childId);
    expect(resolved).toBe(tabId);
    expect((mapper as any).subSessionToTaskTool.get(childId)).toBe(toolUseId);
    expect(
      send.mock.calls.some(
        (c) => c[0] === "chat:stream" && c[1]?.type === "subAgent.linked" && c[1]?.data?.subSessionId === childId,
      ),
    ).toBe(true);
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

  it("clearPendingTasksForTab fails pending Tasks and cancels their 90s watchdog", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-stale";
    const toolUseId = "tooluse-stale";
    (mapper as any).pendingTasksByTab.set(tabId, [
      { toolUseId, expertId: "methodology-auditor", prompt: "audit papers" },
    ]);
    (mapper as any).tabToSession.set(tabId, "ses-parent-stale");
    (mapper as any).startTaskLinkWatchdog(tabId, toolUseId, "methodology-auditor");

    mapper.clearPendingTasksForTab(
      tabId,
      "Expert Task was abandoned because a new message was sent before its session linked.",
    );

    expect((mapper as any).pendingTasksByTab.get(tabId)).toBeUndefined();
    expect((mapper as any).taskLinkTimeouts.has(toolUseId)).toBe(false);
    expect(send).toHaveBeenCalledWith("chat:stream", {
      tabId,
      type: "subAgent.completed",
      data: expect.objectContaining({
        taskToolUseId: toolUseId,
        status: "error",
        error: expect.stringContaining("new message"),
      }),
    });

    // Stale watchdog must not fire later and abort the parent.
    vi.advanceTimersByTime(120_000);
    expect(acpStub.abort).not.toHaveBeenCalled();
  });

  it("releasePendingTaskWatchdogsForTab silently clears leftovers after parent end_turn", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-ended";
    const toolUseId = "tooluse-ended";
    (mapper as any).pendingTasksByTab.set(tabId, [
      { toolUseId, expertId: "general", prompt: "find papers" },
    ]);
    (mapper as any).tabToSession.set(tabId, "ses-parent-ended");
    (mapper as any).startTaskLinkWatchdog(tabId, toolUseId, "general");

    // Parent turn finished successfully — bookkeeping must not outlive it.
    mapper.releasePendingTaskWatchdogsForTab(tabId);

    expect((mapper as any).pendingTasksByTab.get(tabId)).toBeUndefined();
    expect((mapper as any).taskLinkTimeouts.has(toolUseId)).toBe(false);
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(120_000);
    expect(acpStub.abort).not.toHaveBeenCalled();
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
    subAgentSessionIds.clear();
    acpStub.getSessionParentId.mockReset();
    acpStub.getSessionParentId.mockReturnValue(null);
    acpStub.listChildSessionIds.mockReset();
    acpStub.listChildSessionIds.mockReturnValue([]);
    acpStub.listSessionActivityParts.mockReset();
    acpStub.listSessionActivityParts.mockReturnValue([]);
    acpStub.getSessionAgentName.mockReset();
    acpStub.getSessionAgentName.mockReturnValue(null);
    acpStub.resolveChildSessionForTask.mockReset();
    acpStub.resolveChildSessionForTask.mockReturnValue(null);
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

  it("resolves via parentSessionId only when a pending Task slot can bind", () => {
    const { win } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabA = "tab-a";
    (mapper as any).tabToSession.set(tabA, "ses-parent-a");
    (mapper as any).sessionToTab.set("ses-parent-a", tabA);
    (mapper as any).pendingTasksByTab.set(tabA, [
      { toolUseId: "tool-a", expertId: "citation-auditor", prompt: "audit" },
    ]);
    acpStub.getSessionParentId.mockReturnValue("ses-parent-a");

    const resolved = (mapper as any).resolveTabForSession("ses-child-a");
    expect(resolved).toBe(tabA);
    expect((mapper as any).sessionToTab.get("ses-child-a")).toBe(tabA);
    expect((mapper as any).subSessionToTaskTool.get("ses-child-a")).toBe("tool-a");
  });

  it("keeps child as orphan when parent is known but Task not enqueued yet", () => {
    const { win } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabA = "tab-a";
    (mapper as any).tabToSession.set(tabA, "ses-parent-a");
    (mapper as any).sessionToTab.set("ses-parent-a", tabA);
    acpStub.getSessionParentId.mockReturnValue("ses-parent-a");

    const resolved = (mapper as any).resolveTabForSession("ses-child-early");
    expect(resolved).toBeUndefined();
    expect((mapper as any).sessionToTab.has("ses-child-early")).toBe(false);
    expect((mapper as any).orphanSubSessions.has("ses-child-early")).toBe(true);
  });

  it("buffers early child activity and replays it after Task enqueue", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-buffer";
    const childId = "ses-child-buffer";
    const parentId = "ses-parent-buffer";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    acpStub.getSessionParentId.mockReturnValue(parentId);

    (mapper as any).handleNotification("session/update", {
      sessionId: childId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "scouting…" },
      },
    });
    expect((mapper as any).orphanUpdateBuffer.get(childId)?.length).toBe(1);
    expect(
      send.mock.calls.some((c) => c[1]?.type === "subAgent.activity"),
    ).toBe(false);

    (mapper as any).trackTaskToolUse(tabId, "tool-buffer", {
      subagent_type: "literature-scout",
      prompt: "find papers",
    });

    expect((mapper as any).subSessionToTaskTool.get(childId)).toBe("tool-buffer");
    expect((mapper as any).orphanUpdateBuffer.has(childId)).toBe(false);
    expect(
      send.mock.calls.some(
        (c) =>
          c[0] === "chat:stream"
          && c[1]?.type === "subAgent.activity"
          && c[1]?.data?.taskToolUseId === "tool-buffer"
          && c[1]?.data?.block?.text === "scouting…",
      ),
    ).toBe(true);
  });

  it("links via SQLite child list when Task is pending", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-db-child";
    const childId = "ses-child-db";
    const parentId = "ses-parent-db";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    acpStub.listChildSessionIds.mockReturnValue([childId]);
    acpStub.getSessionParentId.mockImplementation((id: string) =>
      id === childId ? parentId : null,
    );

    (mapper as any).trackTaskToolUse(tabId, "tool-db", {
      subagent_type: "explore",
      prompt: "explore",
    });

    expect((mapper as any).subSessionToTaskTool.get(childId)).toBe("tool-db");
    expect(
      send.mock.calls.some(
        (c) =>
          c[0] === "chat:stream"
          && c[1]?.type === "subAgent.linked"
          && c[1]?.data?.subSessionId === childId,
      ),
    ).toBe(true);
  });

  it("emits subAgent.snapshot from SQLite parts after child link (ACP may omit child updates)", () => {
    vi.useFakeTimers();
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-db-sync";
    const childId = "ses-child-sync";
    const parentId = "ses-parent-sync";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).pendingTasksByTab.set(tabId, [
      { toolUseId: "tool-sync", expertId: "general", prompt: "find papers" },
    ]);
    acpStub.getSessionParentId.mockReturnValue(parentId);
    acpStub.listSessionActivityParts.mockReturnValue([
      { id: "prt-user", role: "user", data: { type: "text", text: "delegation" } },
      { id: "prt-1", role: "assistant", data: { type: "text", text: "Searching…" } },
      {
        id: "prt-2",
        role: "assistant",
        data: {
          type: "tool",
          tool: "paper-search-mcp_search_arxiv",
          callID: "call-x",
          state: { status: "completed", input: { query: "world models" }, output: "[]" },
        },
      },
    ]);

    (mapper as any).linkSubAgentSession(tabId, childId);

    const snapshot = send.mock.calls.find(
      (c) => c[0] === "chat:stream" && c[1]?.type === "subAgent.snapshot",
    );
    expect(snapshot).toBeTruthy();
    expect(snapshot?.[1]?.data?.taskToolUseId).toBe("tool-sync");
    expect(snapshot?.[1]?.data?.blocks?.some((b: any) => b.type === "text" && b.text === "Searching…")).toBe(true);
    expect(snapshot?.[1]?.data?.blocks?.some((b: any) => b.type === "tool_use" && b.id === "call-x")).toBe(true);

    // Poll picks up later parts.
    acpStub.listSessionActivityParts.mockReturnValue([
      { id: "prt-1", role: "assistant", data: { type: "text", text: "Searching…" } },
      { id: "prt-3", role: "assistant", data: { type: "text", text: "Done." } },
    ]);
    send.mockClear();
    vi.advanceTimersByTime(400);
    expect(
      send.mock.calls.some(
        (c) =>
          c[1]?.type === "subAgent.snapshot"
          && c[1]?.data?.blocks?.some((b: any) => b.text === "Done."),
      ),
    ).toBe(true);
    vi.useRealTimers();
  });

  it("accumulates subagent agent_message_chunk deltas into growing text activity", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-stream";
    const childId = "ses-child-stream";
    const parentId = "ses-parent-stream";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).sessionToTab.set(childId, tabId);
    (mapper as any).subSessionToTaskTool.set(childId, "tool-stream");
    subAgentSessionIds.add(childId);
    acpStub.getSessionParentId.mockReturnValue(parentId);

    (mapper as any).handleNotification("session/update", {
      sessionId: childId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      },
    });
    (mapper as any).handleNotification("session/update", {
      sessionId: childId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: " world" },
      },
    });

    const texts = send.mock.calls
      .filter(
        (c) =>
          c[0] === "chat:stream"
          && c[1]?.type === "subAgent.activity"
          && c[1]?.data?.block?.type === "text",
      )
      .map((c) => c[1]?.data?.block?.text);
    expect(texts).toEqual(["Hello", "Hello world"]);
  });

  it("rewrites Task cancel as user_cancel when Stop was pressed", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-user-stop";
    const parentId = "ses-parent-stop";
    const toolId = "tool-user-stop";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).openTaskToolToTab.set(toolId, tabId);
    (mapper as any).taskToolExpertById.set(toolId, "explore");
    mapper.markUserStoppedTask(toolId);
    acpStub.patchSessionToolOutput.mockClear();

    (mapper as any).mapSessionUpdate(tabId, parentId, {
      sessionId: parentId,
      update: {
        sessionUpdate: "tool_call_update",
        messageId: "msg-stop",
        tool_call_update: {
          toolCallId: toolId,
          title: "task",
          kind: "think",
          status: "failed",
          rawInput: { subagent_type: "explore" },
          rawOutput: '{"error":"Task cancelled"}',
          content: [],
          locations: [],
        },
      },
    });

    const toolResult = send.mock.calls.find(
      (c) =>
        c[0] === "chat:stream"
        && c[1]?.type === "message.updated"
        && c[1]?.data?.message?.content?.[0]?.type === "tool_result"
        && c[1]?.data?.message?.content?.[0]?.tool_use_id === toolId,
    );
    const content = toolResult?.[1]?.data?.message?.content?.[0]?.content as string;
    expect(content).toMatch(/user stopped/i);
    expect(content).not.toMatch(/not a user cancel/i);
    expect(acpStub.patchSessionToolOutput).toHaveBeenCalled();
    const completed = send.mock.calls.find(
      (c) =>
        c[0] === "chat:stream"
        && c[1]?.type === "subAgent.completed"
        && c[1]?.data?.taskToolUseId === toolId,
    );
    expect(completed?.[1]?.data?.status).toBe("error");
    expect(completed?.[1]?.data?.error).toMatch(/user stopped/i);
  });

  it("waitForUserStoppedTaskSettlement resolves on user_cancel Task rewrite", async () => {
    const { win } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-settle";
    const parentId = "ses-parent-settle";
    const toolId = "tool-settle";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).openTaskToolToTab.set(toolId, tabId);
    (mapper as any).taskToolExpertById.set(toolId, "explore");

    mapper.freezeUserStoppedSubAgent(toolId);
    const settlement = mapper.waitForUserStoppedTaskSettlement(toolId, 5_000);

    (mapper as any).mapSessionUpdate(tabId, parentId, {
      sessionId: parentId,
      update: {
        sessionUpdate: "tool_call_update",
        messageId: "msg-settle",
        tool_call_update: {
          toolCallId: toolId,
          title: "task",
          kind: "think",
          status: "failed",
          rawInput: { subagent_type: "explore" },
          rawOutput: '{"error":"Task cancelled"}',
          content: [],
          locations: [],
        },
      },
    });

    await expect(settlement).resolves.toEqual({ settled: true });
    expect(mapper.isUserStoppedTask(toolId)).toBe(false);
  });

  it("waitForUserStoppedTaskSettlement rejects abort_failed on timeout", async () => {
    vi.useRealTimers();
    const { win } = makeMockWin();
    const mapper = new EventMapper(win);
    const toolId = "tool-settle-timeout";
    mapper.freezeUserStoppedSubAgent(toolId);
    const settlement = mapper.waitForUserStoppedTaskSettlement(toolId, 20);
    await expect(settlement).rejects.toMatchObject({ code: "abort_failed" });
    expect(mapper.isUserStoppedTask(toolId)).toBe(true);
  });

  it("registerSession clears false orphan on primary session and replays buffered updates", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-primary";
    const sessionId = "ses-primary-new";

    (mapper as any).handleNotification("session/update", {
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hello" },
      },
    });
    expect((mapper as any).orphanSubSessions.has(sessionId)).toBe(true);

    mapper.registerSession(sessionId, tabId);

    expect((mapper as any).orphanSubSessions.has(sessionId)).toBe(false);
    expect(
      send.mock.calls.some(
        (c) =>
          c[0] === "chat:stream"
          && c[1]?.type === "message.part.updated"
          && c[1]?.data?.part?.text === "hello",
      ),
    ).toBe(true);
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

    // Later commit: parent_id available on dense retry (250ms).
    acpStub.getSessionParentId.mockReturnValue(parentId);
    vi.advanceTimersByTime(250);

    expect((mapper as any).sessionToTab.get(childId)).toBe(tabId);
    expect((mapper as any).subSessionToTaskTool.get(childId)).toBe("tool-late");
    expect(
      send.mock.calls.some(
        (c) => c[0] === "chat:stream" && c[1]?.type === "subAgent.linked" && c[1]?.data?.subSessionId === childId,
      ),
    ).toBe(true);
    vi.useRealTimers();
  });

  it("still retries orphan parent_id well after the UI degrade window (late commit)", () => {
    vi.useFakeTimers();
    const { win } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-very-late";
    const childId = "ses-child-very-late";
    const parentId = "ses-parent-very-late";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).pendingTasksByTab.set(tabId, [
      { toolUseId: "tool-very-late", expertId: "literature-scout", prompt: "find" },
    ]);

    acpStub.getSessionParentId.mockReturnValue(null);
    (mapper as any).handleNotification("session/update", {
      sessionId: childId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
    });

    // Past UI degrade (12s) and dense window — orphan retries must continue.
    vi.advanceTimersByTime(30_000);
    expect((mapper as any).sessionToTab.has(childId)).toBe(false);
    expect((mapper as any).orphanSubSessions.has(childId)).toBe(true);

    acpStub.getSessionParentId.mockReturnValue(parentId);
    vi.advanceTimersByTime(20_000);

    expect((mapper as any).sessionToTab.get(childId)).toBe(tabId);
    expect((mapper as any).subSessionToTaskTool.get(childId)).toBe("tool-very-late");
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

describe("EventMapper background Task", () => {
  const STARTED = `<task id="ses_bg_child" state="running">
<summary>Background task started</summary>
<task_result>The task is working in the background.</task_result>
</task>`;

  const JOIN = `<task id="ses_bg_child" state="completed">
<summary>Background task completed: audit</summary>
<task_result>Done reviewing.</task_result>
</task>`;

  it("does not complete on background started terminal; emits subAgent.started", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-bg";
    const parentId = "ses-parent-bg";
    const toolUseId = "tool-bg-1";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).trackTaskToolUse(tabId, toolUseId, {
      subagent_type: "citation-auditor",
      prompt: "audit",
      background: true,
    });
    send.mockClear();

    (mapper as any).handleNotification("session/update", {
      sessionId: parentId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: toolUseId,
        title: "task",
        status: "completed",
        metadata: { background: true, jobId: "ses_bg_child", sessionId: "ses_bg_child" },
        rawInput: {
          subagent_type: "citation-auditor",
          prompt: "audit",
          background: true,
        },
        content: STARTED,
      },
    });

    expect((mapper as any).backgroundOpenTasks.has(toolUseId)).toBe(true);
    expect((mapper as any).openTaskToolToTab.get(toolUseId)).toBe(tabId);
    expect((mapper as any).isBackgroundOpenTask(toolUseId)).toBe(true);
    expect(
      send.mock.calls.some(
        (c) =>
          c[0] === "chat:stream"
          && c[1]?.type === "subAgent.started"
          && c[1]?.data?.taskToolUseId === toolUseId
          && c[1]?.data?.mode === "background",
      ),
    ).toBe(true);
    expect(
      send.mock.calls.some(
        (c) => c[0] === "chat:stream" && c[1]?.type === "subAgent.completed",
      ),
    ).toBe(false);
  });

  it("completes background Task on inject with status=completed", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-bg-join";
    const parentId = "ses-parent-bg-join";
    const toolUseId = "tool-bg-join";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).openTaskToolToTab.set(toolUseId, tabId);
    (mapper as any).backgroundOpenTasks.add(toolUseId);
    (mapper as any).subSessionToTaskTool.set("ses_bg_child", toolUseId);
    (mapper as any).taskToolExpertById.set(toolUseId, "citation-auditor");
    send.mockClear();

    const JOIN_STATUS = `<task id="ses_bg_child" status="completed">
<summary>Background task completed: audit</summary>
<task_result>Done reviewing.</task_result>
</task>`;

    (mapper as any).handleNotification("session/update", {
      sessionId: parentId,
      update: {
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: JOIN_STATUS },
      },
    });

    expect((mapper as any).backgroundOpenTasks.has(toolUseId)).toBe(false);
    expect((mapper as any).openTaskToolToTab.has(toolUseId)).toBe(false);
    expect(
      send.mock.calls.some(
        (c) =>
          c[0] === "chat:stream"
          && c[1]?.type === "subAgent.completed"
          && c[1]?.data?.taskToolUseId === toolUseId
          && c[1]?.data?.status === "done",
      ),
    ).toBe(true);
  });

  it("completes background Task when child session.status becomes idle", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-bg-idle";
    const parentId = "ses-parent-bg-idle";
    const childId = "ses_bg_idle_child";
    const toolUseId = "tool-bg-idle";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).sessionToTab.set(childId, tabId);
    (mapper as any).openTaskToolToTab.set(toolUseId, tabId);
    (mapper as any).backgroundOpenTasks.add(toolUseId);
    (mapper as any).subSessionToTaskTool.set(childId, toolUseId);
    send.mockClear();

    (mapper as any).mapSessionStatus(tabId, childId, { status: "idle" });

    expect((mapper as any).backgroundOpenTasks.has(toolUseId)).toBe(false);
    expect(
      send.mock.calls.some(
        (c) =>
          c[0] === "chat:stream"
          && c[1]?.type === "subAgent.completed"
          && c[1]?.data?.taskToolUseId === toolUseId,
      ),
    ).toBe(true);
  });

  it("does not FIFO-steal another open Task when inject id is unmatched", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-bg-multi";
    const parentId = "ses-parent-bg-multi";
    const toolA = "tool-bg-a";
    const toolB = "tool-bg-b";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).openTaskToolToTab.set(toolA, tabId);
    (mapper as any).openTaskToolToTab.set(toolB, tabId);
    (mapper as any).backgroundOpenTasks.add(toolA);
    (mapper as any).backgroundOpenTasks.add(toolB);
    // Only A is mapped — inject for unknown id must NOT complete A (old FIFO bug).
    (mapper as any).subSessionToTaskTool.set("ses_mapped_a", toolA);
    send.mockClear();

    (mapper as any).handleNotification("session/update", {
      sessionId: parentId,
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "text",
          text: `<task id="ses_unknown_other" status="completed"><summary>x</summary><task_result>y</task_result></task>`,
        },
      },
    });

    expect((mapper as any).backgroundOpenTasks.has(toolA)).toBe(true);
    expect((mapper as any).backgroundOpenTasks.has(toolB)).toBe(true);
    expect(
      send.mock.calls.some((c) => c[0] === "chat:stream" && c[1]?.type === "subAgent.completed"),
    ).toBe(false);
  });

  it("joins each of two background Tasks by matching inject session ids", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-bg-two";
    const parentId = "ses-parent-bg-two";
    const toolA = "tool-bg-two-a";
    const toolB = "tool-bg-two-b";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).openTaskToolToTab.set(toolA, tabId);
    (mapper as any).openTaskToolToTab.set(toolB, tabId);
    (mapper as any).backgroundOpenTasks.add(toolA);
    (mapper as any).backgroundOpenTasks.add(toolB);
    (mapper as any).subSessionToTaskTool.set("ses_child_a", toolA);
    (mapper as any).subSessionToTaskTool.set("ses_child_b", toolB);
    send.mockClear();

    (mapper as any).handleNotification("session/update", {
      sessionId: parentId,
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "text",
          text: `<task id="ses_child_a" status="completed"><summary>a</summary><task_result>A</task_result></task>`,
        },
      },
    });
    expect((mapper as any).backgroundOpenTasks.has(toolA)).toBe(false);
    expect((mapper as any).backgroundOpenTasks.has(toolB)).toBe(true);

    (mapper as any).handleNotification("session/update", {
      sessionId: parentId,
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "text",
          text: `<task id="ses_child_b" status="completed"><summary>b</summary><task_result>B</task_result></task>`,
        },
      },
    });
    expect((mapper as any).backgroundOpenTasks.has(toolB)).toBe(false);
    const completed = send.mock.calls.filter(
      (c) => c[0] === "chat:stream" && c[1]?.type === "subAgent.completed",
    );
    expect(completed.map((c) => c[1]?.data?.taskToolUseId).sort()).toEqual([toolA, toolB].sort());
  });

  it("joins inject even when Timeline A never marked backgroundOpenTasks", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-bg-recover";
    const parentId = "ses-parent-bg-recover";
    const toolUseId = "tool-bg-recover";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    // Linked + open, but ACP skipped markBackgroundTaskStarted.
    (mapper as any).openTaskToolToTab.set(toolUseId, tabId);
    (mapper as any).subSessionToTaskTool.set("ses_recover_child", toolUseId);
    expect((mapper as any).backgroundOpenTasks.has(toolUseId)).toBe(false);
    send.mockClear();

    (mapper as any).joinBackgroundTaskFromInject(tabId, {
      sessionId: "ses_recover_child",
      state: "completed",
      body: "done",
    });

    expect((mapper as any).openTaskToolToTab.has(toolUseId)).toBe(false);
    expect(
      send.mock.calls.some(
        (c) =>
          c[0] === "chat:stream"
          && c[1]?.type === "subAgent.completed"
          && c[1]?.data?.taskToolUseId === toolUseId,
      ),
    ).toBe(true);
  });

  it("waitForBackgroundTurnSettle resolves after last inject join", async () => {
    const { win } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-bg-settle";
    const parentId = "ses-parent-bg-settle";
    const toolA = "tool-settle-a";
    const toolB = "tool-settle-b";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).openTaskToolToTab.set(toolA, tabId);
    (mapper as any).openTaskToolToTab.set(toolB, tabId);
    (mapper as any).backgroundOpenTasks.add(toolA);
    (mapper as any).backgroundOpenTasks.add(toolB);
    (mapper as any).subSessionToTaskTool.set("ses_settle_a", toolA);
    (mapper as any).subSessionToTaskTool.set("ses_settle_b", toolB);
    (mapper as any).parentSessionStatus.set(parentId, "idle");

    const settlePromise = mapper.waitForBackgroundTurnSettle(tabId, { timeoutMs: 5_000 });

    // Simulate joins completing while wait is in flight.
    await new Promise((r) => setTimeout(r, 50));
    (mapper as any).joinBackgroundTaskFromInject(tabId, {
      sessionId: "ses_settle_a",
      state: "completed",
    });
    (mapper as any).joinBackgroundTaskFromInject(tabId, {
      sessionId: "ses_settle_b",
      state: "completed",
    });
    // Parent stays idle and quiet after joins.
    (mapper as any).parentSessionStatus.set(parentId, "idle");
    (mapper as any).parentLastContentAt.set(parentId, Date.now() - 2_000);

    await settlePromise;
    expect((mapper as any).backgroundOpenTasks.size).toBe(0);
  });

  it("sync Task terminal still completes immediately", () => {
    const { win, send } = makeMockWin();
    const mapper = new EventMapper(win);
    const tabId = "tab-sync";
    const parentId = "ses-parent-sync";
    const toolUseId = "tool-sync-1";
    (mapper as any).tabToSession.set(tabId, parentId);
    (mapper as any).sessionToTab.set(parentId, tabId);
    (mapper as any).trackTaskToolUse(tabId, toolUseId, {
      subagent_type: "citation-auditor",
      prompt: "audit",
    });
    send.mockClear();

    (mapper as any).handleNotification("session/update", {
      sessionId: parentId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: toolUseId,
        title: "task",
        status: "completed",
        rawInput: { subagent_type: "citation-auditor", prompt: "audit" },
        content: "Sync result body",
      },
    });

    expect((mapper as any).backgroundOpenTasks.has(toolUseId)).toBe(false);
    expect(
      send.mock.calls.some(
        (c) =>
          c[0] === "chat:stream"
          && c[1]?.type === "subAgent.completed"
          && c[1]?.data?.taskToolUseId === toolUseId,
      ),
    ).toBe(true);
  });
});

