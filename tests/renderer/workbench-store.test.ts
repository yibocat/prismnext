import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  groupSessionsByProject,
  lastPathForSession,
  projectRootForSession,
  sameProjectPath,
  useWorkbenchStore,
} from "@/stores/workbench-store";

const defaultMember = {
  id: "p_default",
  lastPath: "/Users/me/Documents/PrismNext",
  displayName: "PrismNext",
};

const paperA = {
  id: "p_a",
  lastPath: "/Users/me/papers/a",
  displayName: "a",
};

const state = {
  defaultProjectId: "p_default",
  defaultLastPath: "/Users/me/Documents/PrismNext",
  workbenchProjectIds: ["p_default"],
  members: [defaultMember],
};

const twoMembers = {
  ...state,
  workbenchProjectIds: ["p_default", "p_a"],
  members: [defaultMember, paperA],
};

describe("workbench launch store", () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      defaultProjectId: "",
      defaultLastPath: "",
      workbenchProjectIds: [],
      members: [],
      loaded: false,
      focusConversationId: null,
      focusProjectId: "",
      sessionProjectIds: {},
    });
    (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      workbenchGetState: vi.fn().mockResolvedValue(state),
      workbenchSetDefault: vi.fn(),
      workbenchSetDefaultFromFolder: vi.fn(),
      workbenchOpenFolder: vi.fn().mockResolvedValue(twoMembers),
      workbenchRemoveProject: vi.fn().mockResolvedValue(state),
    };
  });

  it("hydrates the default project path and never reads lastProjectPath", async () => {
    const next = await useWorkbenchStore.getState().hydrate();
    expect(next.defaultLastPath).toBe("/Users/me/Documents/PrismNext");
    expect(useWorkbenchStore.getState().defaultProjectId).toBe("p_default");
    expect(window.electronAPI.workbenchGetState).toHaveBeenCalledTimes(1);
    expect(window.electronAPI).not.toHaveProperty("lastProjectPath");
  });

  it("records focus conversation and maps session → project lastPath", async () => {
    await useWorkbenchStore.getState().hydrate();
    useWorkbenchStore.setState({
      ...twoMembers,
      loaded: true,
      sessionProjectIds: { conv_a: "p_a" },
    });
    useWorkbenchStore.getState().setFocusConversation("conv_a");
    expect(useWorkbenchStore.getState().focusConversationId).toBe("conv_a");
    expect(lastPathForSession("conv_a")).toBe("/Users/me/papers/a");
    expect(projectRootForSession("conv_a", "/Users/me/Documents/PrismNext")).toBe("/Users/me/papers/a");
    expect(projectRootForSession("unknown", "/fallback")).toBe("/fallback");
  });

  it("openFolder hydrates members without changing the default role here", async () => {
    await useWorkbenchStore.getState().hydrate();
    const next = await useWorkbenchStore.getState().openFolder("/Users/me/papers/a");
    expect(window.electronAPI.workbenchOpenFolder).toHaveBeenCalledWith("/Users/me/papers/a");
    expect(next.members).toHaveLength(2);
    expect(useWorkbenchStore.getState().members.map((m) => m.id)).toEqual(["p_default", "p_a"]);
    expect(useWorkbenchStore.getState().defaultProjectId).toBe("p_default");
  });

  it("removeProject updates members from the main-process result", async () => {
    useWorkbenchStore.setState({ ...twoMembers, loaded: true });
    const next = await useWorkbenchStore.getState().removeProject("p_a");
    expect(window.electronAPI.workbenchRemoveProject).toHaveBeenCalledWith("p_a");
    expect(next.workbenchProjectIds).toEqual(["p_default"]);
    expect(useWorkbenchStore.getState().members).toEqual([defaultMember]);
  });
});

describe("groupSessionsByProject", () => {
  it("keeps every member as a group even when a project has no sessions", () => {
    const groups = groupSessionsByProject(
      [defaultMember, paperA],
      [
        { id: "s0", title: "A0", lastModified: 2, createdAt: 1, projectId: "p_default" },
        { id: "s1", title: "A1", lastModified: 3, createdAt: 2, projectId: "p_a" },
      ],
    );
    expect(groups.map((g) => g.member.id)).toEqual(["p_default", "p_a"]);
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(["s0"]);
    expect(groups[1]?.sessions.map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("sameProjectPath", () => {
  it("treats trailing slashes as the same folder", () => {
    expect(sameProjectPath("/tmp/PrismNext/", "/tmp/PrismNext")).toBe(true);
    expect(sameProjectPath("/tmp/a", "/tmp/b")).toBe(false);
  });
});
