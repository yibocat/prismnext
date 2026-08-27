import { describe, expect, it } from "vitest";
import {
  collectOrphanProjectIds,
  listSessionFetchTargets,
  markProjectRemoved,
  mergeProjectDirectory,
  parseProjectDirectoryIndex,
  type ProjectDirectoryIndex,
} from "../../src/shared/workbench/project-directory-index";

describe("mergeProjectDirectory", () => {
  it("upserts lastPath and displayName, and clears a removed stamp on rejoin", () => {
    const index: ProjectDirectoryIndex = {
      p_a: {
        projectId: "p_a",
        lastPath: "remote://lab/home/u/old",
        displayName: "old",
        removedFromWorkbenchAt: "2026-08-01T00:00:00.000Z",
      },
    };
    expect(mergeProjectDirectory(index, {
      projectId: "p_a",
      lastPath: "remote://lab/home/u/a",
      displayName: "paper-a",
    })).toEqual({
      p_a: {
        projectId: "p_a",
        lastPath: "remote://lab/home/u/a",
        displayName: "paper-a",
      },
    });
  });

  it("keeps the previous displayName when the new entry omits one", () => {
    const index = mergeProjectDirectory({}, {
      projectId: "p_b",
      lastPath: "/papers/b",
      displayName: "b",
    });
    expect(mergeProjectDirectory(index, {
      projectId: "p_b",
      lastPath: "/papers/b-renamed",
    }).p_b).toEqual({
      projectId: "p_b",
      lastPath: "/papers/b-renamed",
      displayName: "b",
    });
  });
});

describe("markProjectRemoved", () => {
  it("keeps lastPath and stamps removedFromWorkbenchAt", () => {
    const index = mergeProjectDirectory({}, {
      projectId: "p_a",
      lastPath: "remote://lab/home/u/a",
      displayName: "a",
    });
    const next = markProjectRemoved(index, "p_a", "2026-08-27T00:00:00.000Z");
    expect(next.p_a).toEqual({
      projectId: "p_a",
      lastPath: "remote://lab/home/u/a",
      displayName: "a",
      removedFromWorkbenchAt: "2026-08-27T00:00:00.000Z",
    });
    expect(index.p_a?.removedFromWorkbenchAt).toBeUndefined();
  });

  it("is a no-op for an unknown id", () => {
    expect(markProjectRemoved({}, "missing")).toEqual({});
  });
});

describe("collectOrphanProjectIds", () => {
  const directory: ProjectDirectoryIndex = {
    p_member: { projectId: "p_member", lastPath: "/papers/on-list" },
    p_gone: {
      projectId: "p_gone",
      lastPath: "remote://lab/home/u/gone",
      displayName: "gone",
      removedFromWorkbenchAt: "2026-08-27T00:00:00.000Z",
    },
    p_ghost: {
      projectId: "p_ghost",
      lastPath: "",
      removedFromWorkbenchAt: "2026-08-27T00:00:00.000Z",
    },
  };

  it("returns removed projects that still have a lastPath and are not members", () => {
    expect(collectOrphanProjectIds({
      memberIds: ["p_member"],
      projectDirectory: directory,
      sessionProjectIds: { conv_1: "p_gone", conv_2: "p_member" },
    })).toEqual(["p_gone"]);
  });

  it("includes a session-mapped id even if the directory row was never stamped removed", () => {
    expect(collectOrphanProjectIds({
      memberIds: [],
      projectDirectory: {
        p_side: { projectId: "p_side", lastPath: "/papers/side" },
      },
      sessionProjectIds: { conv: "p_side" },
    })).toEqual(["p_side"]);
  });

  it("drops ids that are still workbench members or have no lastPath", () => {
    expect(collectOrphanProjectIds({
      memberIds: new Set(["p_gone"]),
      projectDirectory: directory,
      sessionProjectIds: { conv: "p_ghost" },
    })).toEqual([]);
  });
});

describe("listSessionFetchTargets", () => {
  it("appends orphan directory rows after workbench members", () => {
    expect(listSessionFetchTargets({
      members: [{ id: "p_on", lastPath: "/papers/on", displayName: "on" }],
      projectDirectory: {
        p_on: { projectId: "p_on", lastPath: "/papers/on", displayName: "on" },
        p_gone: {
          projectId: "p_gone",
          lastPath: "remote://lab/home/u/gone",
          displayName: "gone",
          removedFromWorkbenchAt: "2026-08-27T00:00:00.000Z",
        },
      },
      sessionProjectIds: { conv: "p_gone" },
    })).toEqual([
      { id: "p_on", lastPath: "/papers/on", displayName: "on" },
      { id: "p_gone", lastPath: "remote://lab/home/u/gone", displayName: "gone" },
    ]);
  });
});

describe("parseProjectDirectoryIndex", () => {
  it("keeps well-formed rows and ignores junk", () => {
    expect(parseProjectDirectoryIndex({
      p_ok: { lastPath: "/papers/a", displayName: "a" },
      p_bad: { lastPath: 12 },
      "": { lastPath: "/x" },
    })).toEqual({
      p_ok: { projectId: "p_ok", lastPath: "/papers/a", displayName: "a" },
    });
  });
});
