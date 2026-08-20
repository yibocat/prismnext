import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HOST_SYSTEM_IDENTITY,
  PI_DEFAULT_CODING_IDENTITY,
  buildAgentSystemPrompt,
  buildAgentUserText,
  createAgentNativeTools,
  createAgentService,
  resolveAgentAuth,
} from "../../src/main/agent/agent-service";
import { RuntimeRegistry } from "../../src/main/agent/runtime-registry";
import { AgentSessionStore } from "../../src/main/agent/session-store";
import type { AgentRuntime } from "../../src/main/agent/runtime";
import type { CreateSessionInput, CreateSessionResult, RuntimeSessionId, TurnInput } from "../../src/shared/agent-runtime";

describe("agent auth and prompt assembly", () => {
  it("accepts opencode / opencode-go as first-class Pi providers", () => {
    const result = resolveAgentAuth({
      settings: {
        aiProvider: "opencode",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { opencode: "sk-catalog" },
      },
    });
    expect(result).toEqual({
      ok: true,
      provider: "opencode",
      modelId: "claude-sonnet-4-5",
      apiKey: "sk-catalog",
    });
  });

  it("reads the decrypted settings key when the send payload omits apiKey", () => {
    const result = resolveAgentAuth({
      settings: {
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: " sk-from-settings " },
      },
    });
    expect(result).toEqual({
      ok: true,
      provider: "anthropic",
      modelId: "claude-sonnet-4-5",
      apiKey: "sk-from-settings",
    });
  });

  it("fails closed when the selected provider has no API key", () => {
    const result = resolveAgentAuth({
      provider: "openai",
      modelId: "gpt-5",
      settings: { aiApiKeys: { anthropic: "sk-other" } },
    });
    expect(result).toEqual({ ok: false, reason: "missing_pi_api_key" });
  });

  it("accepts DeepSeek BYOK and only blocks OpenCode catalog providers", () => {
    expect(resolveAgentAuth({
      settings: {
        aiProvider: "deepseek",
        aiModel: "deepseek-v4-flash",
        aiApiKeys: { deepseek: "sk-deepseek" },
      },
    })).toEqual({
      ok: true,
      provider: "deepseek",
      modelId: "deepseek-v4-flash",
      apiKey: "sk-deepseek",
    });
  });

  it("injects the composed PrismNext prompt and keeps project rules on the user turn", () => {
    expect(buildAgentSystemPrompt({
      stableSystem: "Stable system from PromptManager.",
      agentsMd: "# Project agents",
    })).toContain("Stable system from PromptManager.");
    expect(buildAgentSystemPrompt({
      stableSystem: "Stable system from PromptManager.",
      agentsMd: "# Project agents",
    })).toContain("# Project agents");

    expect(buildAgentUserText({
      text: "Search local papers about transformers.",
      projectRules: "Always cite bibkeys.",
    })).toBe("Always cite bibkeys.\n\nSearch local papers about transformers.");
  });

  it("never hands Pi an empty prompt that would restore the coding-agent template", () => {
    const empty = buildAgentSystemPrompt({ stableSystem: "  ", agentsMd: "" });
    expect(empty.trim().length).toBeGreaterThan(0);
    expect(empty).toContain(HOST_SYSTEM_IDENTITY);
    expect(empty).not.toContain(PI_DEFAULT_CODING_IDENTITY);
    // Pi's buildSystemPrompt uses `if (customPrompt)` — empty string falls
    // through to "You are an expert coding assistant operating inside pi".
    expect(Boolean(empty)).toBe(true);
  });
});

describe("pi lab native tools", () => {
  it("runs experiment-run through the injected executor instead of a lab stub", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const tools = createAgentNativeTools({
      runExperiment: async (input) => {
        calls.push(input);
        return { ok: true, started: true };
      },
    });
    const experiment = tools.find((tool) => tool.name === "experiment-run");
    expect(experiment).toBeTruthy();
    const result = await experiment!.execute({
      id: "exp-1",
      command: "echo hi",
      artifacts: ["plot.png"],
      notes: "lab run",
    }, {
      runtimeSessionId: "rt-1",
      tabId: "pi-lab",
      turnId: "turn-1",
      toolCallId: "call-1",
      projectRoot: "/tmp/project",
      permissionMode: "auto",
    });
    expect(result).toEqual({ ok: true, started: true });
    expect(calls).toEqual([{
      experimentId: "exp-1",
      command: "echo hi",
      toolCallId: "call-1",
      projectRoot: "/tmp/project",
      abortSignal: undefined,
      artifacts: ["plot.png"],
      notes: "lab run",
      kind: undefined,
      interpreter: undefined,
      pythonPath: undefined,
    }]);
  });
});

describe("agent service status", () => {
  it("is not ready without a project or API key and never claims OpenCode chat", async () => {
    const lab = createAgentService({
      userDataDir: "/tmp/prism-pi-lab-test",
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: {},
      }),
      composeStableSystem: async () => "stable",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    const missingKey = lab.status("/tmp/project");
    expect(missingKey.ready).toBe(false);
    expect(missingKey.reason).toBe("missing_pi_api_key");
    expect(missingKey.tools).toEqual(expect.arrayContaining([
      "literature-search",
      "literature-discover",
      "literature-read",
      "literature-stage",
      "latex-root",
      "latex-compile",
      "latex-compile-standalone",
      "research-brief-read",
      "research-brief-update",
      "experiment-log",
      "experiment-run",
      "results-snapshot",
      "provenance-query",
      "interaction-list",
      "interaction-read",
      "interaction-write",
      "interaction-open",
      "image-describe",
      "read",
      "bash",
      "write",
      "delete",
      "move",
      "project-rule-write",
      "question",
      "suggest-plan",
    ]));
    expect(missingKey.tools).toHaveLength(36);
    expect(missingKey.permissionMode).toBe("edit_auto");

    const missingProject = createAgentService({
      userDataDir: "/tmp/prism-pi-lab-test",
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      }),
      composeStableSystem: async () => "stable",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    }).status();
    expect(missingProject.ready).toBe(false);
    expect(missingProject.reason).toBe("missing_project");

    const send = await lab.send({ projectRoot: "", text: "hello" });
    expect(send).toEqual({ ok: false, error: "missing_project" });
  });

  it("reflects team binding in status and system prompt", async () => {
    const lab = createAgentService({
      userDataDir: "/tmp/prism-pi-lab-test",
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      }),
      composeStableSystem: async () => "stable prompt",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
      resolveTeamBinding: (input) => {
        if (input.sessionTeamId === "disabled-team") {
          return { ok: false, error: "team_disabled:disabled-team" };
        }
        return {
          ok: true,
          lead: {
            teamId: "academic-lead-team",
            fqid: "academic-lead-team:orchestrator",
            runtimeName: "academic-lead",
            name: "Academic Lead",
            description: "Lead researcher",
            instructions: "Focus on formal academic tone.",
            modelRef: { provider: "anthropic", modelId: "claude-3-7-sonnet" },
          },
          roster: [
            {
              fqid: "academic-lead-team:auditor",
              name: "Citation Auditor",
              runtimeName: "auditor",
              description: "Audit citations",
              instructions: "Check all bibtex entries",
              originTeamId: "academic-lead-team",
              via: "all",
              available: true,
              isDelegatable: true,
              allowedTools: ["literature-search"],
            },
          ],
          availableRoster: [
            {
              fqid: "academic-lead-team:auditor",
              name: "Citation Auditor",
              runtimeName: "auditor",
              description: "Audit citations",
              instructions: "Check all bibtex entries",
              originTeamId: "academic-lead-team",
              via: "all",
              available: true,
              isDelegatable: true,
              allowedTools: ["literature-search"],
            },
          ],
        };
      },
    });

    const status = lab.status("/tmp/project");
    expect(status.ready).toBe(true);
    expect(status.teamId).toBe("academic-lead-team");
    expect(status.leadName).toBe("Academic Lead");
    expect(status.leadFqid).toBe("academic-lead-team:orchestrator");
    expect(status.roster).toHaveLength(1);
    expect(status.roster?.[0].fqid).toBe("academic-lead-team:auditor");

    const disabledStatus = lab.status("/tmp/project", "disabled-team");
    expect(disabledStatus.ready).toBe(false);
    expect(disabledStatus.reason).toBe("team_disabled:disabled-team");

    expect(buildAgentSystemPrompt({
      stableSystem: "stable prompt",
      leadInstructions: "Focus on formal academic tone.",
      leadName: "Academic Lead",
    })).toContain("Active Team Lead: Academic Lead");
    expect(buildAgentSystemPrompt({
      stableSystem: "stable prompt",
      leadInstructions: "Focus on formal academic tone.",
      leadName: "Academic Lead",
    })).toContain("Focus on formal academic tone.");
    expect(buildAgentSystemPrompt({
      stableSystem: "stable prompt",
      taskRoster: "## Available subagents (via Task)\n\n- `literature-synthesizer`",
    })).toContain("`literature-synthesizer`");
  });
});

function fakeRuntime(): AgentRuntime {
  return {
    async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
      return { runtimeSessionId: "rt-live", tabId: input.tabId };
    },
    async sendTurn(_input: TurnInput): Promise<void> {},
    async cancelTurn(_id: RuntimeSessionId): Promise<void> {},
    async disposeSession(_id: RuntimeSessionId): Promise<void> {},
    subscribe() {
      return () => {};
    },
  };
}

describe("agent session history", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("lists and loads persisted Pi conversations without OpenCode", () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-agent-hist-"));
    const project = mkdtempSync(join(tmpdir(), "prism-agent-proj-"));
    dirs.push(userData, project);
    const store = new AgentSessionStore(join(userData, "pi-agent"));
    store.createSession({
      conversationId: "conv-1",
      runtimeSessionId: "rt-1",
      projectRoot: project,
      title: "Search papers",
    });
    store.appendTurn("rt-1", {
      turnIndex: 0,
      turnId: "turn-1",
      createdAt: Date.now(),
      user: { text: "hello" },
      assistant: { text: "hi", toolCalls: [] },
      status: "completed",
    });

    const agent = createAgentService({
      userDataDir: userData,
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      }),
      composeStableSystem: async () => "stable",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    const listed = agent.listSessions(project);
    expect(listed).toEqual([
      expect.objectContaining({
        conversationId: "conv-1",
        title: "Search papers",
      }),
    ]);

    const loaded = agent.loadSession({ conversationId: "conv-1", projectRoot: project });
    expect(loaded.ok).toBe(true);
    expect(loaded.conversationId).toBe("conv-1");
    expect(loaded.conversation?.turns[0]?.user.blocks[0]).toMatchObject({ type: "text", text: "hello" });
    expect(agent.renameSession({ conversationId: "conv-1", title: "Renamed" })).toEqual({ ok: true });
    expect(agent.listSessions(project)[0]?.title).toBe("Renamed");
  });

  it("resumes a stored conversation instead of creating a second runtime", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-agent-resume-"));
    const project = mkdtempSync(join(tmpdir(), "prism-agent-proj-"));
    dirs.push(userData, project);
    const store = new AgentSessionStore(join(userData, "pi-agent"));
    store.createSession({
      conversationId: "conv-resume",
      runtimeSessionId: "rt-old",
      projectRoot: project,
      title: "Continue me",
      piSessionFile: "/tmp/old-pi.jsonl",
    });

    const started: Array<{ conversationId: string; piSessionFile?: string }> = [];
    const registry = new RuntimeRegistry({
      userDataDir: userData,
      store,
      startRuntime: async (input) => {
        started.push({
          conversationId: input.conversationId,
          piSessionFile: input.piSessionFile,
        });
        return {
          runtime: fakeRuntime(),
          runtimeSessionId: "rt-old",
          piSessionFile: input.piSessionFile,
        };
      },
    });

    const agent = createAgentService({
      userDataDir: userData,
      registry,
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      }),
      composeStableSystem: async () => "stable",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    const result = await agent.send({
      conversationId: "conv-resume",
      tabId: "conv-resume",
      turnId: "turn-2",
      projectRoot: project,
      text: "continue",
    });

    expect(result).toEqual({ ok: true });
    expect(started).toEqual([
      { conversationId: "conv-resume", piSessionFile: "/tmp/old-pi.jsonl" },
    ]);
  });

  it("compacts only a live Pi session and fails closed when none is running", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-agent-compact-"));
    const project = mkdtempSync(join(tmpdir(), "prism-agent-proj-"));
    dirs.push(userData, project);
    const compacted: string[] = [];
    const registry = new RuntimeRegistry({
      userDataDir: userData,
      startRuntime: async (input) => ({
        runtime: {
          ...fakeRuntime(),
          async compact(runtimeSessionId) {
            compacted.push(runtimeSessionId);
            return { ok: true, summary: "old turns summarized", tokensBefore: 12000 };
          },
        },
        runtimeSessionId: "rt-compact",
      }),
    });
    const agent = createAgentService({
      userDataDir: userData,
      registry,
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      }),
      composeStableSystem: async () => "stable",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    expect(await agent.compact({ conversationId: "conv-missing" })).toEqual({
      ok: false,
      error: "session_not_live",
    });

    const sent = await agent.send({
      conversationId: "conv-compact",
      tabId: "conv-compact",
      turnId: "turn-1",
      projectRoot: project,
      text: "hello",
    });
    expect(sent.ok).toBe(true);
    registry.store.appendTurn("rt-compact", {
      turnIndex: 0,
      turnId: "turn-0",
      createdAt: Date.now(),
      user: { text: "hello" },
      assistant: { text: "hi", toolCalls: [] },
      status: "completed",
    });
    registry.store.appendTurn("rt-compact", {
      turnIndex: 1,
      turnId: "turn-1",
      createdAt: Date.now() + 1,
      user: { text: "again" },
      assistant: { text: "ok", toolCalls: [] },
      status: "completed",
    });
    expect(await agent.compact({ conversationId: "conv-compact" })).toEqual({
      ok: true,
      summary: "old turns summarized",
      tokensBefore: 12000,
      throughTurnIndex: 2,
    });
    expect(compacted).toEqual(["rt-compact"]);
    expect(registry.store.getSession("rt-compact")?.compacted).toMatchObject({
      throughTurnIndex: 2,
      summary: "old turns summarized",
    });
  });

  it("persists subagent process blocks on the parent session when the child turn ends", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-agent-subruns-"));
    const project = mkdtempSync(join(tmpdir(), "prism-agent-proj-"));
    dirs.push(userData, project);
    const registry = new RuntimeRegistry({
      userDataDir: userData,
      startRuntime: async () => ({
        runtime: fakeRuntime(),
        runtimeSessionId: "rt-sub",
      }),
    });
    const agent = createAgentService({
      userDataDir: userData,
      registry,
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      }),
      composeStableSystem: async () => "stable",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    const sent = await agent.send({
      conversationId: "conv-sub",
      tabId: "conv-sub",
      turnId: "turn-1",
      projectRoot: project,
      text: "delegate",
    });
    expect(sent.ok).toBe(true);

    agent.attachOwner({
      isDestroyed: () => false,
      send() {},
    } as never);

    const subagent = {
      parentToolCallId: "task-1",
      expertFqid: "literature-synthesizer",
      expertName: "literature-synthesizer",
    };
    agent.dispatchEvent({
      type: "thinking_delta",
      runtimeSessionId: "rt-sub",
      tabId: "conv-sub",
      turnId: "child-1",
      text: "先读摘要",
      subagent,
    });
    expect(registry.store.getSession("rt-sub")?.subagentRuns).toBeUndefined();

    agent.dispatchEvent({
      type: "text_delta",
      runtimeSessionId: "rt-sub",
      tabId: "conv-sub",
      turnId: "child-1",
      text: "三个方向仍开放",
      subagent,
    });
    agent.dispatchEvent({
      type: "turn_finished",
      runtimeSessionId: "rt-sub",
      tabId: "conv-sub",
      turnId: "child-1",
      subagent,
    });

    expect(registry.store.getSession("rt-sub")?.subagentRuns?.["task-1"]).toMatchObject({
      expertName: "literature-synthesizer",
      status: "done",
      blocks: [
        { type: "thinking", thinking: "先读摘要" },
        { type: "text", text: "三个方向仍开放" },
      ],
    });
  });

  it("truncates stored turns through the conversation id and can undo", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-agent-trunc-"));
    const project = mkdtempSync(join(tmpdir(), "prism-agent-proj-"));
    dirs.push(userData, project);
    const store = new AgentSessionStore(join(userData, "pi-agent"));
    store.createSession({
      conversationId: "conv-cut",
      runtimeSessionId: "rt-cut",
      projectRoot: project,
      title: "Cut me",
    });
    for (let i = 0; i < 3; i += 1) {
      store.appendTurn("rt-cut", {
        turnIndex: i,
        turnId: `turn-${i}`,
        createdAt: Date.now() + i,
        user: { text: `u${i}` },
        assistant: { text: `a${i}`, toolCalls: [] },
        status: "completed",
      });
    }
    const agent = createAgentService({
      userDataDir: userData,
      registry: new RuntimeRegistry({
        userDataDir: userData,
        store,
        startRuntime: async () => ({ runtime: fakeRuntime(), runtimeSessionId: "rt-cut" }),
      }),
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      }),
      composeStableSystem: async () => "stable",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    expect(await agent.truncateToTurn({ conversationId: "conv-cut", turnIndex: 0 })).toEqual({
      ok: true,
      keptCount: 1,
    });
    expect(agent.loadSession({ conversationId: "conv-cut", projectRoot: project }).conversation?.turns).toHaveLength(1);
    expect(await agent.undoTruncate({ conversationId: "conv-cut" })).toEqual({
      ok: true,
      restoredCount: 3,
    });
    expect(agent.loadSession({ conversationId: "conv-cut", projectRoot: project }).conversation?.turns).toHaveLength(3);
  });

  it("stores plan artifacts and turn meta on the Pi session record", () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-agent-plan-"));
    const project = mkdtempSync(join(tmpdir(), "prism-agent-proj-"));
    dirs.push(userData, project);
    const store = new AgentSessionStore(join(userData, "pi-agent"));
    store.createSession({
      conversationId: "conv-plan",
      runtimeSessionId: "rt-plan",
      projectRoot: project,
      title: "Plan",
    });
    store.appendTurn("rt-plan", {
      turnIndex: 0,
      turnId: "turn-0",
      createdAt: Date.now(),
      user: { text: "plan" },
      assistant: { text: "ok", toolCalls: [] },
      status: "completed",
    });
    const agent = createAgentService({
      userDataDir: userData,
      registry: new RuntimeRegistry({
        userDataDir: userData,
        store,
        startRuntime: async () => ({ runtime: fakeRuntime(), runtimeSessionId: "rt-plan" }),
      }),
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      }),
      composeStableSystem: async () => "stable",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    expect(agent.upsertPlanArtifact({
      conversationId: "conv-plan",
      event: { kind: "plan-artifact", path: "plans/a.md", title: "A", afterIndex: 2 },
    })).toEqual({ ok: true });
    expect(agent.getPlanEvents("conv-plan")).toEqual([
      { kind: "plan-artifact", path: "plans/a.md", title: "A", afterIndex: 2 },
    ]);
    expect(agent.upsertTurnMeta({
      conversationId: "conv-plan",
      turnIndex: 0,
      meta: { modelLabel: "Sonnet", completedAt: 1 },
    })).toEqual({ ok: true });
    expect(agent.loadSession({ conversationId: "conv-plan", projectRoot: project }).conversation?.turns[0]?.meta).toEqual({
      modelLabel: "Sonnet",
      completedAt: 1,
    });
    expect(agent.reassignDirectory({
      fromDirectory: project,
      toDirectory: `${project}/wt`,
    }).count).toBe(1);
  });

  it("drops a disposed renderer instead of throwing on agent:event", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-agent-owner-"));
    dirs.push(userData);
    const agent = createAgentService({
      userDataDir: userData,
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      }),
      composeStableSystem: async () => "stable",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });
    let sends = 0;
    agent.attachOwner({
      isDestroyed: () => false,
      send() {
        sends += 1;
        throw new Error("Render frame was disposed before WebFrameMain could be accessed");
      },
    } as never);
    expect(() => {
      agent.dispatchEvent({
        type: "text_delta",
        runtimeSessionId: "rt-x",
        tabId: "tab-x",
        turnId: "turn-x",
        text: "hi",
      });
    }).not.toThrow();
    expect(sends).toBe(1);
    agent.dispatchEvent({
      type: "text_delta",
      runtimeSessionId: "rt-x",
      tabId: "tab-x",
      turnId: "turn-x",
      text: "again",
    });
    expect(sends).toBe(1);
  });

  it("releases the send lock on cancel so the next turn is not turn_in_progress", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-agent-lock-"));
    const project = mkdtempSync(join(tmpdir(), "prism-agent-lock-proj-"));
    dirs.push(userData, project);

    let releaseHung!: () => void;
    const hung = new Promise<void>((resolve) => {
      releaseHung = resolve;
    });
    let sendTurns = 0;
    const registry = new RuntimeRegistry({
      userDataDir: userData,
      startRuntime: async () => ({
        runtime: {
          ...fakeRuntime(),
          async sendTurn() {
            sendTurns += 1;
            if (sendTurns === 1) await hung;
          },
        },
        runtimeSessionId: "rt-lock",
      }),
    });
    const agent = createAgentService({
      userDataDir: userData,
      registry,
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      }),
      composeStableSystem: async () => "stable",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    const first = agent.send({
      conversationId: "conv-lock",
      tabId: "conv-lock",
      turnId: "turn-a",
      projectRoot: project,
      text: "first",
    });
    await expect.poll(() => sendTurns).toBe(1);
    expect(await agent.send({
      conversationId: "conv-lock",
      tabId: "conv-lock",
      turnId: "turn-b",
      projectRoot: project,
      text: "second",
    })).toEqual({ ok: false, error: "turn_in_progress" });

    await agent.cancel("conv-lock");
    expect(await agent.send({
      conversationId: "conv-lock",
      tabId: "conv-lock",
      turnId: "turn-c",
      projectRoot: project,
      text: "after cancel",
    })).toEqual({ ok: true });

    releaseHung();
    await expect(first).resolves.toEqual({ ok: true });
  });
});
