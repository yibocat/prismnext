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
    const wtPath = "/proj/.prismnext/worktrees/calm-owl";
    const path = resolveWorktreePathForSend({ sessionCwd: wtPath }, "/proj");
    expect(path).toBe(wtPath);
  });

  it("resolveWorktreePathForSend falls back to active worktree", () => {
    const wtPath = "/proj/.prismnext/worktrees/calm-owl";
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
});
