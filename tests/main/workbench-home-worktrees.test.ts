import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { worktreeCheckoutRel } from "../../src/shared/workbench/paths";
import {
  homeBrowserDir,
  resolveWorkbenchHome,
  setWorkbenchUserHomeOverride,
} from "../../src/main/workbench/home";
import { writeWorkbenchJson } from "../../src/main/workbench/identity";
import { writeProjectSlotMeta } from "../../src/main/workbench/default-project";
import { createWorktree, listWorktrees, removeWorktree } from "../../src/main/git/worktree";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp", on: vi.fn() },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  session: { fromPartition: () => ({}) },
}));

const temps: string[] = [];

afterEach(() => {
  setWorkbenchUserHomeOverride(null);
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tmp(prefix: string): string {
  const base = join(process.cwd(), "node_modules", ".cache", "p9-worktrees");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, prefix));
  temps.push(dir);
  return dir;
}

function initGit(dir: string): void {
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync(
    "git",
    ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "init"],
    { cwd: dir },
  );
}

describe("home worktree checkout (D-15)", { timeout: 30_000 }, () => {
  it("creates checkout under the workbench home and leaves the paper folder clean", async () => {
    const userHome = tmp("wb-wt-home-");
    setWorkbenchUserHomeOverride(userHome);
    const paper = tmp("wb-wt-paper-");
    writeWorkbenchJson(paper, { id: "p_paper" });
    writeProjectSlotMeta("p_paper", { lastPath: paper });
    writeFileSync(join(paper, "README.md"), "paper\n");
    initGit(paper);

    const info = await createWorktree(paper, "calm-owl");
    const expected = join(resolveWorkbenchHome(), worktreeCheckoutRel("p_paper", "calm-owl"));
    expect(info.name).toBe("calm-owl");
    expect(info.path.replace(/\\/g, "/")).toBe(expected.replace(/\\/g, "/"));
    expect(existsSync(join(info.path, ".git"))).toBe(true);
    expect(existsSync(join(paper, ".prismnext", "worktrees"))).toBe(false);
    expect(existsSync(join(paper, ".workbench", "worktrees"))).toBe(false);

    const listed = await listWorktrees(paper);
    expect(listed.map((w) => w.name)).toEqual(["calm-owl"]);
    expect(listed[0]?.path.replace(/\\/g, "/")).toBe(expected.replace(/\\/g, "/"));

    writeFileSync(join(info.path, "from-agent.md"), "checkout only\n");
    expect(existsSync(join(paper, "from-agent.md"))).toBe(false);

    await removeWorktree(paper, "calm-owl");
    expect(existsSync(expected)).toBe(false);
    expect(await listWorktrees(paper)).toEqual([]);
  });
});

describe("home browser bookmarks (D-13)", () => {
  it("writes bookmarks under ~/.prismnext/browser, not the paper folder", async () => {
    const userHome = tmp("wb-br-home-");
    setWorkbenchUserHomeOverride(userHome);
    const paper = tmp("wb-br-paper-");

    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const { ipcMain } = await import("electron");
    (ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation((channel: string, fn) => {
      handlers.set(channel, fn);
    });
    const { registerBrowserHandlers } = await import("../../src/main/ipc/browser");
    registerBrowserHandlers();

    const first = await (handlers.get("browser:init") as Function)(null, { projectRoot: paper });
    expect(first.bookmarks.length).toBeGreaterThan(0);
    const bookmarksFile = join(homeBrowserDir(), "bookmarks.json");
    expect(existsSync(bookmarksFile)).toBe(true);
    expect(existsSync(join(paper, ".prismnext", "browser"))).toBe(false);

    await (handlers.get("browser:saveBookmarks") as Function)(null, {
      projectRoot: paper,
      bookmarks: [{ id: "x", title: "Keep", url: "https://example.com", createdAt: 1, order: 0 }],
    });

    const otherPaper = tmp("wb-br-paper-b-");
    const second = await (handlers.get("browser:init") as Function)(null, { projectRoot: otherPaper });
    expect(second.bookmarks).toEqual([
      expect.objectContaining({ title: "Keep", url: "https://example.com" }),
    ]);
    expect(JSON.parse(readFileSync(bookmarksFile, "utf-8"))[0].title).toBe("Keep");
  });
});
