import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as filesystem from "../../src/main/project/filesystem";

const refreshSpies = vi.hoisted(() => ({
  subagents: vi.fn(),
  skills: vi.fn(),
}));
const browserSpies = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [{
      isDestroyed: () => false,
      webContents: { send: browserSpies.send },
    }],
  },
}));

vi.mock("../../src/main/services/project-subagents-refresh", () => ({
  scheduleExpertsRefreshFromPaths: refreshSpies.subagents,
}));

vi.mock("../../src/main/skills/project-skills-refresh", () => ({
  scheduleSkillsRefreshFromPaths: refreshSpies.skills,
}));

import {
  getProjectFileType,
  isWatchIgnored,
  startWatching,
  stopWatching,
  shouldSkipProjectDirectory,
  HIDDEN_DIRECTORY_NAMES,
} from "../../src/main/project/filesystem";

const isAgentContentWatchIgnored = (
  filesystem as typeof filesystem & {
    isAgentContentWatchIgnored: (path: string) => boolean;
  }
).isAgentContentWatchIgnored;

describe("filesystem visibility", () => {
  afterEach(async () => {
    await stopWatching();
    refreshSpies.subagents.mockReset();
    refreshSpies.skills.mockReset();
    browserSpies.send.mockReset();
  });

  it("hides only internal and dependency directories", () => {
    expect(HIDDEN_DIRECTORY_NAMES.has(".git")).toBe(true);
    expect(HIDDEN_DIRECTORY_NAMES.has(".prismnext")).toBe(true);
    expect(HIDDEN_DIRECTORY_NAMES.has(".workbench")).toBe(true);
    expect(shouldSkipProjectDirectory(".github")).toBe(false);
    expect(shouldSkipProjectDirectory(".vscode")).toBe(false);
    expect(shouldSkipProjectDirectory("manuscript")).toBe(false);
  });

  it("hides git worktree metadata files at checkout root", () => {
    expect(getProjectFileType(".git")).toBeNull();
    expect(getProjectFileType(".prism-worktree-meta")).toBeNull();
  });

  it("shows common dotfiles except system junk", () => {
    expect(getProjectFileType(".gitignore")).toBe("other");
    expect(getProjectFileType(".env")).toBe("other");
    expect(getProjectFileType(".editorconfig")).toBe("other");
    expect(getProjectFileType(".DS_Store")).toBeNull();
    expect(getProjectFileType("Thumbs.db")).toBeNull();
  });

  it("still hides LaTeX build artifacts", () => {
    expect(getProjectFileType("main.aux")).toBeNull();
    expect(getProjectFileType("main.log")).toBeNull();
  });

  it("keeps the root watcher out of every .prismnext path", () => {
    const root = "/tmp/prism-watch-boundary";
    for (const path of [
      `${root}/.prismnext`,
      `${root}/.prismnext/agent`,
      `${root}/.workbench`,
      `${root}/.workbench/agent`,
      `${root}/.workbench/agent/teams/project.local/subagents/reviewer/instructions.md`,
    ]) {
      expect(isWatchIgnored(path), path).toBe(true);
    }
  });

  it("only allows agent skills, local, and Teams subtrees in the dedicated watcher", () => {
    const root = "/tmp/prism-watch-boundary";
    for (const path of [
      `${root}/.workbench/agent`,
      `${root}/.workbench/agent/skills/example/SKILL.md`,
      `${root}/.workbench/agent/local/experts/reviewer/instructions.md`,
      `${root}/.workbench/agent/teams/project.local/subagents/reviewer/instructions.md`,
    ]) {
      expect(isAgentContentWatchIgnored(path), path).toBe(false);
    }
    for (const path of [
      `${root}/.git/config`,
      `${root}/node_modules/pkg/index.js`,
      `${root}/.workbench/agent/other/config.json`,
      `${root}/.workbench/agent/teams/project.local/node_modules/pkg/index.js`,
      `${root}/.workbench/agent/.hidden/cache.json`,
    ]) {
      expect(isAgentContentWatchIgnored(path), path).toBe(true);
    }
  });

  it("creates a missing Agent root before watching later Team content", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-watch-new-agent-"));
    const teamInstructions = join(
      root,
      ".workbench",
      "agent",
      "teams",
      "project.local",
      "subagents",
      "reviewer",
      "instructions.md",
    );
    try {
      const watcher = await startWatching(root, { usePolling: true });
      await watcher.ready;
      await new Promise((resolve) => setTimeout(resolve, 150));
      mkdirSync(join(teamInstructions, ".."), { recursive: true });
      writeFileSync(teamInstructions, "created after watcher start\n");

      await vi.waitFor(
        () =>
          expect(refreshSpies.subagents).toHaveBeenCalledWith(
            root,
            expect.arrayContaining([teamInstructions]),
          ),
        { timeout: 5_000, interval: 50 },
      );
      expect(refreshSpies.subagents).toHaveBeenCalledTimes(1);
    } finally {
      await stopWatching();
      rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);

  it("cleans up a failed Agent-root initialization before a later start", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-watch-agent-init-fail-"));
    const blockedAgentParent = join(root, ".workbench");
    const teamInstructions = join(
      root,
      ".workbench",
      "agent",
      "teams",
      "project.local",
      "subagents",
      "reviewer",
      "instructions.md",
    );
    try {
      writeFileSync(blockedAgentParent, "not a directory\n");
      await expect(startWatching(root, { usePolling: true })).rejects.toThrow();
      rmSync(blockedAgentParent, { force: true });

      const watcher = await startWatching(root, { usePolling: true });
      await watcher.ready;
      await new Promise((resolve) => setTimeout(resolve, 150));
      mkdirSync(join(teamInstructions, ".."), { recursive: true });
      writeFileSync(teamInstructions, "after failed initialization\n");

      await vi.waitFor(
        () =>
          expect(refreshSpies.subagents).toHaveBeenCalledWith(
            root,
            expect.arrayContaining([teamInstructions]),
          ),
        { timeout: 5_000, interval: 50 },
      );
      expect(refreshSpies.subagents).toHaveBeenCalledTimes(1);
    } finally {
      await stopWatching();
      rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);

  it("watches a real external Team edit after chokidar is ready", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-watch-teams-"));
    const teamInstructions = join(
      root,
      ".workbench",
      "agent",
      "teams",
      "project.local",
      "subagents",
      "reviewer",
      "instructions.md",
    );
    try {
      mkdirSync(join(teamInstructions, ".."), { recursive: true });
      writeFileSync(teamInstructions, "before watcher\n");
      const watcher = await startWatching(root, { usePolling: true });
      await watcher.ready;
      // Polling + awaitWriteFinish can miss a write that lands in the same
      // tick as `ready`, especially when the full suite saturates the event loop.
      await new Promise((resolve) => setTimeout(resolve, 150));
      writeFileSync(teamInstructions, "external edit\n");

      await vi.waitFor(
        () =>
          expect(browserSpies.send).toHaveBeenCalledWith(
            "fs:fileChanged",
            expect.objectContaining({ projectRoot: root, changedPaths: expect.arrayContaining([teamInstructions]) }),
          ),
        { timeout: 5_000, interval: 50 },
      );
      expect(refreshSpies.subagents).toHaveBeenCalledWith(
        root,
        expect.arrayContaining([teamInstructions]),
      );
      expect(refreshSpies.subagents).toHaveBeenCalledTimes(1);
    } finally {
      await stopWatching();
      rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);
});
