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
});
