import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Type } from "@earendil-works/pi-ai";
import { ToolHost } from "../../src/main/agent/tool-host";
import { PermissionGate } from "../../src/main/agent/permission-gate";
import type { NativeToolDefinition } from "../../src/main/agent/tools/types";
import type { ResolvedPiRosterEntry } from "../../src/main/agent/team-binding";
import type { AgentEvent } from "../../src/shared/agent/runtime";
import {
  createTaskDelegationTool,
  PiSubsessionRuntime,
  type SubagentSessionRunnerFactory,
} from "../../src/main/agent/pi-subsession-runtime";

describe("PiSubsessionRuntime & Dynamic Task Tool (Phase 5B)", () => {
  let tempDir: string;
  let gate: PermissionGate;
  let parentToolHost: ToolHost;
  const emittedEvents: AgentEvent[] = [];

  const toolA: NativeToolDefinition = {
    name: "tool-a",
    label: "Tool A",
    description: "Tool A desc",
    parameters: Type.Object({ query: Type.String() }),
    permission: { category: "read_only" },
    execute: async (args) => ({ echoA: args.query }),
  };

  const toolB: NativeToolDefinition = {
    name: "tool-b",
    label: "Tool B",
    description: "Tool B desc",
    parameters: Type.Object({ action: Type.String() }),
    permission: { category: "read_only" },
    execute: async (args) => ({ echoB: args.action }),
  };

  const sampleExpert: ResolvedPiRosterEntry = {
    fqid: "academic-team:citation-auditor",
    name: "Citation Auditor",
    runtimeName: "citation-auditor",
    description: "Audits citations in LaTeX",
    instructions: "You are a citation auditor. Always verify references.",
    originTeamId: "academic-team",
    via: "all",
    available: true,
    isDelegatable: true,
    allowedTools: ["tool-a"], // Note: tool-b is NOT allowed!
  };

  const unavailableExpert: ResolvedPiRosterEntry = {
    fqid: "academic-team:disabled-expert",
    name: "Disabled Expert",
    runtimeName: "disabled-expert",
    description: "Disabled",
    instructions: "none",
    originTeamId: "academic-team",
    via: "explicit",
    available: false,
    isDelegatable: false,
    unavailableReason: "asset-disabled-app",
    allowedTools: [],
  };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-subsession-test-"));
    emittedEvents.length = 0;
    gate = new PermissionGate();
    parentToolHost = new ToolHost({
      gate,
      onEvent: (ev) => emittedEvents.push(ev),
    });
    parentToolHost.register(toolA);
    parentToolHost.register(toolB);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("executes subagent with scoped tools and tags nested events with parentToolCallId", async () => {
    let childSessionPrompt: string | null = null;
    let childSystemPrompt: string | null = null;

    const fakeRunnerFactory: SubagentSessionRunnerFactory = async (input) => {
      childSystemPrompt = input.systemPrompt;
      return {
        prompt: async (userPrompt: string) => {
          childSessionPrompt = userPrompt;

          // Emit thinking delta from child session
          input.emitEvent({
            type: "thinking_delta",
            runtimeSessionId: input.runtimeSessionId,
            tabId: input.tabId,
            turnId: input.turnId,
            text: "Checking bibliography...",
          });

          // Subagent executes allowed tool: tool-a
          const execA = await input.scopedToolHost.execute("tool-a", { query: "Einstein 1905" }, {
            runtimeSessionId: input.runtimeSessionId,
            tabId: input.tabId,
            turnId: input.turnId,
            toolCallId: "child-call-1",
            projectRoot: input.projectRoot,
            permissionMode: "auto",
          });
          expect(execA.ok).toBe(true);

          // Subagent attempts to execute forbidden tool: tool-b
          const execB = await input.scopedToolHost.execute("tool-b", { action: "forbidden" }, {
            runtimeSessionId: input.runtimeSessionId,
            tabId: input.tabId,
            turnId: input.turnId,
            toolCallId: "child-call-2",
            projectRoot: input.projectRoot,
            permissionMode: "auto",
          });
          expect(execB.ok).toBe(false);
          expect(execB.error).toContain("unknown_tool:tool-b");

          // Emit text response
          input.emitEvent({
            type: "text_delta",
            runtimeSessionId: input.runtimeSessionId,
            tabId: input.tabId,
            turnId: input.turnId,
            text: "Audit complete: Einstein 1905 verified.",
          });
        },
        abort: async () => {},
        dispose: () => {},
      };
    };

    const subsessionRuntime = new PiSubsessionRuntime({
      allTools: [toolA, toolB],
      gate,
      createRunner: fakeRunnerFactory,
      onEvent: (ev) => emittedEvents.push(ev),
    });

    const result = await subsessionRuntime.runSubagentTask({
      parentSessionId: "parent-ses-1",
      parentTabId: "tab-main",
      parentTurnId: "turn-0",
      parentToolCallId: "task-call-1",
      projectRoot: tempDir,
      boundCheckoutPath: tempDir,
      permissionMode: "auto",
      expert: sampleExpert,
      prompt: "Verify Einstein 1905",
      context: "Paper section 3",
    });

    expect(result.ok).toBe(true);
    expect(result.text).toBe("Audit complete: Einstein 1905 verified.");
    expect(childSystemPrompt).toBe("You are a citation auditor. Always verify references.");
    expect(childSessionPrompt).toContain("Verify Einstein 1905");
    expect(childSessionPrompt).toContain("Paper section 3");

    // Verify event tagging with SubagentEventContext
    expect(emittedEvents.length).toBeGreaterThan(0);
    const thinkingEv = emittedEvents.find((e) => e.type === "thinking_delta");
    expect(thinkingEv).toBeDefined();
    expect(thinkingEv?.subagent).toEqual({
      parentToolCallId: "task-call-1",
      expertFqid: "academic-team:citation-auditor",
      expertName: "Citation Auditor",
    });

    const toolStartedEv = emittedEvents.find((e) => e.type === "tool_started" && e.toolName === "tool-a");
    expect(toolStartedEv).toBeDefined();
    expect(toolStartedEv?.subagent).toEqual({
      parentToolCallId: "task-call-1",
      expertFqid: "academic-team:citation-auditor",
      expertName: "Citation Auditor",
    });

    // Zero disk pollution
    expect(existsSync(join(tempDir, ".agents"))).toBe(false);
    expect(existsSync(join(tempDir, ".pi"))).toBe(false);
  });

  it("injects team skills and profile module prompts into the child session", async () => {
    let childSystemPrompt: string | null = null;
    let childSkills: Array<{ dir: string; source: string }> | null = null;

    const fakeRunnerFactory: SubagentSessionRunnerFactory = async (input) => {
      childSystemPrompt = input.systemPrompt;
      childSkills = input.skills ?? null;
      return {
        prompt: async () => {
          input.emitEvent({
            type: "text_delta",
            runtimeSessionId: input.runtimeSessionId,
            tabId: input.tabId,
            turnId: input.turnId,
            text: "done",
          });
        },
        abort: async () => {},
        dispose: () => {},
      };
    };

    const subsessionRuntime = new PiSubsessionRuntime({
      allTools: [toolA],
      gate,
      createRunner: fakeRunnerFactory,
      skills: [{ dir: join(tempDir, "skills", "cite-check"), source: "academic-team:cite-check" }],
      profileModules: "## Expert Profile\nVerify every citation before accepting it.",
      onEvent: (ev) => emittedEvents.push(ev),
    });

    const result = await subsessionRuntime.runSubagentTask({
      parentSessionId: "parent-ses-2",
      parentTabId: "tab-main",
      parentTurnId: "turn-1",
      parentToolCallId: "task-call-2",
      projectRoot: tempDir,
      boundCheckoutPath: tempDir,
      permissionMode: "auto",
      expert: sampleExpert,
      prompt: "Audit refs",
    });

    expect(result.ok).toBe(true);
    expect(childSystemPrompt).toContain("You are a citation auditor. Always verify references.");
    expect(childSystemPrompt).toContain("## Expert Profile");
    expect(childSystemPrompt).toContain("Verify every citation before accepting it.");
    expect(childSkills).toEqual([
      { dir: join(tempDir, "skills", "cite-check"), source: "academic-team:cite-check" },
    ]);
  });

  it("task tool resolves expert by FQID, runtimeName, or name, and handles unavailable experts", async () => {
    const subsessionRuntime = new PiSubsessionRuntime({
      allTools: [toolA, toolB],
      gate,
      createRunner: async (input) => ({
        prompt: async (userPrompt: string) => {
          input.emitEvent({
            type: "text_delta",
            runtimeSessionId: input.runtimeSessionId,
            tabId: input.tabId,
            turnId: input.turnId,
            text: "Expert reply for: " + userPrompt,
          });
        },
        abort: async () => {},
        dispose: () => {},
      }),
      onEvent: (ev) => emittedEvents.push(ev),
    });

    const taskTool = createTaskDelegationTool({
      subsessionRuntime,
      roster: [sampleExpert, unavailableExpert],
    });

    // 1. Success by runtimeName
    const successResult = await taskTool.execute(
      { expertId: "citation-auditor", prompt: "Check ref" },
      {
        runtimeSessionId: "ses-1",
        tabId: "tab-1",
        turnId: "t-1",
        toolCallId: "call-task-1",
        projectRoot: tempDir,
        permissionMode: "auto",
      },
    );
    expect(successResult).toEqual({
      ok: true,
      result: "Expert reply for: Check ref",
    });

    // 2. Failure on unknown expert
    const unknownResult = await taskTool.execute(
      { expertId: "nonexistent", prompt: "Hello" },
      {
        runtimeSessionId: "ses-1",
        tabId: "tab-1",
        turnId: "t-1",
        toolCallId: "call-task-2",
        projectRoot: tempDir,
        permissionMode: "auto",
      },
    );
    expect(taskTool.description).toContain("citation-auditor");
    expect(taskTool.description).toContain("do not search");
    expect(unknownResult).toEqual({
      ok: false,
      error: "unknown_expert:nonexistent. Available: citation-auditor",
    });

    // 3. Failure on unavailable expert
    const unavailResult = await taskTool.execute(
      { expertId: "disabled-expert", prompt: "Hello" },
      {
        runtimeSessionId: "ses-1",
        tabId: "tab-1",
        turnId: "t-1",
        toolCallId: "call-task-3",
        projectRoot: tempDir,
        permissionMode: "auto",
      },
    );
    expect(unavailResult).toEqual({
      ok: false,
      error: "expert_unavailable:asset-disabled-app",
    });
  });

  it("cascading abort: cancelling parent session aborts active subagent child sessions", async () => {
    let childAborted = false;
    const subsessionRuntime = new PiSubsessionRuntime({
      allTools: [toolA],
      gate,
      createRunner: async () => ({
        prompt: async () => {
          // Keep prompt promise unresolved to simulate long work
          await new Promise((resolve) => setTimeout(resolve, 5000));
        },
        abort: async () => {
          childAborted = true;
        },
        dispose: () => {},
      }),
    });

    const taskPromise = subsessionRuntime.runSubagentTask({
      parentSessionId: "parent-abort-ses",
      parentTabId: "tab-1",
      parentTurnId: "turn-1",
      parentToolCallId: "task-call-abort",
      projectRoot: tempDir,
      boundCheckoutPath: tempDir,
      permissionMode: "auto",
      expert: sampleExpert,
      prompt: "Long task",
    });

    // Let microtask cycle start the runner
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(subsessionRuntime.activeSubsessionCount()).toBe(1);

    // Cancel all for parent session
    const cancelledCount = subsessionRuntime.cancelAllForParentSession("parent-abort-ses");
    expect(cancelledCount).toBe(1);
    expect(childAborted).toBe(true);

    const result = await taskPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cancelled|aborted/i);
    expect(subsessionRuntime.activeSubsessionCount()).toBe(0);
  });

  it("cancels a child by the parent task toolCallId", async () => {
    let childAborted = false;
    const subsessionRuntime = new PiSubsessionRuntime({
      allTools: [toolA],
      gate,
      createRunner: async () => ({
        prompt: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        },
        abort: async () => {
          childAborted = true;
        },
        dispose: () => {},
      }),
    });

    const taskPromise = subsessionRuntime.runSubagentTask({
      parentSessionId: "parent-abort-one",
      parentTabId: "tab-1",
      parentTurnId: "turn-1",
      parentToolCallId: "task-call-one",
      projectRoot: tempDir,
      boundCheckoutPath: tempDir,
      permissionMode: "auto",
      expert: sampleExpert,
      prompt: "Long task",
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(subsessionRuntime.cancelByParentToolCallId("task-call-one")).toBe(true);
    expect(childAborted).toBe(true);
    const result = await taskPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cancelled|aborted/i);
  });

  it("reports a child timeout as subagent_timeout, not cancelled", async () => {
    vi.useFakeTimers();
    try {
      const subsessionRuntime = new PiSubsessionRuntime({
        allTools: [toolA],
        gate,
        createRunner: async () => ({
          prompt: () => new Promise(() => {}),
          abort: async () => {},
          dispose: () => {},
        }),
      });

      const taskPromise = subsessionRuntime.runSubagentTask({
        parentSessionId: "parent-timeout",
        parentTabId: "tab-1",
        parentTurnId: "turn-1",
        parentToolCallId: "task-call-timeout",
        projectRoot: tempDir,
        boundCheckoutPath: tempDir,
        permissionMode: "auto",
        expert: sampleExpert,
        prompt: "Think forever",
        timeoutMs: 1_000,
      });

      await vi.advanceTimersByTimeAsync(1_050);
      const result = await taskPromise;
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/^subagent_timeout:/);
      expect(result.error).not.toBe("cancelled");
    } finally {
      vi.useRealTimers();
    }
  });

  it("prewarms the child session once and reuses it when Task executes", async () => {
    let createCount = 0;
    let promptCount = 0;
    const subsessionRuntime = new PiSubsessionRuntime({
      allTools: [toolA],
      gate,
      roster: [sampleExpert],
      projectRoot: tempDir,
      boundCheckoutPath: tempDir,
      createRunner: async (input) => {
        createCount += 1;
        return {
          prompt: async () => {
            promptCount += 1;
            input.emitEvent({
              type: "text_delta",
              runtimeSessionId: input.runtimeSessionId,
              tabId: input.tabId,
              turnId: input.turnId,
              text: "prewarmed",
            });
          },
          abort: async () => {},
          dispose: () => {},
        };
      },
      onEvent: (ev) => emittedEvents.push(ev),
    });

    subsessionRuntime.prewarmFromParentTool({
      parentSessionId: "parent-pre",
      parentTabId: "tab-1",
      parentTurnId: "turn-1",
      parentToolCallId: "task-pre-1",
      expertId: "citation-auditor",
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(createCount).toBe(1);

    const result = await subsessionRuntime.runSubagentTask({
      parentSessionId: "parent-pre",
      parentTabId: "tab-1",
      parentTurnId: "turn-1",
      parentToolCallId: "task-pre-1",
      projectRoot: tempDir,
      boundCheckoutPath: tempDir,
      permissionMode: "auto",
      expert: sampleExpert,
      prompt: "Go",
    });

    expect(result.ok).toBe(true);
    expect(result.text).toBe("prewarmed");
    expect(createCount).toBe(1);
    expect(promptCount).toBe(1);
  });

  it("stop during prepare cancels a prewarmed child and blocks later execute", async () => {
    let aborted = false;
    const subsessionRuntime = new PiSubsessionRuntime({
      allTools: [toolA],
      gate,
      roster: [sampleExpert],
      projectRoot: tempDir,
      boundCheckoutPath: tempDir,
      createRunner: async () => ({
        prompt: async () => {},
        abort: async () => {
          aborted = true;
        },
        dispose: () => {},
      }),
    });

    subsessionRuntime.prewarmFromParentTool({
      parentSessionId: "parent-pre-cancel",
      parentTabId: "tab-1",
      parentTurnId: "turn-1",
      parentToolCallId: "task-pre-cancel",
      expertId: "citation-auditor",
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(subsessionRuntime.cancelByParentToolCallId("task-pre-cancel")).toBe(true);
    await Promise.resolve();
    expect(aborted).toBe(true);

    const result = await subsessionRuntime.runSubagentTask({
      parentSessionId: "parent-pre-cancel",
      parentTabId: "tab-1",
      parentTurnId: "turn-1",
      parentToolCallId: "task-pre-cancel",
      projectRoot: tempDir,
      boundCheckoutPath: tempDir,
      permissionMode: "auto",
      expert: sampleExpert,
      prompt: "Go",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("cancelled");
  });

  it("delegated expert inherits the parent checkout, not the paper root", async () => {
    const paper = tempDir;
    const checkout = join(tempDir, "wt-checkout");
    const seen: string[] = [];
    const subsessionRuntime = new PiSubsessionRuntime({
      allTools: [toolA],
      gate,
      projectRoot: paper,
      boundCheckoutPath: checkout,
      createRunner: async (input) => {
        seen.push(input.boundCheckoutPath);
        return {
          prompt: async () => {},
          abort: async () => {},
          dispose: () => {},
        };
      },
    });
    const taskTool = createTaskDelegationTool({
      subsessionRuntime,
      roster: [sampleExpert],
    });
    await taskTool.execute(
      { expertId: "citation-auditor", prompt: "Check" },
      {
        runtimeSessionId: "ses-1",
        tabId: "tab-1",
        turnId: "t-1",
        toolCallId: "call-checkout",
        projectRoot: paper,
        permissionMode: "auto",
      },
    );
    expect(seen).toEqual([checkout]);
  });

  it("emits tool_finished as failed when Task execute returns ok: false", async () => {
    const subsessionRuntime = new PiSubsessionRuntime({
      allTools: [toolA],
      gate,
    });
    const taskTool = createTaskDelegationTool({
      subsessionRuntime,
      roster: [sampleExpert],
    });
    parentToolHost.register(taskTool);

    const result = await parentToolHost.execute(
      "task",
      { expertId: "general", prompt: "check notes" },
      {
        runtimeSessionId: "ses-1",
        tabId: "tab-1",
        turnId: "t-1",
        toolCallId: "call-general",
        projectRoot: tempDir,
        permissionMode: "auto",
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown_expert:general/);
    const finished = emittedEvents.find((event) => (
      event.type === "tool_finished" && event.toolCallId === "call-general"
    ));
    expect(finished).toMatchObject({
      type: "tool_finished",
      toolName: "task",
      ok: false,
      error: expect.stringMatching(/unknown_expert:general/),
    });
  });
});
