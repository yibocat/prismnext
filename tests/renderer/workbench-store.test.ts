import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyVisibleIdReorder,
  defaultProjectAsMember,
  groupSessionsByProject,
  lastPathForSession,
  lastPathForSessionIn,
  moveListItem,
  projectRootForSession,
  resolveSessionProjectMeta,
  resolveWorkbenchMemberByPath,
  sameProjectPath,
  selectableWorkbenchProjects,
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
      projectDirectoryById: {},
    });
    (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      workbenchGetState: vi.fn().mockResolvedValue(state),
      workbenchSetDefault: vi.fn(),
      workbenchSetDefaultFromFolder: vi.fn(),
      workbenchOpenFolder: vi.fn().mockResolvedValue(twoMembers),
      workbenchRemoveProject: vi.fn().mockResolvedValue(state),
      workbenchUpdateDisplayName: vi.fn().mockResolvedValue(state),
      workbenchReorderProjects: vi.fn().mockResolvedValue({
        ...twoMembers,
        workbenchProjectIds: ["p_a", "p_default"],
        members: [paperA, defaultMember],
      }),
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
    expect(lastPathForSessionIn(useWorkbenchStore.getState(), "conv_a")).toBe("/Users/me/papers/a");
    expect(lastPathForSessionIn(useWorkbenchStore.getState(), "missing")).toBeNull();
    expect(projectRootForSession("conv_a", "/Users/me/Documents/PrismNext")).toBe("/Users/me/papers/a");
    expect(projectRootForSession("unknown", "/fallback")).toBe("/fallback");
  });

  it("resolves lastPath for a removed workbench project from the directory index", () => {
    useWorkbenchStore.setState({
      ...state,
      loaded: true,
      members: [defaultMember],
      sessionProjectIds: { conv_gone: "p_a" },
      projectDirectoryById: {
        p_a: {
          projectId: "p_a",
          lastPath: "remote://lab/home/u/a",
          displayName: "a",
          removedFromWorkbenchAt: "2026-08-27T00:00:00.000Z",
        },
      },
    });
    expect(lastPathForSession("conv_gone")).toBe("remote://lab/home/u/a");
    expect(projectRootForSession("conv_gone")).toBe("remote://lab/home/u/a");
  });

  it("openFolder hydrates members without changing the default role here", async () => {
    await useWorkbenchStore.getState().hydrate();
    const next = await useWorkbenchStore.getState().openFolder("/Users/me/papers/a");
    expect(window.electronAPI.workbenchOpenFolder).toHaveBeenCalledWith("/Users/me/papers/a");
    expect(next.members).toHaveLength(2);
    expect(useWorkbenchStore.getState().members.map((m) => m.id)).toEqual(["p_default", "p_a"]);
    expect(useWorkbenchStore.getState().defaultProjectId).toBe("p_default");
  });

  it("reorderProjects writes the new workbench order", async () => {
    useWorkbenchStore.setState({ ...twoMembers, loaded: true });
    const next = await useWorkbenchStore.getState().reorderProjects(["p_a", "p_default"]);
    expect(window.electronAPI.workbenchReorderProjects).toHaveBeenCalledWith(["p_a", "p_default"]);
    expect(next.workbenchProjectIds).toEqual(["p_a", "p_default"]);
    expect(useWorkbenchStore.getState().members.map((m) => m.id)).toEqual(["p_a", "p_default"]);
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

describe("workbench member order helpers", () => {
  it("moves an item and keeps unlisted ids in place", () => {
    expect(moveListItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(applyVisibleIdReorder(["a", "ghost", "b"], ["b", "a"])).toEqual(["b", "ghost", "a"]);
  });
});

describe("selectableWorkbenchProjects", () => {
  it("keeps the default project choosable when it is not on the workbench", () => {
    const listed = selectableWorkbenchProjects({
      defaultProjectId: "p_default",
      defaultLastPath: "/Users/me/Documents/PrismNext",
      members: [paperA],
    });
    expect(listed.map((m) => m.id)).toEqual(["p_default", "p_a"]);
    expect(selectableWorkbenchProjects({
      defaultProjectId: "p_default",
      defaultLastPath: defaultMember.lastPath,
      members: [defaultMember, paperA],
    }).map((m) => m.id)).toEqual(["p_default", "p_a"]);
  });

  it("returns the same object when the default is off the workbench", () => {
    const offList = {
      defaultProjectId: "p_default",
      defaultLastPath: "/Users/me/Documents/PrismNext",
      members: [paperA],
    };
    expect(defaultProjectAsMember(offList)).toBe(defaultProjectAsMember(offList));
    expect(selectableWorkbenchProjects(offList)).toBe(selectableWorkbenchProjects(offList));
  });
});

describe("sameProjectPath", () => {
  it("treats trailing slashes as the same folder", () => {
    expect(sameProjectPath("/tmp/PrismNext/", "/tmp/PrismNext")).toBe(true);
    expect(sameProjectPath("/tmp/a", "/tmp/b")).toBe(false);
  });

  it("treats a path.resolve leftover as the same remote folder", () => {
    expect(sameProjectPath(
      "remote://lab/home/ubuntu/paper",
      "/Users/me/code/remote:/lab/home/ubuntu/paper",
    )).toBe(true);
  });
});

describe("resolveWorkbenchMemberByPath", () => {
  it("finds a workbench member or the off-list default", () => {
    const listed = {
      defaultProjectId: "p_default",
      defaultLastPath: defaultMember.lastPath,
      members: [defaultMember, paperA],
    };
    expect(resolveWorkbenchMemberByPath(listed, `${paperA.lastPath}/`)?.id).toBe("p_a");

    const offList = {
      defaultProjectId: "p_default",
      defaultLastPath: defaultMember.lastPath,
      members: [paperA],
    };
    expect(resolveWorkbenchMemberByPath(offList, defaultMember.lastPath)?.id).toBe("p_default");
    expect(resolveWorkbenchMemberByPath(offList, "/missing")).toBeNull();
  });
});

describe("resolveSessionProjectMeta", () => {
  it("falls back to the directory index and exposes the remote host", () => {
    expect(resolveSessionProjectMeta(
      { projectId: "p_gone", projectLastPath: "" },
      [defaultMember],
      {
        p_gone: {
          projectId: "p_gone",
          lastPath: "remote://lab/home/u/gone",
          displayName: "gone",
          removedFromWorkbenchAt: "2026-08-27T00:00:00.000Z",
        },
      },
    )).toEqual({
      id: "p_gone",
      name: "gone",
      lastPath: "remote://lab/home/u/gone",
      host: "lab",
    });
  });
});
