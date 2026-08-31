import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAgentService } from "../../src/main/agent/agent-service";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

describe("host agent boot", () => {
  it("lists no sessions from an empty remote home", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-agent-"));
    setWorkbenchUserHomeOverride(home);
    try {
      const agent = createAgentService({
        userDataDir: join(home, ".prismnext"),
        modelTransport: "proxy",
        getSettings: () => ({}),
        composeStableSystem: async () => "",
        composeProjectRules: async () => "",
        composeAgentsMd: async () => "",
        resolveTeamBinding: () => ({ ok: true }),
      });
      expect(agent.listSessions("/tmp/project")).toEqual([]);
      const status = agent.status("/tmp/project");
      expect(status.ready).toBe(true);
      expect(status.reason).toBeUndefined();
    } finally {
      setWorkbenchUserHomeOverride(null);
    }
  });
});
