import { describe, it, expect, beforeEach } from "vitest";
import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";
import { resolveGitRefreshRoot, resolveToolbarGitState } from "@/lib/git/git-refresh-root";

const PROJECT = "/proj";
const WT = `${PROJECT}/.prismnext/worktrees/calm-owl`;

describe("resolveGitRefreshRoot", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      projectRoot: PROJECT,
      checkoutRoot: PROJECT,
    });
    useGitStore.setState({ unitRoot: PROJECT, isGitRepo: true });
  });

  it("prefers checkoutRoot over projectRoot (worktree)", () => {
    useDocumentStore.setState({ checkoutRoot: WT });
    expect(resolveGitRefreshRoot()).toBe(WT);
  });

  it("falls back to projectRoot when checkout matches project", () => {
    expect(resolveGitRefreshRoot()).toBe(PROJECT);
  });
});

describe("resolveToolbarGitState", () => {
  it("hides Init Git when a remote host is not live yet", () => {
    expect(resolveToolbarGitState({
      projectRoot: "remote://lab/home/u/p",
      isGitRepo: false,
      repoKnown: false,
      remoteLive: false,
    })).toBe("hidden");
  });

  it("shows the last known branch while offline", () => {
    expect(resolveToolbarGitState({
      projectRoot: "remote://lab/home/u/p",
      isGitRepo: true,
      repoKnown: true,
      remoteLive: false,
    })).toBe("branch");
  });

  it("offers Init Git only when we know there is no repo and the host is live", () => {
    expect(resolveToolbarGitState({
      projectRoot: "remote://lab/home/u/p",
      isGitRepo: false,
      repoKnown: true,
      remoteLive: true,
    })).toBe("init");
    expect(resolveToolbarGitState({
      projectRoot: "/local/paper",
      isGitRepo: false,
      repoKnown: true,
      remoteLive: true,
    })).toBe("init");
  });
});
