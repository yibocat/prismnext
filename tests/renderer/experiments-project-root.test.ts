import { describe, expect, it } from "vitest";
import { selectExperimentProjectRoot } from "../../src/renderer/modes/experiments-mode/experiments-project-root";

describe("selectExperimentProjectRoot", () => {
  it("prefers checkoutRoot (worktree) over canonical projectRoot", () => {
    expect(
      selectExperimentProjectRoot({
        checkoutRoot: "/repo/.prismnext/worktrees/feat",
        projectRoot: "/repo",
      }),
    ).toBe("/repo/.prismnext/worktrees/feat");
  });

  it("falls back to projectRoot on main checkout", () => {
    expect(
      selectExperimentProjectRoot({
        checkoutRoot: null,
        projectRoot: "/repo",
      }),
    ).toBe("/repo");
  });
});
