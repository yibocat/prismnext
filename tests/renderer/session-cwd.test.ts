import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveWorktreePathForSend, captureSessionCwd } from "@/lib/git/checkout-context";
import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";

describe("session cwd helpers", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      projectRoot: "/proj",
      checkoutRoot: "/proj",
    } as any);
    useWorktreeStore.setState({
      activeWorktree: null,
      worktrees: [],
    } as any);
  });

  it("resolveWorktreePathForSend prefers tab.sessionCwd when worktree", () => {
    const wtPath = "/Users/me/.prismnext/projects/p_proj/worktrees/calm-owl/checkout";
    const path = resolveWorktreePathForSend({ sessionCwd: wtPath }, "/proj");
    expect(path).toBe(wtPath);
  });

  it("resolveWorktreePathForSend falls back to active worktree", () => {
    const wtPath = "/Users/me/.prismnext/projects/p_proj/worktrees/calm-owl/checkout";
    useWorktreeStore.setState({
      activeWorktree: {
        name: "calm-owl",
        path: wtPath,
        branch: "wt-calm-owl",
        baseBranch: "main",
        head: "abc",
        aheadCount: 0,
        behindCount: 0,
      },
    } as any);
    expect(resolveWorktreePathForSend({ sessionCwd: "/proj" }, "/proj")).toBe(wtPath);
  });

  it("captureSessionCwd returns project root in local mode", () => {
    expect(captureSessionCwd()).toBe("/proj");
  });

  it("does not treat the old paper-side worktree path as a checkout", () => {
    expect(
      resolveWorktreePathForSend({ sessionCwd: "/proj/.prismnext/worktrees/calm-owl" }, "/proj"),
    ).toBeUndefined();
  });
});
