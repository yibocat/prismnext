import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";
import type { WorktreeInfo } from "../../src/shared/git";

describe("host worktree handlers", () => {
  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
  });

  it("creates a worktree under the server workbench home", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-wt-home-"));
    setWorkbenchUserHomeOverride(home);
    const paper = join(home, "paper");
    mkdirSync(paper, { recursive: true });
    writeFileSync(join(paper, "README.md"), "hello\n");
    mkdirSync(join(paper, ".workbench"), { recursive: true });
    writeFileSync(join(paper, ".workbench", "workbench.json"), '{"id":"p_host_wt"}\n');
    execFileSync("git", ["init", "-b", "main"], { cwd: paper });
    execFileSync("git", ["add", "README.md"], { cwd: paper });
    execFileSync("git", ["-c", "user.email=t@t.test", "-c", "user.name=t", "commit", "-m", "init"], {
      cwd: paper,
    });

    const ctx = createHostContext();
    ctx.remoteRoot = paper;
    ctx.projectId = "p_host_wt";

    const created = await dispatchHostMethod(
      "worktree:create",
      { projectRoot: paper, baseBranch: "main" },
      ctx,
    ) as WorktreeInfo;
    expect(created.name.length).toBeGreaterThan(0);
    expect(created.path).toContain(`${join(".prismnext", "projects", "p_host_wt", "worktrees")}`);
    expect(existsSync(join(created.path, ".git"))).toBe(true);

    const listed = await dispatchHostMethod("worktree:list", { projectRoot: paper }, ctx) as WorktreeInfo[];
    expect(listed.some((item) => item.name === created.name)).toBe(true);
  });
});
