import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

describe("host terminal", () => {
  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
  });

  it("refuses to start a shell before a remoteRoot is bound", async () => {
    await expect(
      dispatchHostMethod("terminal:create", { sessionId: "s1", tabId: "t1" }, createHostContext()),
    ).rejects.toMatchObject({ code: "not_connected" });
  });

  // Real PTY spawn (darwin-relay on macOS): needs a budget above the 5s
  // default when the full suite saturates the machine.
  it(
    "runs pwd in the bound remoteRoot",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "prism-host-pty-"));
      const ctx = createHostContext();
      ctx.remoteRoot = root;
      const chunks: string[] = [];
      ctx.emit = (channel, payload) => {
        if (channel === "terminal:data") {
          chunks.push(String((payload as { data?: string }).data ?? ""));
        }
      };
      const created = await dispatchHostMethod("terminal:create", { sessionId: "s1", tabId: "t1" }, ctx) as {
        cwd?: string;
        shell?: string;
      };
      expect(created.cwd).toBe(root);
      expect(created.shell).toMatch(/bash|sh$/);
      await dispatchHostMethod("terminal:resize", { sessionId: "s1", cols: 120, rows: 32 }, ctx);
      await dispatchHostMethod("terminal:write", { sessionId: "s1", data: "pwd\n" }, ctx);
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && !chunks.join("").includes(root)) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await dispatchHostMethod("terminal:destroy", { sessionId: "s1" }, ctx);
      expect(chunks.join("")).toContain(root);
    },
    30_000,
  );

  it("opens a shell in the bound project's worktree checkout", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-pty-home-"));
    const paper = mkdtempSync(join(tmpdir(), "prism-host-pty-paper-"));
    const checkout = join(home, ".prismnext", "projects", "lab-paper", "worktrees", "wt-a", "checkout");
    mkdirSync(checkout, { recursive: true });
    setWorkbenchUserHomeOverride(home);
    const ctx = createHostContext();
    ctx.remoteRoot = paper;
    ctx.projectId = "lab-paper";
    const created = await dispatchHostMethod(
      "terminal:create",
      { sessionId: "s-wt", tabId: "t-wt", cwd: checkout },
      ctx,
    ) as { cwd?: string };
    expect(created.cwd).toBe(checkout);
    await dispatchHostMethod("terminal:destroy", { sessionId: "s-wt" }, ctx);
    await expect(
      dispatchHostMethod(
        "terminal:create",
        { sessionId: "s-bad", tabId: "t-bad", cwd: "/etc" },
        ctx,
      ),
    ).rejects.toMatchObject({ code: "path_escaped" });
  });
});
