import { describe, it, expect, beforeEach } from "vitest";
import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";
import { resolveGitRefreshRoot } from "@/lib/git/git-refresh-root";

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
