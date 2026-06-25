import { describe, it, expect } from "vitest";
import {
  buildMergeToBranchStepLabels,
  buildMergeCloseStepLabels,
  formatWorktreeChangeSummary,
  canMergeWorktree,
  buildPushStepLabels,
  canPushWorktree,
} from "@/lib/git/git-orchestrator";

describe("git-orchestrator helpers", () => {
  it("buildMergeToBranchStepLabels skips checkout when already on base", () => {
    const labels = buildMergeToBranchStepLabels("main", true);
    expect(labels).toHaveLength(6);
    expect(labels.some((l) => l.includes("Switching"))).toBe(false);
    expect(labels[3]).toContain("Merging into main");
  });

  it("buildMergeToBranchStepLabels includes checkout when not on base", () => {
    const labels = buildMergeToBranchStepLabels("develop", false);
    expect(labels).toHaveLength(7);
    expect(labels[3]).toContain("Switching to develop");
  });

  it("deprecated buildPushStepLabels alias", () => {
    expect(buildPushStepLabels("main", true)).toEqual(buildMergeToBranchStepLabels("main", true));
  });

  it("buildMergeCloseStepLabels", () => {
    expect(buildMergeCloseStepLabels("main", true)).toHaveLength(5);
    expect(buildMergeCloseStepLabels("main", false)).toHaveLength(6);
  });

  it("formatWorktreeChangeSummary prefers file count", () => {
    expect(formatWorktreeChangeSummary("calm-owl", 2, 5)).toBe("2 files from calm-owl");
    expect(formatWorktreeChangeSummary("calm-owl", 0, 3)).toBe("3 commits from calm-owl");
  });

  it("canMergeWorktree", () => {
    expect(canMergeWorktree(0, 0)).toBe(false);
    expect(canMergeWorktree(1, 0)).toBe(true);
    expect(canMergeWorktree(0, 2)).toBe(true);
    expect(canPushWorktree(1, 0)).toBe(true);
  });
});
