import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";

describe("host terminal", () => {
  it("refuses to start a shell before a remoteRoot is bound", async () => {
    await expect(
      dispatchHostMethod("terminal:create", { sessionId: "s1", tabId: "t1" }, createHostContext()),
    ).rejects.toMatchObject({ code: "not_connected" });
  });

  it("runs pwd in the bound remoteRoot", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-host-pty-"));
    const ctx = createHostContext();
    ctx.remoteRoot = root;
    const chunks: string[] = [];
    ctx.emit = (channel, payload) => {
      if (channel === "terminal:data") {
        chunks.push(String((payload as { data?: string }).data ?? ""));
      }
    };
    await dispatchHostMethod("terminal:create", { sessionId: "s1", tabId: "t1" }, ctx);
    await dispatchHostMethod("terminal:write", { sessionId: "s1", data: "pwd\n" }, ctx);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !chunks.join("").includes(root)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await dispatchHostMethod("terminal:destroy", { sessionId: "s1" }, ctx);
    expect(chunks.join("")).toContain(root);
  });
});
