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
});
