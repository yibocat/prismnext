import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executionListRunning = vi.fn();
const executionApplyProjectSwitch = vi.fn(async () => ({ ok: true }));
const agentDispose = vi.fn(async () => undefined);
const agentReassignSessionProject = vi.fn(async () => ({ ok: true, existed: false }));
const terminalDestroyAllAiPty = vi.fn(async () => undefined);
const projectCheck = vi.fn(async () => ({ missing: [] as string[] }));
const agentListSessionsByProjectId = vi.fn(async () => [] as Array<{ conversationId: string }>);
const settingsSet = vi.fn(async () => undefined);
const workbenchGetState = vi.fn();

vi.stubGlobal("window", {
  electronAPI: {
    executionListRunning,
    executionApplyProjectSwitch,
    agentDispose,
    agentReassignSessionProject,
    terminalDestroyAllAiPty,
    projectCheck,
    agentListSessionsByProjectId,
    settingsSet,
    workbenchGetState,
  },
});

import { useExecutionStore } from "../../src/renderer/stores/execution-store";
import { useTabCloseConfirmStore } from "../../src/renderer/stores/tab-close-confirm-store";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyWorkbenchFocusChange,
  refreshFocusedRemoteNeighbors,
  assignSessionProject,
  assignSessionToProjectPath,
  confirmProjectSwitchIfNeeded,
  listRunningExperimentIds,
  readWorkbenchResume,
  resolveWorkbenchLaunchTarget,
  restoreWorkbenchLaunch,
  snapshotWorkbenchResume,
  writeWorkbenchResume,
} from "../../src/renderer/lib/workspace/project-lifecycle";
import { useChatStore } from "../../src/renderer/stores/chat-store";
import { makeDefaultTab } from "../../src/renderer/stores/chat/model";
import { useDocumentStore } from "../../src/renderer/stores/document-store";
import { useExperimentStore } from "../../src/renderer/stores/experiment-store";
import { useLiteratureStore } from "../../src/renderer/stores/literature-store";
import { useSettingsStore } from "../../src/renderer/stores/settings-store";
import { useWorkbenchStore } from "../../src/renderer/stores/workbench-store";
import { useWorkspaceConfigStore } from "../../src/renderer/stores/workspace-config-store";

describe("project switch lifecycle", () => {
  beforeEach(() => {
    executionListRunning.mockReset();
    executionApplyProjectSwitch.mockReset();
    executionApplyProjectSwitch.mockResolvedValue({ ok: true });
    agentDispose.mockReset();
    agentReassignSessionProject.mockReset();
    agentReassignSessionProject.mockResolvedValue({ ok: true, existed: false });
    terminalDestroyAllAiPty.mockReset();
    useExecutionStore.getState().reset();
    useTabCloseConfirmStore.setState({ pending: null });
  });

  it("lists only running experiment executions for a project", () => {
    useExecutionStore.setState({
      byId: {
        bash: {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "bash",
            origin: "agent-bash",
            state: "running",
            command: "ls",
            cwd: "/tmp",
            projectId: "/proj-a",
            createdAt: 1,
          },
        },
        exp: {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "exp",
            origin: "experiment-run",
            state: "running",
            command: "python train.py",
            cwd: "/tmp",
            projectId: "/proj-a",
            createdAt: 1,
          },
        },
        other: {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "other",
            origin: "experiment-run",
            state: "running",
            command: "python other.py",
            cwd: "/tmp",
            projectId: "/proj-b",
            createdAt: 1,
          },
        },
      },
    });
    expect(listRunningExperimentIds("/proj-a")).toEqual(["exp"]);
  });

  it("continues without a dialog when no experiments are running", async () => {
    executionListRunning.mockResolvedValue({ ok: true, summaries: [] });
    await expect(confirmProjectSwitchIfNeeded("/proj-a")).resolves.toBe("continue");
    expect(useTabCloseConfirmStore.getState().pending).toBeNull();
  });

  it("resolves continue / stop / abort from the shared confirm dialog", async () => {
    executionListRunning.mockResolvedValue({
      ok: true,
      summaries: [{
        executionId: "exp",
        origin: "experiment-run",
        state: "running",
        command: "python train.py",
        cwd: "/tmp",
        projectId: "/proj-a",
        createdAt: 1,
      }],
    });

    const pending = confirmProjectSwitchIfNeeded("/proj-a");
    await vi.waitFor(() => {
      expect(useTabCloseConfirmStore.getState().pending?.secondaryLabel).toBeTruthy();
    });
    useTabCloseConfirmStore.getState().confirm();
    await expect(pending).resolves.toBe("continue");

    const stopPending = confirmProjectSwitchIfNeeded("/proj-a");
    await vi.waitFor(() => {
      expect(useTabCloseConfirmStore.getState().pending).not.toBeNull();
    });
    useTabCloseConfirmStore.getState().secondary();
    await expect(stopPending).resolves.toBe("stop");

    const abortPending = confirmProjectSwitchIfNeeded("/proj-a");
    await vi.waitFor(() => {
      expect(useTabCloseConfirmStore.getState().pending).not.toBeNull();
    });
    useTabCloseConfirmStore.getState().cancel();
    await expect(abortPending).resolves.toBe("abort");
  });

  it("does not export the leftover full-teardown switch helper", async () => {
    const lifecycle = await import("../../src/renderer/lib/workspace/project-lifecycle");
    expect(lifecycle).not.toHaveProperty("resetApplicationStateForProjectSwitch");
    const openSrc = readFileSync(
      join(import.meta.dirname, "../../src/renderer/stores/document-store.ts"),
      "utf-8",
    );
    expect(openSrc).not.toContain("resetApplicationStateForProjectSwitch");
    expect(openSrc).not.toContain("members.length - 1");
    expect(openSrc).toContain("focusPathAfterOpenFolder");
  });

  it("focus change does not dispose agents, clear chats, or stop experiments", async () => {
    await applyWorkbenchFocusChange();
    expect(agentDispose).not.toHaveBeenCalled();
    expect(executionApplyProjectSwitch).not.toHaveBeenCalled();
    expect(terminalDestroyAllAiPty).not.toHaveBeenCalled();
  });

  it("keeps document-store file-tree writes and routes neighbor refresh through switchWorkbenchFocus", () => {
    const openSrc = readFileSync(
      join(import.meta.dirname, "../../src/renderer/stores/document-store.ts"),
      "utf-8",
    );
    expect(openSrc).toContain("switchWorkbenchFocus");
    expect(openSrc).toContain("applyDocumentTree");
    expect(openSrc).not.toContain("reloadCommands");
    expect(openSrc).not.toContain("literature-store");
    expect(openSrc).not.toContain("gitWarmup");
    const lifecycleSrc = readFileSync(
      join(import.meta.dirname, "../../src/renderer/lib/workspace/project-lifecycle.ts"),
      "utf-8",
    );
    expect(lifecycleSrc).toContain("shouldSkipRemoteHostBind");
    expect(lifecycleSrc).toContain("refreshFocusedRemoteNeighbors");
    const remoteStoreSrc = readFileSync(
      join(import.meta.dirname, "../../src/renderer/stores/remote-store.ts"),
      "utf-8",
    );
    expect(remoteStoreSrc).toContain("refreshFocusedRemoteNeighbors");
  });

  it("refreshes remote neighbors after Host is ready and ignores local roots", async () => {
    const loadConfig = vi.fn(async () => undefined);
    const reloadMetadataFromDisk = vi.fn(async () => undefined);
    const refresh = vi.fn(async () => undefined);
    const refreshList = vi.fn(async () => undefined);
    useWorkspaceConfigStore.setState({ loadConfig });
    useDocumentStore.setState({ reloadMetadataFromDisk });
    useLiteratureStore.setState({ refresh });
    useExperimentStore.setState({ refreshList });

    await refreshFocusedRemoteNeighbors("/papers/local");
    expect(loadConfig).not.toHaveBeenCalled();
    expect(reloadMetadataFromDisk).not.toHaveBeenCalled();

    await refreshFocusedRemoteNeighbors("remote://lab/home/u/paper");
    expect(loadConfig).toHaveBeenCalledWith("remote://lab/home/u/paper");
    expect(reloadMetadataFromDisk).toHaveBeenCalledWith(true);
    await vi.waitFor(() => {
      expect(refresh).toHaveBeenCalledWith("remote://lab/home/u/paper");
      expect(refreshList).toHaveBeenCalledWith("remote://lab/home/u/paper");
    });
  });
});

describe("assignSessionProject", () => {
  const originalFocus = useDocumentStore.getState().focusProject;

  beforeEach(() => {
    agentReassignSessionProject.mockReset();
    agentReassignSessionProject.mockResolvedValue({ ok: true, existed: false });
    useWorkbenchStore.setState({
      members: [
        { id: "p_a", lastPath: "/papers/a", displayName: "A" },
        { id: "p_b", lastPath: "/papers/b", displayName: "B" },
      ],
      sessionProjectIds: { "conv-1": "p_a" },
      focusProjectId: "p_a",
    });
    useChatStore.setState({
      tabs: [makeDefaultTab("conv-1")],
      activeTabId: "conv-1",
    });
    useDocumentStore.setState({
      projectRoot: null,
      focusProject: vi.fn(async () => {}),
    });
  });

  afterEach(() => {
    useDocumentStore.setState({ focusProject: originalFocus });
  });

  it("moves the open chat to another workbench project", async () => {
    await expect(assignSessionProject("conv-1", "p_b")).resolves.toBe(true);
    expect(agentReassignSessionProject).toHaveBeenCalledWith({
      conversationId: "conv-1",
      projectId: "p_b",
      projectRoot: "/papers/b",
    });
    expect(useWorkbenchStore.getState().sessionProjectIds["conv-1"]).toBe("p_b");
    expect(useChatStore.getState().tabs[0]?.sessionCwd).toBe("/papers/b");
    expect(useDocumentStore.getState().focusProject).toHaveBeenCalledWith("/papers/b", {
      connectRemote: false,
    });
  });

  it("refuses while the agent is streaming", async () => {
    useChatStore.setState({
      tabs: [{ ...makeDefaultTab("conv-1"), isStreaming: true }],
      activeTabId: "conv-1",
    });
    await expect(assignSessionProject("conv-1", "p_b")).resolves.toBe(false);
    expect(agentReassignSessionProject).not.toHaveBeenCalled();
  });

  it("skips the agent write when the session is already on that project", async () => {
    await expect(assignSessionProject("conv-1", "p_a")).resolves.toBe(true);
    expect(agentReassignSessionProject).not.toHaveBeenCalled();
  });

  it("refuses after the conversation already has turns", async () => {
    const tab = makeDefaultTab("conv-1");
    useChatStore.setState({
      tabs: [{
        ...tab,
        conversation: {
          ...tab.conversation,
          turns: [{
            turnId: "t1",
            turnIndex: 0,
            user: { blocks: [{ type: "text", text: "hello" }] },
            assistant: { blocks: [] },
            status: "completed",
          }],
        },
      }],
      activeTabId: "conv-1",
    });
    await expect(assignSessionProject("conv-1", "p_b")).resolves.toBe(false);
    expect(agentReassignSessionProject).not.toHaveBeenCalled();
  });
});

describe("assignSessionToProjectPath", () => {
  const originalFocus = useDocumentStore.getState().focusProject;
  const originalOpen = useDocumentStore.getState().openProject;

  beforeEach(() => {
    agentReassignSessionProject.mockReset();
    agentReassignSessionProject.mockResolvedValue({ ok: true, existed: false });
    projectCheck.mockReset();
    projectCheck.mockResolvedValue({ missing: [] });
    useWorkbenchStore.setState({
      members: [
        { id: "p_a", lastPath: "/papers/a", displayName: "A" },
        { id: "p_b", lastPath: "/papers/b", displayName: "B" },
      ],
      defaultProjectId: "p_def",
      defaultLastPath: "/papers/default",
      sessionProjectIds: { "conv-1": "p_a" },
      focusProjectId: "p_a",
    });
    useChatStore.setState({
      tabs: [makeDefaultTab("conv-1")],
      activeTabId: "conv-1",
    });
    useDocumentStore.setState({
      projectRoot: null,
      focusProject: vi.fn(async () => {}),
      openProject: vi.fn(async (path: string) => {
        useWorkbenchStore.setState({
          members: [
            ...useWorkbenchStore.getState().members,
            { id: "p_joined", lastPath: path, displayName: "Joined" },
          ],
        });
      }),
    });
  });

  afterEach(() => {
    useDocumentStore.setState({
      focusProject: originalFocus,
      openProject: originalOpen,
    });
  });

  it("assigns an empty chat to a workbench folder without opening a new session", async () => {
    await expect(assignSessionToProjectPath("conv-1", "/papers/b")).resolves.toBe(true);
    expect(useDocumentStore.getState().openProject).not.toHaveBeenCalled();
    expect(agentReassignSessionProject).toHaveBeenCalledWith({
      conversationId: "conv-1",
      projectId: "p_b",
      projectRoot: "/papers/b",
    });
    expect(useChatStore.getState().tabs).toHaveLength(1);
  });

  it("assigns to the default project even when it is off the workbench", async () => {
    await expect(assignSessionToProjectPath("conv-1", "/papers/default")).resolves.toBe(true);
    expect(useDocumentStore.getState().openProject).not.toHaveBeenCalled();
    expect(agentReassignSessionProject).toHaveBeenCalledWith({
      conversationId: "conv-1",
      projectId: "p_def",
      projectRoot: "/papers/default",
    });
  });

  it("joins a folder that is not on the workbench, then binds the empty chat", async () => {
    await expect(assignSessionToProjectPath("conv-1", "/papers/c")).resolves.toBe(true);
    expect(useDocumentStore.getState().openProject).toHaveBeenCalledWith("/papers/c");
    expect(agentReassignSessionProject).toHaveBeenCalledWith({
      conversationId: "conv-1",
      projectId: "p_joined",
      projectRoot: "/papers/c",
    });
    expect(useChatStore.getState().tabs).toHaveLength(1);
  });
});

describe("workbench launch resume", () => {
  const workbench = {
    defaultProjectId: "p_def",
    defaultLastPath: "/papers/default",
    members: [
      { id: "p_a", lastPath: "/papers/a", displayName: "A" },
      { id: "p_b", lastPath: "/papers/b", displayName: "B" },
    ],
  };

  it("opens the last focused project and conversation, not the default", () => {
    const target = resolveWorkbenchLaunchTarget(workbench, {
      lastFocusProjectId: "p_b",
      lastFocusConversationId: "conv-old",
      lastOpenConversationIds: ["conv-other", "conv-old"],
    });
    expect(target.projectId).toBe("p_b");
    expect(target.projectPath).toBe("/papers/b");
    expect(target.conversationId).toBe("conv-old");
    expect(target.openConversationIds).toEqual(["conv-other", "conv-old"]);
  });

  it("falls back to the default project when the last folder is gone", () => {
    const target = resolveWorkbenchLaunchTarget(workbench, {
      lastFocusProjectId: "p_gone",
      lastFocusConversationId: "conv-old",
    });
    expect(target.projectId).toBe("p_def");
    expect(target.projectPath).toBe("/papers/default");
    expect(target.conversationId).toBe("conv-old");
  });

  it("can resume the default project even when it is off the workbench", () => {
    const target = resolveWorkbenchLaunchTarget(
      { ...workbench, members: [workbench.members[0]!] },
      { lastFocusProjectId: "p_def" },
    );
    expect(target.projectId).toBe("p_def");
    expect(target.projectPath).toBe("/papers/default");
  });

  it("snapshots the open chat tabs and focused project", () => {
    useWorkbenchStore.setState({
      ...workbench,
      workbenchProjectIds: ["p_a", "p_b"],
      focusProjectId: "p_b",
      sessionProjectIds: { "conv-old": "p_b", "conv-other": "p_a" },
    });
    useChatStore.setState({
      tabs: [makeDefaultTab("conv-other"), makeDefaultTab("conv-old")],
      activeTabId: "conv-old",
    });
    expect(snapshotWorkbenchResume()).toEqual({
      lastFocusProjectId: "p_b",
      lastFocusConversationId: "conv-old",
      lastOpenConversationIds: ["conv-other", "conv-old"],
      lastSessionProjectIds: { "conv-old": "p_b", "conv-other": "p_a" },
    });
  });

  it("reads and writes the resume snapshot through settings", async () => {
    settingsSet.mockClear();
    useSettingsStore.setState({
      settings: {
        lastFocusProjectId: "p_a",
        lastFocusConversationId: "conv-1",
        lastOpenConversationIds: ["conv-1"],
        lastSessionProjectIds: { "conv-1": "p_a" },
      },
      loaded: true,
    });
    expect(readWorkbenchResume()).toEqual({
      lastFocusProjectId: "p_a",
      lastFocusConversationId: "conv-1",
      lastOpenConversationIds: ["conv-1"],
      lastSessionProjectIds: { "conv-1": "p_a" },
    });
    await writeWorkbenchResume({
      lastFocusProjectId: "p_b",
      lastFocusConversationId: "conv-old",
      lastOpenConversationIds: ["conv-old"],
      lastSessionProjectIds: { "conv-old": "p_b" },
    });
    expect(useSettingsStore.getState().settings.lastFocusProjectId).toBe("p_b");
    expect(settingsSet).toHaveBeenCalledWith({
      lastFocusProjectId: "p_b",
      lastFocusConversationId: "conv-old",
      lastOpenConversationIds: ["conv-old"],
      lastSessionProjectIds: { "conv-old": "p_b" },
    });
  });
});

describe("restoreWorkbenchLaunch", () => {
  const originalFocus = useDocumentStore.getState().focusProject;
  const originalOpen = useDocumentStore.getState().openProject;
  const originalLoad = useChatStore.getState().loadSession;

  beforeEach(() => {
    agentListSessionsByProjectId.mockReset();
    agentListSessionsByProjectId.mockResolvedValue([]);
    workbenchGetState.mockReset();
    workbenchGetState.mockResolvedValue({
      defaultProjectId: "p_def",
      defaultLastPath: "/papers/default",
      workbenchProjectIds: ["p_a", "p_b"],
      members: [
        { id: "p_a", lastPath: "/papers/a", displayName: "A" },
        { id: "p_b", lastPath: "/papers/b", displayName: "B" },
      ],
    });
    useWorkbenchStore.setState({
      defaultProjectId: "",
      defaultLastPath: "",
      workbenchProjectIds: [],
      members: [],
      loaded: false,
      focusProjectId: "",
      sessionProjectIds: {},
    });
    useSettingsStore.setState({
      settings: {
        lastFocusProjectId: "p_b",
        lastFocusConversationId: "conv-old",
        lastOpenConversationIds: ["conv-other", "conv-old"],
        lastSessionProjectIds: { "conv-old": "p_b", "conv-other": "p_a" },
      },
      loaded: true,
    });
    useChatStore.setState({
      tabs: [makeDefaultTab("conv-fresh")],
      activeTabId: "conv-fresh",
      loadSession: vi.fn(async () => {}),
    });
    useDocumentStore.setState({
      projectRoot: null,
      openProject: vi.fn(async () => {}),
      focusProject: vi.fn(async () => {}),
    });
  });

  afterEach(() => {
    useDocumentStore.setState({
      focusProject: originalFocus,
      openProject: originalOpen,
    });
    useChatStore.setState({ loadSession: originalLoad });
  });

  it("opens the last project and reloads the last session tabs", async () => {
    agentListSessionsByProjectId.mockImplementation(async (args: { projectId: string }) => {
      if (args.projectId === "p_b") return [{ conversationId: "conv-old" }];
      if (args.projectId === "p_a") return [{ conversationId: "conv-other" }];
      return [];
    });
    await restoreWorkbenchLaunch({ watch: false });
    expect(useDocumentStore.getState().openProject).toHaveBeenCalledWith("/papers/b");
    expect(useChatStore.getState().loadSession).toHaveBeenCalledWith(
      "conv-other",
      undefined,
      "/papers/a",
      { connectRemote: false },
    );
    expect(useChatStore.getState().loadSession).toHaveBeenCalledWith(
      "conv-old",
      undefined,
      "/papers/b",
      { connectRemote: false },
    );
    const loadOrder = (useChatStore.getState().loadSession as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0]);
    expect(loadOrder.at(-1)).toBe("conv-old");
  });

  it("keeps a new chat on the last project when that session is gone", async () => {
    await restoreWorkbenchLaunch({ watch: false });
    expect(useDocumentStore.getState().openProject).toHaveBeenCalledWith("/papers/b");
    expect(useChatStore.getState().loadSession).not.toHaveBeenCalled();
    expect(useWorkbenchStore.getState().sessionProjectIds["conv-fresh"]).toBe("p_b");
  });

  it("does not join the default back onto the workbench just to resume it", async () => {
    workbenchGetState.mockResolvedValue({
      defaultProjectId: "p_def",
      defaultLastPath: "/papers/default",
      workbenchProjectIds: ["p_a"],
      members: [{ id: "p_a", lastPath: "/papers/a", displayName: "A" }],
    });
    useSettingsStore.setState({
      settings: { lastFocusProjectId: "p_def", lastFocusConversationId: "" },
      loaded: true,
    });
    await restoreWorkbenchLaunch({ watch: false });
    expect(useDocumentStore.getState().openProject).not.toHaveBeenCalled();
    expect(useDocumentStore.getState().focusProject).toHaveBeenCalledWith("/papers/default");
  });

  it("does not join a remembered remote project as a local folder", async () => {
    workbenchGetState.mockResolvedValue({
      defaultProjectId: "p_def",
      defaultLastPath: "/papers/default",
      workbenchProjectIds: ["p_lab"],
      members: [{
        id: "p_lab",
        lastPath: "remote://lab/home/ubuntu/paper",
        displayName: "paper",
      }],
    });
    useSettingsStore.setState({
      settings: { lastFocusProjectId: "p_lab", lastFocusConversationId: "" },
      loaded: true,
    });
    await restoreWorkbenchLaunch({ watch: false });
    expect(useDocumentStore.getState().openProject).not.toHaveBeenCalled();
    expect(useDocumentStore.getState().focusProject).toHaveBeenCalledWith(
      "remote://lab/home/ubuntu/paper",
      { connectRemote: false },
    );
  });
});

describe("app launch wiring", () => {
  it("restores the last workbench project and session instead of always opening the default", () => {
    const app = readFileSync(join(import.meta.dirname, "../../src/renderer/App.tsx"), "utf-8");
    expect(app).toContain("restoreWorkbenchLaunch");
    expect(app).not.toContain("openProject(state.defaultLastPath)");
  });
});
