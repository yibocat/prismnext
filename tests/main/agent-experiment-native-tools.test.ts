import { describe, expect, it } from "vitest";
import { createExperimentNativeTools } from "../../src/main/agent/experiment-native-tools";
import { createPiLabNativeTools } from "../../src/main/agent/pi-lab-service";
import { createPiNativeTools } from "../../src/main/agent/pi-sdk-runtime";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";
import type { ExperimentLogBridgeRequest } from "../../src/main/services/experiment-log-bridge";

const ctx: ToolExecuteContext = {
  runtimeSessionId: "rt-lab-1",
  tabId: "pi-lab",
  turnId: "turn-1",
  toolCallId: "call-1",
  projectRoot: "/tmp/lab-project",
  permissionMode: "auto",
};

describe("experiment remaining native tools", () => {
  it("maps experiment-log, results-snapshot, provenance-query without writing bridge request.json", async () => {
    const calls: ExperimentLogBridgeRequest[] = [];
    const tools = createExperimentNativeTools({
      executeExperimentAction: (req) => {
        calls.push(req);
        return { ok: true, tool: req.tool, action: req.action };
      },
    });

    expect(tools.map((t) => t.name)).toEqual([
      "experiment-log",
      "results-snapshot",
      "provenance-query",
    ]);

    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    await byName["experiment-log"]!.execute({ action: "list" }, ctx);
    await byName["results-snapshot"]!.execute({ id: "exp-1" }, ctx);
    await byName["provenance-query"]!.execute({ action: "list_recent", limit: 5 }, ctx);

    expect(calls).toEqual([
      {
        tool: "experiment-log",
        action: "list",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
      },
      {
        tool: "results-snapshot",
        action: "snapshot",
        id: "exp-1",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
      },
      {
        tool: "provenance-query",
        action: "list_recent",
        limit: 5,
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
      },
    ]);
  });

  it("registers experiment tools in Pi Lab and Pi native catalog", () => {
    const labNames = createPiLabNativeTools().map((t) => t.name);
    expect(labNames).toContain("experiment-log");
    expect(labNames).toContain("results-snapshot");
    expect(labNames).toContain("provenance-query");

    const piNames = createPiNativeTools({
      toolHost: { execute: async () => ({ ok: true }) },
      getContext: () => ctx,
    }).map((t) => t.name);
    expect(piNames).toContain("experiment-log");
    expect(piNames).toContain("results-snapshot");
    expect(piNames).toContain("provenance-query");
  });
});
