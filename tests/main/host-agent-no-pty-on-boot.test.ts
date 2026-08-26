import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node-pty", () => {
  throw new Error("node-pty must not load when Host boots Chat");
});

import { createAgentService } from "../../src/main/agent/agent-service";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

describe("host agent boot does not load node-pty", () => {
  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
  });

  it("lists sessions without importing the desktop PTY", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-npty-"));
    setWorkbenchUserHomeOverride(home);
    const agent = createAgentService({
      userDataDir: join(home, ".prismnext"),
      modelTransport: "proxy",
      getSettings: () => ({}),
      composeStableSystem: async () => "",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
      resolveTeamBinding: () => ({ ok: true }),
    });
    expect(agent.listSessionsByProjectId("p_test")).toEqual([]);
    expect(agent.status("/tmp/project").ready).toBe(true);
  });

  it("registers literature:list and experiment:list without importing node-pty", async () => {
    const { createHostContext, dispatchHostMethod, listRegisteredHostMethods } = await import(
      "../../src/host/handler-registry"
    );
    expect(listRegisteredHostMethods()).toEqual(
      expect.arrayContaining(["literature:list", "experiment:list"]),
    );
    const home = mkdtempSync(join(tmpdir(), "prism-host-npty-list-"));
    setWorkbenchUserHomeOverride(home);
    const ctx = createHostContext();
    ctx.remoteRoot = home;
    await expect(dispatchHostMethod("experiment:list", { projectRoot: home }, ctx)).resolves.toBeDefined();
  });
});
