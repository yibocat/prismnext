import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AgentSessionStore,
  SESSION_SCHEMA_VERSION,
  type AgentSessionRecord,
  type AgentTurnRecord,
  type CreateSessionRecordInput,
} from "../../src/main/agent/session-store";

describe("AgentSessionStore Core & Atomic Operations", () => {
  let tempDir: string;
  let store: AgentSessionStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "prism-session-store-test-"));
    store = new AgentSessionStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates, retrieves, and updates session metadata", () => {
    const input: CreateSessionRecordInput = {
      runtimeSessionId: "ses-1",
      tabId: "tab-1",
      title: "Test Session",
      projectRoot: "/path/to/project",
      boundCheckoutPath: "/path/to/project",
      backend: "pi-sdk",
      permissionMode: "edit_auto",
      sessionAgent: "build",
    };

    const session = store.createSession(input);
    expect(session.version).toBe(SESSION_SCHEMA_VERSION);
    expect(session.runtimeSessionId).toBe("ses-1");
    expect(session.conversationId).toBe("ses-1");
    expect(session.turns).toEqual([]);
    expect(session.eventJournal).toEqual([]);
    expect(session.createdAt).toBeTruthy();

    const retrieved = store.getSession("ses-1");
    expect(retrieved).toEqual(session);
  });

  it("appends full turns with tool calls, thinking, and token usage atomically", () => {
    store.createSession({
      runtimeSessionId: "ses-turns",
      tabId: "tab-1",
      title: "Multi-turn Session",
      projectRoot: "/path/to/project",
      boundCheckoutPath: "/path/to/project",
      backend: "pi-sdk",
      permissionMode: "auto",
      sessionAgent: "build",
    });

    const turn1: AgentTurnRecord = {
      turnIndex: 0,
      turnId: "turn-0",
      createdAt: Date.now(),
      finishedAt: Date.now() + 1000,
      user: {
        text: "Search literature for causal graphs",
      },
      assistant: {
        thinking: "Let me search local papers first...",
        text: "Found 2 papers on causal graphs.",
        toolCalls: [
          {
            toolCallId: "call-1",
            toolName: "literature-search",
            args: { query: "causal graphs" },
            result: { count: 2 },
            startedAt: Date.now(),
            finishedAt: Date.now() + 200,
          },
        ],
      },
      usage: {
        inputTokens: 120,
        outputTokens: 45,
      },
      status: "completed",
    };

    const updated = store.appendTurn("ses-turns", turn1);
    expect(updated?.turns).toHaveLength(1);
    expect(updated?.turns[0]).toEqual(turn1);

    const reloaded = store.getSession("ses-turns");
    expect(reloaded?.turns).toHaveLength(1);
    expect(reloaded?.turns[0]?.assistant.toolCalls[0]?.toolName).toBe("literature-search");
  });

  it("handles corrupted JSON files with self-healing backup without crashing", () => {
    const sesFile = join(store.sessionsDir(), "ses-corrupt.json");
    store.createSession({
      runtimeSessionId: "ses-corrupt",
      tabId: "tab-1",
      title: "Corrupt Test",
      projectRoot: "/path/to/project",
      boundCheckoutPath: "/path/to/project",
      backend: "pi-sdk",
      permissionMode: "auto",
      sessionAgent: "build",
    });

    // Manually break the file content
    writeFileSync(sesFile, "{ invalid json content ...", "utf-8");

    const result = store.getSession("ses-corrupt");
    expect(result).toBeNull();

    // Check that it backed up the corrupted file
    const files = readdirSync(store.sessionsDir());
    const hasCorruptedBackup = files.some((f) => f.includes("ses-corrupt.json.corrupted."));
    expect(hasCorruptedBackup).toBe(true);
  });
});

describe("AgentSessionStore Worktree Isolation & Queries", () => {
  let tempDir: string;
  let store: AgentSessionStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "prism-session-wt-test-"));
    store = new AgentSessionStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("filters sessions strictly by boundCheckoutPath (Git Worktree)", () => {
    store.createSession({
      runtimeSessionId: "ses-main-1",
      tabId: "tab-1",
      title: "Main Branch Chat",
      projectRoot: "/repo/main",
      boundCheckoutPath: "/repo/main",
      backend: "pi-sdk",
      permissionMode: "auto",
      sessionAgent: "build",
    });

    store.createSession({
      runtimeSessionId: "ses-wt-1",
      tabId: "tab-2",
      title: "Worktree Feature Chat",
      projectRoot: "/repo/main",
      boundCheckoutPath: "/repo/worktrees/feature-x",
      backend: "pi-sdk",
      permissionMode: "auto",
      sessionAgent: "build",
    });

    const mainSessions = store.listSessionsByCheckout("/repo/main");
    expect(mainSessions).toHaveLength(1);
    expect(mainSessions[0]?.runtimeSessionId).toBe("ses-main-1");

    const wtSessions = store.listSessionsByCheckout("/repo/worktrees/feature-x");
    expect(wtSessions).toHaveLength(1);
    expect(wtSessions[0]?.runtimeSessionId).toBe("ses-wt-1");

    const otherSessions = store.listSessionsByCheckout("/repo/worktrees/other");
    expect(otherSessions).toHaveLength(0);
  });

  it("archives / clears sessions for a closed worktree", () => {
    store.createSession({
      runtimeSessionId: "ses-wt-clean",
      tabId: "tab-wt",
      title: "To be closed",
      projectRoot: "/repo/main",
      boundCheckoutPath: "/repo/worktrees/closed-wt",
      backend: "pi-sdk",
      permissionMode: "auto",
      sessionAgent: "build",
    });

    const cleared = store.clearSessionsForWorktree("/repo/worktrees/closed-wt");
    expect(cleared).toBe(1);

    const after = store.listSessionsByCheckout("/repo/worktrees/closed-wt");
    expect(after).toHaveLength(0);
  });

  it("lists all project sessions across worktrees and rebinds checkout paths", () => {
    store.createSession({
      runtimeSessionId: "ses-proj-main",
      tabId: "tab-1",
      title: "Main Session",
      projectRoot: "/repo/main",
      boundCheckoutPath: "/repo/main",
    });
    store.createSession({
      runtimeSessionId: "ses-proj-wt",
      tabId: "tab-2",
      title: "WT Session",
      projectRoot: "/repo/main",
      boundCheckoutPath: "/repo/worktrees/feat-1",
    });
    store.createSession({
      runtimeSessionId: "ses-other-proj",
      tabId: "tab-3",
      title: "Other Proj",
      projectRoot: "/other/repo",
      boundCheckoutPath: "/other/repo",
    });

    const projectSessions = store.listSessionsByProject("/repo/main");
    expect(projectSessions).toHaveLength(2);
    expect(projectSessions.map((s) => s.runtimeSessionId).sort()).toEqual([
      "ses-proj-main",
      "ses-proj-wt",
    ]);

    // Rebind feature branch to main after merge/close
    const reboundCount = store.rebindCheckout("/repo/worktrees/feat-1", "/repo/main");
    expect(reboundCount).toBe(1);

    const mainCheckoutSessions = store.listSessionsByCheckout("/repo/main");
    expect(mainCheckoutSessions).toHaveLength(2);
    expect(store.getSession("ses-proj-wt")?.boundCheckoutPath).toBe("/repo/main");
  });
});

describe("AgentSessionStore Checkpoint Rollback & Regret Synchronization", () => {
  let tempDir: string;
  let store: AgentSessionStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "prism-session-rollback-test-"));
    store = new AgentSessionStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("atomically truncates turns to targetTurnIndex and backs up to regret", () => {
    store.createSession({
      runtimeSessionId: "ses-rollback",
      tabId: "tab-1",
      title: "Rollback Test",
      projectRoot: "/repo/main",
      boundCheckoutPath: "/repo/main",
      backend: "pi-sdk",
      permissionMode: "auto",
      sessionAgent: "build",
    });

    for (let i = 0; i < 5; i++) {
      store.appendTurn("ses-rollback", {
        turnIndex: i,
        turnId: `turn-${i}`,
        createdAt: Date.now() + i * 1000,
        user: { text: `User message ${i}` },
        assistant: { text: `Assistant reply ${i}`, toolCalls: [] },
        status: "completed",
      });
    }

    const sessionBefore = store.getSession("ses-rollback");
    expect(sessionBefore?.turns).toHaveLength(5);

    // Rollback to Turn 2 (keeping turns 0 and 1)
    const rollbackResult = store.rollbackSession("ses-rollback", 2);
    expect(rollbackResult.ok).toBe(true);
    expect(rollbackResult.keptCount).toBe(2);
    expect(rollbackResult.prunedTurns).toHaveLength(3);
    expect(rollbackResult.prunedTurns[0]?.turnIndex).toBe(2);

    const sessionAfter = store.getSession("ses-rollback");
    expect(sessionAfter?.turns).toHaveLength(2);
    expect(sessionAfter?.turns[0]?.turnIndex).toBe(0);
    expect(sessionAfter?.turns[1]?.turnIndex).toBe(1);

    // Regret: Restore pruned turns
    const restoreResult = store.restoreRegret("ses-rollback");
    expect(restoreResult.ok).toBe(true);
    expect(restoreResult.restoredCount).toBe(5);

    const sessionRestored = store.getSession("ses-rollback");
    expect(sessionRestored?.turns).toHaveLength(5);
  });
});

describe("AgentSessionStore v2 conversation identity", () => {
  let tempDir: string;
  let store: AgentSessionStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "prism-session-v2-"));
    store = new AgentSessionStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("stores conversationId and piSessionFile without using tabId as identity", () => {
    const session = store.createSession({
      conversationId: "conv-paper",
      runtimeSessionId: "rt-live",
      tabId: "tab-temp",
      title: "Paper",
      projectRoot: "/repo",
      piSessionFile: "/userData/pi-agent/runtime-sessions/conv-paper.jsonl",
    });
    expect(session.version).toBe(2);
    expect(session.conversationId).toBe("conv-paper");
    expect(store.getByConversationId("conv-paper")?.runtimeSessionId).toBe("rt-live");
    expect(store.getByConversationId("tab-temp")).toBeNull();
  });

  it("migrates a v1 record on read without treating tabId as conversationId", () => {
    const v1 = {
      version: 1,
      runtimeSessionId: "rt-old",
      tabId: "pi-lab",
      title: "Legacy Lab",
      projectRoot: "/repo",
      boundCheckoutPath: "/repo",
      backend: "pi-sdk",
      permissionMode: "edit_auto",
      sessionAgent: "build",
      turns: [],
      createdAt: "2026-08-16T00:00:00Z",
      updatedAt: "2026-08-16T00:00:00Z",
    };
    mkdirSync(store.sessionsDir(), { recursive: true });
    writeFileSync(join(store.sessionsDir(), "rt-old.json"), JSON.stringify(v1), "utf-8");

    const migrated = store.getSession("rt-old");
    expect(migrated?.version).toBe(2);
    expect(migrated?.conversationId).toBe("rt-old");
    expect(migrated?.conversationId).not.toBe("pi-lab");
    expect(migrated?.eventJournal).toEqual([]);
    expect(store.getByConversationId("rt-old")?.title).toBe("Legacy Lab");
  });

  it("reopening the same conversation replaces the old runtime file", () => {
    store.createSession({
      conversationId: "conv-dup",
      runtimeSessionId: "rt-old",
      title: "Keep me",
      projectRoot: "/repo",
    });
    store.appendTurn("rt-old", {
      turnIndex: 0,
      turnId: "turn-0",
      createdAt: Date.now(),
      user: { text: "hello" },
      assistant: { text: "hi", toolCalls: [] },
      status: "completed",
    });

    const reopened = store.createSession({
      conversationId: "conv-dup",
      runtimeSessionId: "rt-new",
      title: "New Chat",
      projectRoot: "/repo",
    });

    expect(reopened.runtimeSessionId).toBe("rt-new");
    expect(reopened.turns).toHaveLength(1);
    expect(reopened.turns[0]?.user.text).toBe("hello");
    expect(store.getSession("rt-old")).toBeNull();
    expect(store.getSession("rt-new")?.turns).toHaveLength(1);
    expect(store.listSessionsByProject("/repo")).toHaveLength(1);
    expect(store.listSessionsByProject("/repo")[0]?.conversationId).toBe("conv-dup");
  });

  it("lists a conversation once when leftover duplicate files exist", () => {
    store.createSession({
      conversationId: "conv-stale",
      runtimeSessionId: "rt-keep",
      title: "Current",
      projectRoot: "/repo",
    });
    mkdirSync(store.sessionsDir(), { recursive: true });
    const stale: AgentSessionRecord = {
      version: SESSION_SCHEMA_VERSION,
      conversationId: "conv-stale",
      runtimeSessionId: "rt-stale",
      title: "Stale copy",
      projectRoot: "/repo",
      boundCheckoutPath: "/repo",
      backend: "pi-sdk",
      permissionMode: "edit_auto",
      sessionAgent: "build",
      turns: [],
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
    };
    writeFileSync(join(store.sessionsDir(), "rt-stale.json"), JSON.stringify(stale), "utf-8");

    const listed = store.listSessionsByProject("/repo");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.runtimeSessionId).toBe("rt-keep");
    expect(store.getSession("rt-stale")).toBeNull();
  });

  it("deletes a session file by runtimeSessionId", () => {
    store.createSession({
      conversationId: "conv-del",
      runtimeSessionId: "rt-del",
      title: "Delete me",
      projectRoot: "/repo",
    });
    expect(store.getByConversationId("conv-del")).toBeTruthy();
    store.deleteSession("rt-del");
    expect(store.getByConversationId("conv-del")).toBeNull();
    expect(store.getSession("rt-del")).toBeNull();
  });
});
