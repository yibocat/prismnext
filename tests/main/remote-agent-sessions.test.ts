import { existsSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentService } from "../../src/main/agent/agent-service";
import { AgentSessionStore, resolvePiAgentRoot } from "../../src/main/agent/session-store";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

describe("remote session store locality", () => {
  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
  });

  it("writes sessions only under the Host home, not a second laptop home", () => {
    const remoteHome = mkdtempSync(join(tmpdir(), "prism-sess-remote-"));
    const laptopHome = mkdtempSync(join(tmpdir(), "prism-sess-laptop-"));
    const project = mkdtempSync(join(tmpdir(), "prism-sess-proj-"));
    setWorkbenchUserHomeOverride(remoteHome);

    const store = new AgentSessionStore(resolvePiAgentRoot());
    store.createSession({
      conversationId: "conv-remote",
      runtimeSessionId: "rt-remote",
      projectRoot: project,
      title: "Remote chat",
    });

    const agent = createAgentService({
      userDataDir: resolvePiAgentRoot(),
      getSettings: () => ({}),
      composeStableSystem: async () => "",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });
    expect(agent.listSessions(project).map((item) => item.conversationId)).toEqual(["conv-remote"]);

    const laptopSessions = join(laptopHome, ".prismnext", "sessions");
    mkdirSync(laptopSessions, { recursive: true });
    expect(readdirSync(laptopSessions)).toEqual([]);
    expect(existsSync(join(resolvePiAgentRoot(), "sessions"))).toBe(true);
  });
});
