import { describe, expect, it } from "vitest";
import {
  focusPathAfterOpenFolder,
  workbenchStateFromOpenResult,
  type WorkbenchOpenResult,
} from "../../src/shared/workbench-api";

describe("workbench open-folder helpers", () => {
  const state = {
    defaultProjectId: "p_default",
    defaultLastPath: "/docs/PrismNext",
    workbenchProjectIds: ["p_default", "p_a"],
    members: [
      { id: "p_default", lastPath: "/docs/PrismNext", displayName: "PrismNext" },
      { id: "p_a", lastPath: "/papers/a", displayName: "a" },
    ],
  };

  it("uses openedLastPath after a worktree remap, never the last member", () => {
    expect(focusPathAfterOpenFolder("/papers/a", "/home/.prismnext/projects/p_a/worktrees/wt/checkout"))
      .toBe("/papers/a");
    expect(focusPathAfterOpenFolder("  ", "/papers/requested")).toBe("/papers/requested");
    expect(focusPathAfterOpenFolder(undefined, "/papers/requested")).toBe("/papers/requested");
    expect(state.members[state.members.length - 1]?.lastPath).toBe("/papers/a");
    expect(focusPathAfterOpenFolder(undefined, "/other")).toBe("/other");
  });

  it("strips opened* fields so the store stays WorkbenchState", () => {
    const opened: WorkbenchOpenResult = {
      ...state,
      openedProjectId: "p_a",
      openedLastPath: "/papers/a",
    };
    expect(workbenchStateFromOpenResult(opened)).toEqual(state);
    expect(workbenchStateFromOpenResult(opened)).not.toHaveProperty("openedLastPath");
  });
});
