import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInProcessSpike } from "../../src/main/agent/in-process-runtime";
import { evaluateHardDeny, extractToolPathContext } from "../../src/main/agent/permission-gate";
import { AgentSessionStore } from "../../src/main/agent/session-store";
import { createRepresentativeTools } from "../../src/main/agent/representative-tools";
import { toChatStreamEnvelope } from "../../src/main/agent/events";
import type { PermissionGateRequest } from "../../src/main/agent/permission-gate";

const ROOT = "/Users/me/paper";

function hardRequest(partial: Partial<PermissionGateRequest> & Pick<PermissionGateRequest, "toolName">): PermissionGateRequest {
  return {
    requestId: "r1",
    runtimeSessionId: "rt-1",
    tabId: "tab-1",
    turnId: "turn-1",
    toolCallId: "call-1",
    args: {},
    projectRoot: ROOT,
    permissionMode: "edit_auto",
    ...partial,
  };
}

describe("agent runtime invariants", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("denies whole-disk search before any service runs", () => {
    const result = evaluateHardDeny(hardRequest({
      toolName: "experiment-run",
      bashCommand: "mdfind 'kMDItemTextContent == foo'",
      bashCwd: ROOT,
    }));
    expect(result.deny).toBe(true);
    if (result.deny) expect(result.reason).toMatch(/whole-disk search/);
  });

  it("denies a direct TeX engine in the shell", () => {
    const result = evaluateHardDeny(hardRequest({
      toolName: "bash",
      bashCommand: "pdflatex main.tex",
      bashCwd: ROOT,
    }));
    expect(result.deny).toBe(true);
    if (result.deny) expect(result.reason).toMatch(/latex-compile/);
  });

  it("denies mutating a path outside the project root", () => {
    const result = evaluateHardDeny(hardRequest({
      toolName: "write",
      filePath: "/tmp/out.tex",
    }));
    expect(result.deny).toBe(true);
    if (result.deny) expect(result.reason).toMatch(/outside_project/);
  });

  it("maps relative brief updates to the project file", () => {
    expect(extractToolPathContext("research-brief-update", {}, ROOT)).toEqual({
      filePath: ".brief.md",
    });
    expect(evaluateHardDeny(hardRequest({
      toolName: "research-brief-update",
      filePath: ".brief.md",
    })).deny).toBe(false);
  });

  it("cancelling session A does not deny session B", async () => {
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-agent-inv-"));
    dirs.push(storeRoot);
    const deleted: string[] = [];
    const spike = createInProcessSpike({
      store: new AgentSessionStore(storeRoot),
      timeoutMs: 5_000,
      tools: [
        ...createRepresentativeTools({
          searchPapers: () => [],
          discoverLiterature: async () => ({
            query: "",
            sourcesQueried: [],
            sourcesFailed: [],
            hits: [],
          }),
          runExperiment: async () => ({ ok: true }),
        }),
        {
          name: "delete",
          description: "delete a file after permission",
          async execute(args) {
            deleted.push(String(args.path ?? ""));
            return { ok: true };
          },
        },
      ],
    });

    const a = await spike.runtime.createSession({ tabId: "tab-a", projectRoot: ROOT });
    const b = await spike.runtime.createSession({ tabId: "tab-b", projectRoot: ROOT });
    spike.runtime.scriptNextTurn(a.runtimeSessionId, [{
      toolName: "delete",
      args: { path: "old-a.tex" },
      toolCallId: "call-a",
    }]);
    spike.runtime.scriptNextTurn(b.runtimeSessionId, [{
      toolName: "delete",
      args: { path: "old-b.tex" },
      toolCallId: "call-b",
    }]);

    const turnA = spike.runtime.sendTurn({
      runtimeSessionId: a.runtimeSessionId,
      tabId: "tab-a",
      text: "delete a",
      permissionMode: "edit_auto",
    });
    const turnB = spike.runtime.sendTurn({
      runtimeSessionId: b.runtimeSessionId,
      tabId: "tab-b",
      text: "delete b",
      permissionMode: "edit_auto",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    const promptB = spike.events.find((event) => (
      event.type === "permission_requested" && event.tabId === "tab-b"
    ));
    expect(promptB?.type).toBe("permission_requested");

    await spike.runtime.cancelTurn(a.runtimeSessionId);
    if (promptB?.type === "permission_requested") {
      expect(spike.gate.resolve(promptB.requestId, "allow")).toBe(true);
    }
    await Promise.all([turnA, turnB]);

    expect(deleted).toEqual(["old-b.tex"]);
    expect(spike.gate.pendingCount()).toBe(0);
    expect(spike.events.some((event) => (
      event.type === "turn_cancelled" && event.runtimeSessionId === a.runtimeSessionId
    ))).toBe(true);
    expect(spike.events.some((event) => (
      event.type === "turn_finished" && event.runtimeSessionId === b.runtimeSessionId
    ))).toBe(true);
  });

  it("keeps chat:stream envelopes on AgentEvent only", () => {
    const envelope = toChatStreamEnvelope({
      type: "text_delta",
      runtimeSessionId: "rt-1",
      tabId: "tab-1",
      turnId: "turn-1",
      text: "hello",
    });
    expect(envelope).toEqual({
      tabId: "tab-1",
      type: "text_delta",
      data: {
        type: "text_delta",
        runtimeSessionId: "rt-1",
        tabId: "tab-1",
        turnId: "turn-1",
        text: "hello",
      },
    });
    expect(JSON.stringify(envelope)).not.toMatch(/"part"|session\/update|"Task"/);
  });
});
