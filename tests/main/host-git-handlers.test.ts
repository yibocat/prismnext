import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";

describe("host git handlers", () => {
  it("reports a folder without .git as not a repo", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-host-git-"));
    const ctx = createHostContext();
    ctx.remoteRoot = root;
    await expect(dispatchHostMethod("git:isRepo", { projectRoot: root }, ctx)).resolves.toBe(false);
  });

  it("sees a .git directory on the bound root", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-host-git-"));
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    const ctx = createHostContext();
    ctx.remoteRoot = root;
    await expect(dispatchHostMethod("git:isRepo", { projectRoot: root }, ctx)).resolves.toBe(true);
  });
});
