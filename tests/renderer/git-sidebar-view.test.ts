import { describe, it, expect, beforeEach } from "vitest";
import { useGitStore } from "@/stores/git-store";

describe("git sidebar view tabs", () => {
  beforeEach(() => {
    useGitStore.setState({ sidebarView: "changes" });
  });

  it("switches between changes and history", () => {
    expect(useGitStore.getState().sidebarView).toBe("changes");

    useGitStore.getState().setSidebarView("history");
    expect(useGitStore.getState().sidebarView).toBe("history");

    useGitStore.getState().setSidebarView("changes");
    expect(useGitStore.getState().sidebarView).toBe("changes");
  });

  it("keeps a Changes commit lens when switching to History", () => {
    useGitStore.setState({
      changesLens: { kind: "commit", hash: "abc1234" },
      selectedCommitHash: null,
    });

    useGitStore.getState().setSidebarView("history");
    useGitStore.getState().selectCommit("def5678");

    expect(useGitStore.getState().changesLens).toEqual({ kind: "commit", hash: "abc1234" });
    expect(useGitStore.getState().selectedCommitHash).toBe("def5678");

    useGitStore.getState().setSidebarView("changes");
    expect(useGitStore.getState().selectedCommitHash).toBeNull();
    expect(useGitStore.getState().changesLens).toEqual({ kind: "commit", hash: "abc1234" });
  });
});
