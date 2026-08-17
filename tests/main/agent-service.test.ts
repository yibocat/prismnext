import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HOST_SYSTEM_IDENTITY,
  PI_DEFAULT_CODING_IDENTITY,
  buildAgentSystemPrompt,
  buildAgentUserText,
  createAgentExperimentRunner,
  createAgentNativeTools,
  createAgentService,
  resolveAgentAuth,
} from "../../src/main/agent/agent-service";
import { RuntimeRegistry } from "../../src/main/agent/runtime-registry";
import { AgentSessionStore } from "../../src/main/agent/session-store";
import type { AgentRuntime } from "../../src/main/agent/runtime";
import type { CreateSessionInput, CreateSessionResult, RuntimeSessionId, TurnInput } from "../../src/shared/agent-runtime";

describe("agent auth and prompt assembly", () => {
  it("rejects OpenCode catalog providers instead of remapping them to Pi", () => {
    const result = resolveAgentAuth({
      settings: {
        aiProvider: "opencode-zen",
        aiModel: "gpt-5.5",
        aiApiKeys: { "opencode-zen": "sk-catalog" },
      },
    });
    expect(result).toEqual({ ok: false, reason: "unsupported_pi_provider:opencode-zen" });
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

  it("maps a missing experiment folder to a structured error and does not kick off", async () => {
    const kickoffs: unknown[] = [];
    const run = createAgentExperimentRunner({
      resolveCtx: () => ({ ok: false, error: "no_experiment_folder", hint: "create one" }),
      isCtxError: (ctx) => "ok" in ctx && ctx.ok === false,
      kickoff: async (args) => {
        kickoffs.push(args);
        return { runId: "r1", executionId: "e1" };
      },
    });
    await expect(run({
      experimentId: "exp-1",
      command: "echo hi",
      toolCallId: "call-1",
      projectRoot: "/tmp/project",
    })).resolves.toEqual({
      ok: false,
      error: "no_experiment_folder",
      hint: "create one",
    });
    expect(kickoffs).toEqual([]);
  });

  it("kicks off an existing island with the tool args", async () => {
    const run = createAgentExperimentRunner({
      resolveCtx: (projectRoot) => ({
        projectRoot,
        registryRoot: `${projectRoot}/.prismnext/experiments`,
        workspaceRel: "experiment",
        workspaceAbs: `${projectRoot}/experiment`,
      }),
      isCtxError: (ctx) => "ok" in ctx && ctx.ok === false,
      kickoff: async (args) => {
        expect(args.id).toBe("exp-1");
        expect(args.command).toBe("python train.py");
        expect(args.artifacts).toEqual(["metrics.json"]);
        expect(args.notes).toBe("from lab");
        expect(args.kind).toBe("train");
        expect(args.chatSessionId).toBe("call-1");
        return { runId: "run-1", executionId: "exec-1" };
      },
    });
    await expect(run({
      experimentId: "exp-1",
      command: "python train.py",
      toolCallId: "call-1",
      projectRoot: "/tmp/project",
      artifacts: ["metrics.json"],
      notes: "from lab",
      kind: "train",
    })).resolves.toEqual({
      ok: true,
      started: true,
      runId: "run-1",
      executionId: "exec-1",
    });
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
      "bash",
      "delete",
      "move",
      "project-rule-write",
      "question",
      "suggest-plan",
    ]));
    expect(missingKey.tools).toHaveLength(29);
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
});
