import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Type } from "@earendil-works/pi-ai";
import { createInProcessSpike } from "../../src/main/agent/in-process-runtime";
import { AgentSessionStore } from "../../src/main/agent/session-store";
import { ensureResearchBrief, updateResearchBriefSection } from "../../src/main/research/research-brief-service";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";
import type { NativeToolDefinition } from "../../src/main/agent/tools/types";
import type { DiscoverLiteratureInput, DiscoverLiteratureResult } from "../../src/shared/literature/discovery";

function discovery(query: string): DiscoverLiteratureResult {
  return {
    query,
    sourcesQueried: ["arxiv"],
    sourcesFailed: [],
    hits: [{
      id: "arxiv:2401.00001",
      title: "A paper about " + query,
      authors: ["Ada"],
      year: 2024,
      arxivId: "2401.00001",
      source: "arxiv",
    }],
  };
}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v : "";
}

/**
 * Injected fake native tools for the spike: proves ToolHost + PermissionGate
 * without touching real literature / experiment services.
 */
function createFakeNativeTools(deps: {
  searchPapers: (input: { projectRoot: string; query: string; limit?: number; tag?: string; collection?: string }) => Array<{
    id: string;
    bibkey?: string;
    title: string;
    authors?: string | null;
    year?: number | null;
    doi?: string | null;
  }> | Promise<Array<{ id: string; bibkey?: string; title: string; authors?: string | null; year?: number | null; doi?: string | null }>>;
  discoverLiterature: (input: DiscoverLiteratureInput) => Promise<DiscoverLiteratureResult>;
  runExperiment: (input: { experimentId: string; command: string; toolCallId: string; projectRoot: string; abortSignal?: AbortSignal }) => Promise<unknown>;
}): NativeToolDefinition[] {
  return [
    {
      name: TOOL_NAMES.literatureSearch,
      label: "Search Literature",
      description: "Search papers in the project literature library (local only).",
      parameters: Type.Object({
        query: Type.Optional(Type.String()),
        limit: Type.Optional(Type.Number()),
        tag: Type.Optional(Type.String()),
        collection: Type.Optional(Type.String()),
      }),
      permission: { category: "read_only" },
      async execute(args, ctx) {
        const query = str(args, "query");
        const limit = typeof args.limit === "number" ? args.limit : 20;
        const hits = await deps.searchPapers({
          projectRoot: ctx.projectRoot,
          query,
          limit,
          tag: str(args, "tag") || undefined,
          collection: str(args, "collection") || undefined,
        });
        return { query, count: hits.length, papers: hits };
      },
    },
    {
      name: TOOL_NAMES.literatureDiscover,
      label: "Discover Literature",
      description: "Search external academic catalogs by topic.",
      parameters: Type.Object({
        query: Type.String({ minLength: 1 }),
        sources: Type.Optional(Type.Array(Type.String())),
        limit: Type.Optional(Type.Number()),
        year: Type.Optional(Type.String()),
        author: Type.Optional(Type.String()),
      }),
      permission: { category: "read_only" },
      async execute(args) {
        const query = str(args, "query");
        if (!query.trim()) return { ok: false, error: "missing_query" };
        return deps.discoverLiterature({ query });
      },
    },
    {
      name: TOOL_NAMES.researchBriefUpdate,
      label: "Update Research Brief",
      description: "Update one section of the project research brief.",
      parameters: Type.Object({
        section: Type.String({ minLength: 1 }),
        content: Type.String({ minLength: 1 }),
        append: Type.Optional(Type.Boolean()),
      }),
      permission: { category: "safe_write", extractPath: () => ".brief.md" },
      async execute(args, ctx) {
        const section = str(args, "section");
        const content = str(args, "content");
        if (!section.trim() || !content.trim()) return { ok: false, error: "missing_section_or_content" };
        return updateResearchBriefSection(ctx.projectRoot, section, content, {
          append: args.append === true,
        });
      },
    },
    {
      name: TOOL_NAMES.experimentRun,
      label: "Run Experiment",
      description: "Run a shell command in an experiment island after PermissionGate.",
      parameters: Type.Object({
        id: Type.String({ minLength: 1 }),
        command: Type.String({ minLength: 1 }),
        artifacts: Type.Optional(Type.Array(Type.String())),
      }),
      permission: {
        category: "shell_exec",
        extractBash: (args, projectRoot) => ({ command: str(args, "command"), cwd: projectRoot }),
      },
      async execute(args, ctx) {
        const experimentId = str(args, "id");
        const command = str(args, "command");
        if (!experimentId.trim() || !command.trim()) return { ok: false, error: "missing_id_or_command" };
        return deps.runExperiment({
          experimentId,
          command,
          toolCallId: ctx.toolCallId,
          projectRoot: ctx.projectRoot,
          abortSignal: ctx.abortSignal,
        });
      },
    },
  ];
}

describe("agent vertical slice", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  function setup(projectRoot: string, runExperiment?: (input: { toolCallId: string; command: string }) => Promise<unknown>) {
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-agent-store-"));
    dirs.push(storeRoot);
    const runs: Array<{ toolCallId: string; command: string }> = [];
    const spike = createInProcessSpike({
      store: new AgentSessionStore(storeRoot),
      timeoutMs: 40,
      tools: createFakeNativeTools({
        searchPapers: ({ query }) => [
          { id: "p1", bibkey: "Ada24", title: `Local ${query}`, year: 2024, doi: "10.1/ada" },
        ],
        discoverLiterature: async ({ query }) => discovery(query),
        runExperiment: async (input) => {
          runs.push({ toolCallId: input.toolCallId, command: input.command });
          return runExperiment?.(input) ?? { ok: true, started: true };
        },
      }),
    });
    return { spike, runs, storeRoot };
  }

  it("returns structured literature-search and literature-discover results", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-agent-proj-"));
    dirs.push(project);
    const { spike } = setup(project);
    const session = await spike.runtime.createSession({ tabId: "tab-1", projectRoot: project });
    spike.runtime.scriptNextTurn(session.runtimeSessionId, [
      { toolName: "literature-search", args: { query: "graphs" }, toolCallId: "search-1" },
      { toolName: "literature-discover", args: { query: "causal graphs" }, toolCallId: "disc-1" },
    ]);
    await spike.runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-1",
      text: "find papers",
      permissionMode: "edit_auto",
    });

    const search = spike.events.find((event) => (
      event.type === "tool_finished" && event.toolCallId === "search-1"
    ));
    const discover = spike.events.find((event) => (
      event.type === "tool_finished" && event.toolCallId === "disc-1"
    ));
    expect(search?.type).toBe("tool_finished");
    expect(discover?.type).toBe("tool_finished");
    if (search?.type === "tool_finished") {
      expect(search.ok).toBe(true);
      expect(search.result).toMatchObject({
        query: "graphs",
        count: 1,
        papers: [{ id: "p1", bibkey: "Ada24" }],
      });
    }
    if (discover?.type === "tool_finished") {
      expect(discover.ok).toBe(true);
      expect(discover.result).toMatchObject({
        query: "causal graphs",
        hits: [{ id: "arxiv:2401.00001", source: "arxiv" }],
      });
    }
  });

  it("asks before writing the brief in ask mode and honors a deny", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-agent-brief-ask-"));
    dirs.push(project);
    ensureResearchBrief(project);
    const before = readFileSync(join(project, ".brief.md"), "utf-8");
    const { spike } = setup(project);
    const session = await spike.runtime.createSession({ tabId: "tab-1", projectRoot: project });
    spike.runtime.scriptNextTurn(session.runtimeSessionId, [{
      toolName: "research-brief-update",
      args: { section: "Research question", content: "Should wait for ask" },
      toolCallId: "brief-ask",
    }]);
    const pending = spike.runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-1",
      text: "update brief",
      permissionMode: "ask",
    });
    const requested = await new Promise<Extract<(typeof spike.events)[number], { type: "permission_requested" }>>((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const event = spike.events.find((item) => item.type === "permission_requested");
        if (event?.type === "permission_requested") {
          clearInterval(timer);
          resolve(event);
          return;
        }
        if (Date.now() - started > 200) {
          clearInterval(timer);
          reject(new Error("permission_requested not emitted"));
        }
      }, 5);
    });
    expect(spike.gate.resolve(requested.requestId, "deny")).toBe(true);
    await pending;
    expect(readFileSync(join(project, ".brief.md"), "utf-8")).toBe(before);
  });

  it("leaves the brief unchanged when an update is denied", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-agent-brief-"));
    dirs.push(project);
    ensureResearchBrief(project);
    const before = readFileSync(join(project, ".brief.md"), "utf-8");
    const { spike } = setup(project);
    const session = await spike.runtime.createSession({ tabId: "tab-1", projectRoot: project });
    spike.runtime.scriptNextTurn(session.runtimeSessionId, [{
      toolName: "research-brief-update",
      args: { section: "Research question", content: "Should not persist" },
      toolCallId: "brief-deny",
    }]);
    await spike.runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-1",
      text: "update brief",
      permissionMode: "readonly",
    });
    expect(readFileSync(join(project, ".brief.md"), "utf-8")).toBe(before);
    const finished = spike.events.find((event) => (
      event.type === "tool_finished" && event.toolCallId === "brief-deny"
    ));
    expect(finished?.type === "tool_finished" && finished.denied).toBe(true);
  });

  it("writes the brief once after approval and reuses the same toolCallId", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-agent-brief-ok-"));
    dirs.push(project);
    ensureResearchBrief(project);
    const { spike } = setup(project);
    const session = await spike.runtime.createSession({ tabId: "tab-1", projectRoot: project });
    const call = {
      toolName: "research-brief-update",
      args: { section: "Research question", content: "What is the effect of X?" },
      toolCallId: "brief-once",
    };
    spike.runtime.scriptNextTurn(session.runtimeSessionId, [call]);
    await spike.runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-1",
      text: "update brief",
      permissionMode: "edit_auto",
    });
    expect(readFileSync(join(project, ".brief.md"), "utf-8")).toContain("What is the effect of X?");

    const second = await spike.toolHost.execute(call.toolName, call.args, {
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-1",
      turnId: "turn-dup",
      toolCallId: "brief-once",
      projectRoot: project,
      permissionMode: "edit_auto",
    });
    expect(second.reused).toBe(true);
    const mentions = readFileSync(join(project, ".brief.md"), "utf-8")
      .split("What is the effect of X?").length - 1;
    expect(mentions).toBe(1);
  });

  it("does not start a process when experiment-run is denied", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-agent-exp-"));
    dirs.push(project);
    const { spike, runs } = setup(project);
    const session = await spike.runtime.createSession({ tabId: "tab-1", projectRoot: project });
    spike.runtime.scriptNextTurn(session.runtimeSessionId, [{
      toolName: "experiment-run",
      args: { id: "exp-1", command: "echo hi" },
      toolCallId: "exp-deny",
    }]);
    await spike.runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-1",
      text: "run",
      permissionMode: "readonly",
    });
    expect(runs).toEqual([]);
  });

  it("starts experiment-run only once for one toolCallId", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-agent-exp-ok-"));
    dirs.push(project);
    const { spike, runs } = setup(project);
    const session = await spike.runtime.createSession({ tabId: "tab-1", projectRoot: project });
    const ctx = {
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-1",
      turnId: "turn-1",
      toolCallId: "exp-once",
      projectRoot: project,
      permissionMode: "auto" as const,
    };
    const first = await spike.toolHost.execute("experiment-run", {
      id: "exp-1",
      command: "echo hi",
    }, ctx);
    const second = await spike.toolHost.execute("experiment-run", {
      id: "exp-1",
      command: "echo hi",
    }, ctx);
    expect(first.ok).toBe(true);
    expect(second.reused).toBe(true);
    expect(runs).toEqual([{ toolCallId: "exp-once", command: "echo hi" }]);
  });

  it("fail-closes readonly, outside paths, TeX shell, and whole-disk search", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-agent-fail-"));
    dirs.push(project);
    const { spike, runs } = setup(project);
    const session = await spike.runtime.createSession({ tabId: "tab-1", projectRoot: project });
    const base = {
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-1",
      turnId: "turn-1",
      projectRoot: project,
    };

    const readonlyRun = await spike.toolHost.execute("experiment-run", {
      id: "exp-1",
      command: "echo hi",
    }, { ...base, toolCallId: "ro", permissionMode: "readonly" });
    expect(readonlyRun.denied).toBe(true);

    let wrote = false;
    spike.toolHost.register({
      name: "write",
      description: "test write",
      async execute() {
        wrote = true;
        return { ok: true };
      },
    });
    const outside = await spike.toolHost.execute("write", {
      path: "/tmp/out.tex",
    }, { ...base, toolCallId: "out", permissionMode: "auto" });
    expect(outside.denied).toBe(true);
    expect(wrote).toBe(false);

    const tex = await spike.toolHost.execute("experiment-run", {
      id: "exp-1",
      command: "pdflatex main.tex",
    }, { ...base, toolCallId: "tex", permissionMode: "auto" });
    expect(tex.denied).toBe(true);

    const disk = await spike.toolHost.execute("experiment-run", {
      id: "exp-1",
      command: "mdfind secret",
    }, { ...base, toolCallId: "disk", permissionMode: "auto" });
    expect(disk.denied).toBe(true);

    const escaped = await spike.toolHost.execute("experiment-run", {
      id: "exp-1",
      command: "cat /etc/passwd",
    }, { ...base, toolCallId: "esc", permissionMode: "auto" });
    expect(escaped.denied).toBe(true);

    expect(runs).toEqual([]);
  });

  it("treats a permission timeout as deny and leaves no waiters", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-agent-timeout-"));
    dirs.push(project);
    const { spike } = setup(project);
    let deleted = false;
    spike.toolHost.register({
      name: "delete",
      description: "delete after permission",
      async execute() {
        deleted = true;
        return { ok: true };
      },
    });
    const session = await spike.runtime.createSession({ tabId: "tab-1", projectRoot: project });
    const result = await spike.toolHost.execute("delete", {
      path: "old.tex",
    }, {
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-1",
      turnId: "turn-1",
      toolCallId: "del-timeout",
      projectRoot: project,
      permissionMode: "edit_auto",
    });
    expect(result.denied).toBe(true);
    expect(result.error).toBe("permission_timeout");
    expect(deleted).toBe(false);
    expect(spike.gate.pendingCount()).toBe(0);
  });

  it("isolates two tabs and does not cross-stream events", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-agent-tabs-"));
    dirs.push(project);
    const { spike } = setup(project);
    const a = await spike.runtime.createSession({ tabId: "tab-a", projectRoot: project });
    const b = await spike.runtime.createSession({ tabId: "tab-b", projectRoot: project });
    spike.runtime.scriptNextTurn(a.runtimeSessionId, [{
      toolName: "literature-search",
      args: { query: "alpha" },
      toolCallId: "a-search",
    }]);
    spike.runtime.scriptNextTurn(b.runtimeSessionId, [{
      toolName: "literature-search",
      args: { query: "beta" },
      toolCallId: "b-search",
    }]);
    await Promise.all([
      spike.runtime.sendTurn({
        runtimeSessionId: a.runtimeSessionId,
        tabId: "tab-a",
        text: "a",
        permissionMode: "edit_auto",
      }),
      spike.runtime.sendTurn({
        runtimeSessionId: b.runtimeSessionId,
        tabId: "tab-b",
        text: "b",
        permissionMode: "edit_auto",
      }),
    ]);

    const aEvents = spike.events.filter((event) => event.runtimeSessionId === a.runtimeSessionId);
    const bEvents = spike.events.filter((event) => event.runtimeSessionId === b.runtimeSessionId);
    expect(aEvents.every((event) => event.tabId === "tab-a")).toBe(true);
    expect(bEvents.every((event) => event.tabId === "tab-b")).toBe(true);
    expect(aEvents.some((event) => event.type === "tool_finished" && event.toolCallId === "a-search")).toBe(true);
    expect(aEvents.some((event) => event.type === "tool_finished" && event.toolCallId === "b-search")).toBe(false);
    expect(bEvents.some((event) => event.type === "tool_finished" && event.toolCallId === "b-search")).toBe(true);
  });
});
