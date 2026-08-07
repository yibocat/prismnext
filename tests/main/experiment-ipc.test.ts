/**
 * experiment:* IPC — Sprint 0.7 Task 1 tests.
 *
 * Coverage:
 *  - `no_experiment_folder` when no Workspace Experiment folder is configured
 *  - `list` / `read` happy path against a temp project
 *  - `run` returns `{status:"started"}` and emits `experiment:runComplete`
 *    with the appended run entry (executor onComplete path)
 *  - `cancelRun` calls `cancelAiCommandForSession("experiment:<id>:<runId>")`
 *  - `getPaths` / `detectEnv` thin wrappers
 *  - executor refactor: optional resPath + onComplete + deferred microtask
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── electron mock ─────────────────────────────────────────────────────────
type IpcHandler = (event: unknown, args: unknown) => unknown | Promise<unknown>;
const handlers = new Map<string, IpcHandler>();
const sent: Array<{ channel: string; payload: unknown }> = [];

vi.mock("electron", () => ({
  ipcMain: {
    handle(channel: string, fn: IpcHandler) {
      handlers.set(channel, fn);
    },
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  app: {
    getPath: () => "/tmp/prism-experiment-ipc-test-userdata",
  },
}));

vi.mock("electron-store", () => ({
  default: class MockStore {
    private data: Record<string, unknown> = {};
    get(key: string) {
      return this.data[key];
    }
    set(key: string, value: unknown) {
      this.data[key] = value;
    }
    get store() {
      return this.data;
    }
  },
}));

import { registerExperimentHandlers } from "../../src/main/ipc/experiment";
import { kickoffExperimentRun } from "../../src/main/services/experiment-run-executor";
import {
  buildExperimentStorageContext,
  createExperiment,
  type ExperimentStorageContext,
} from "../../src/main/services/experiment-log-service";
import {
  _hasActiveAiPtyForSession,
  _resetAiPtyForTests,
} from "../../src/main/services/ai-pty";

interface FakeEvent {
  sender: { send: (channel: string, payload: unknown) => void };
}

function makeEvent(): FakeEvent {
  return { sender: { send: (channel, payload) => sent.push({ channel, payload }) } };
}

function writeWorkspaceSettings(projectRoot: string, workspaceDirs: unknown[]): void {
  const prismDir = join(projectRoot, ".prismnext");
  mkdirSync(prismDir, { recursive: true });
  writeFileSync(join(prismDir, "settings.json"), JSON.stringify({ workspaceDirs }), "utf-8");
}

describe("experiment:* IPC (Sprint 0.7)", () => {
  let root: string;
  let ctx: ExperimentStorageContext;

  beforeEach(() => {
    handlers.clear();
    sent.length = 0;
    registerExperimentHandlers();
  });

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    _resetAiPtyForTests();
  });

  function setupWithExperimentFolder(): ExperimentStorageContext {
    root = mkdtempSync(join(tmpdir(), "prism-exp-ipc-"));
    const experimentDir = join(root, "experiment");
    mkdirSync(experimentDir, { recursive: true });
    writeWorkspaceSettings(root, [
      { function: "manuscript", name: "manuscript", mainTex: "main.tex" },
      { function: "experiment", name: "experiment" },
    ]);
    ctx = buildExperimentStorageContext(root, "experiment");
    return ctx;
  }

  function setupWithoutExperimentFolder(): void {
    root = mkdtempSync(join(tmpdir(), "prism-exp-ipc-"));
    writeWorkspaceSettings(root, [
      { function: "manuscript", name: "manuscript", mainTex: "main.tex" },
    ]);
  }

  it("returns no_experiment_folder when no Workspace Experiment folder is configured", async () => {
    setupWithoutExperimentFolder();
    const handler = handlers.get("experiment:list");
    expect(handler).toBeDefined();
    const result = (await handler!(makeEvent(), { projectRoot: root })) as Record<string, unknown>;
    expect(result).toMatchObject({ ok: false, error: "no_experiment_folder" });
    expect(typeof result.hint).toBe("string");
  });

  it("list/read happy path returns experiments and meta+runs", async () => {
    const c = setupWithExperimentFolder();
    const created = createExperiment(c, { title: "LR ablation" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const listHandler = handlers.get("experiment:list")!;
    const listResult = (await listHandler(makeEvent(), { projectRoot: root })) as Record<string, unknown>;
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;
    const experiments = listResult.experiments as Array<{ id: string; title: string }>;
    expect(experiments.map((e) => e.id)).toContain(created.id);
    expect(experiments[0]!.title).toBe("LR ablation");
    expect(listResult.experimentRoot).toBe("experiment");
    expect(listResult.registryRoot).toBe(".prismnext/experiments");

    const readHandler = handlers.get("experiment:read")!;
    const readResult = (await readHandler(makeEvent(), { projectRoot: root, id: created.id })) as Record<string, unknown>;
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) return;
    const meta = readResult.meta as { id: string; title: string };
    expect(meta.id).toBe(created.id);
    expect(meta.title).toBe("LR ablation");
    expect(readResult.runs).toEqual([]);
  });

  it("detectEnv returns env snapshot for the workspace island", async () => {
    const c = setupWithExperimentFolder();
    const created = createExperiment(c, { title: "Env" }, { ensureVenv: false });
    if (!created.ok) return;

    const handler = handlers.get("experiment:detectEnv")!;
    const result = (await handler(makeEvent(), { projectRoot: root, id: created.id })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const env = result.env as { platform: string };
    expect(env.platform).toBe(process.platform);
    expect(result.workspacePath).toBe(`experiment/${created.id}`);
  });

  it("getPaths returns absolute + relative paths", async () => {
    const c = setupWithExperimentFolder();
    const created = createExperiment(c, { title: "Paths" }, { ensureVenv: false });
    if (!created.ok) return;

    const handler = handlers.get("experiment:getPaths")!;
    const result = (await handler(makeEvent(), { projectRoot: root, id: created.id })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.registryPath).toBe(`.prismnext/experiments/${created.id}`);
    expect(result.workspaceAbs).toBe(join(root, "experiment", created.id));
    expect(result.workspaceRel).toBe(`experiment/${created.id}`);
    expect(existsSync(result.workspaceAbs as string)).toBe(true);
  });

  it("getPaths returns experiment_not_found for an unknown id", async () => {
    setupWithExperimentFolder();
    const handler = handlers.get("experiment:getPaths")!;
    const result = (await handler(makeEvent(), { projectRoot: root, id: "exp-bogus" })) as Record<string, unknown>;
    expect(result).toMatchObject({ ok: false, error: "experiment_not_found" });
  });

  it("create and update IPC modifies experiment title, tags, and description", async () => {
    setupWithExperimentFolder();
    const createHandler = handlers.get("experiment:create")!;
    const created = (await createHandler(makeEvent(), {
      projectRoot: root,
      title: "Initial Title",
      tags: ["baseline"],
      description: "Initial description",
    })) as Record<string, unknown>;
    expect(created.ok).toBe(true);
    const meta = created.meta as { id: string; title: string; tags?: string[]; description?: string };
    expect(meta.title).toBe("Initial Title");
    expect(meta.tags).toEqual(["baseline"]);
    expect(meta.description).toBe("Initial description");

    const updateHandler = handlers.get("experiment:update")!;
    const updated = (await updateHandler(makeEvent(), {
      projectRoot: root,
      id: created.id as string,
      title: "Updated Title",
      tags: ["resnet", "v2"],
      description: "New notes",
    })) as Record<string, unknown>;
    expect(updated.ok).toBe(true);
    const updatedMeta = updated.meta as { title: string; tags?: string[]; description?: string };
    expect(updatedMeta.title).toBe("Updated Title");
    expect(updatedMeta.tags).toEqual(["resnet", "v2"]);
    expect(updatedMeta.description).toBe("New notes");
  });

  it("run returns {status:'started'} and emits experiment:runComplete with the appended run", async () => {
    const c = setupWithExperimentFolder();
    const created = createExperiment(c, { title: "Run test" }, { ensureVenv: false });
    if (!created.ok) return;

    const handler = handlers.get("experiment:run")!;
    const startResult = (await handler(makeEvent(), {
      projectRoot: root,
      id: created.id,
      command: "echo run-complete-ok",
    })) as Record<string, unknown>;
    expect(startResult.ok).toBe(true);
    if (!startResult.ok) return;
    expect(startResult.status).toBe("started");
    const runId = startResult.runId as string;
    expect(runId).toMatch(/^run-\d{8}-\d{6}-[0-9a-f]{4}$/);

    const event = await new Promise<{ channel: string; payload: unknown }>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        const found = sent.find((s) => s.channel === "experiment:runComplete");
        if (found) return resolve(found);
        if (Date.now() - start > 30_000) return reject(new Error("experiment:runComplete never fired"));
        setTimeout(tick, 25);
      };
      tick();
    });

    const payload = event.payload as {
      id: string;
      runId: string;
      result: { ok: boolean; run?: { runId: string; command: string; exitCode: number; stdoutTail: string } };
    };
    expect(payload.id).toBe(created.id);
    expect(payload.runId).toBe(runId);
    expect(payload.result.ok).toBe(true);
    expect(payload.result.run).toBeDefined();
    expect(payload.result.run!.runId).toBe(runId);
    expect(payload.result.run!.command).toBe("echo run-complete-ok");
    expect(payload.result.run!.exitCode).toBe(0);
    expect(payload.result.run!.stdoutTail).toContain("run-complete-ok");

    const outputEvents = sent.filter((s) => s.channel === "experiment:runOutput");
    expect(outputEvents.length).toBeGreaterThan(0);
    const combined = outputEvents.map((e) => (e.payload as { chunk: string }).chunk).join("");
    expect(combined).toContain("run-complete-ok");

    const runsPath = join(root, ".prismnext", "experiments", created.id, "runs.jsonl");
    const raw = readFileSync(runsPath, "utf-8").trim();
    expect(raw.split("\n").length).toBe(1);
    const persisted = JSON.parse(raw) as { runId: string; command: string; chatSessionId?: string | null };
    expect(persisted.runId).toBe(runId);
    expect(persisted.command).toBe("echo run-complete-ok");
  });

  it("run forwards chatSessionId into the persisted run entry", async () => {
    const c = setupWithExperimentFolder();
    const created = createExperiment(c, { title: "Session bind" }, { ensureVenv: false });
    if (!created.ok) throw new Error("create failed");

    const handler = handlers.get("experiment:run")!;
    const started = (await handler(makeEvent(), {
      projectRoot: root,
      id: created.id,
      command: "echo session-ok",
      chatSessionId: "chat-sess-abc",
    })) as { ok: boolean; runId: string };
    expect(started.ok).toBe(true);

    await new Promise<{ channel: string; payload: unknown }>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        const found = sent.find((s) => s.channel === "experiment:runComplete");
        if (found) return resolve(found);
        if (Date.now() - start > 30_000) return reject(new Error("experiment:runComplete never fired"));
        setTimeout(tick, 25);
      };
      tick();
    });

    const runsPath = join(root, ".prismnext", "experiments", created.id, "runs.jsonl");
    const persisted = JSON.parse(readFileSync(runsPath, "utf-8").trim()) as {
      chatSessionId?: string | null;
    };
    expect(persisted.chatSessionId).toBe("chat-sess-abc");
  });

  it("run reports permission_denied when permission mode is readonly", async () => {
    const c = setupWithExperimentFolder();
    const created = createExperiment(c, { title: "Readonly" }, { ensureVenv: false });
    if (!created.ok) return;

    const settingsModule = await import("../../src/main/services/settings");
    const baseSettings = settingsModule.getSettings() as Record<string, unknown>;
    const spy = vi.spyOn(settingsModule, "getSettings").mockReturnValue({
      ...baseSettings,
      permissionMode: "readonly",
    } as never);

    try {
      const handler = handlers.get("experiment:run")!;
      const result = (await handler(makeEvent(), {
        projectRoot: root,
        id: created.id,
        command: "echo nope",
      })) as Record<string, unknown>;
      expect(result).toMatchObject({ ok: false, error: "permission_denied" });
      expect(typeof result.hint).toBe("string");
    } finally {
      spy.mockRestore();
    }
  });

  it("run rejects missing command with missing_command error", async () => {
    const c = setupWithExperimentFolder();
    const created = createExperiment(c, { title: "Bad cmd" }, { ensureVenv: false });
    if (!created.ok) return;

    const handler = handlers.get("experiment:run")!;
    const result = (await handler(makeEvent(), {
      projectRoot: root,
      id: created.id,
      command: "   ",
    })) as Record<string, unknown>;
    expect(result).toMatchObject({ ok: false, error: "missing_command" });
  });

  it("run rejects unknown id with experiment_not_found", async () => {
    setupWithExperimentFolder();
    const handler = handlers.get("experiment:run")!;
    const result = (await handler(makeEvent(), {
      projectRoot: root,
      id: "exp-nope",
      command: "echo hi",
    })) as Record<string, unknown>;
    expect(result).toMatchObject({ ok: false, error: "experiment_not_found" });
  });

  it("cancelRun dispatches to cancelAiCommandForSession with the experiment sessionId", async () => {
    setupWithExperimentFolder();
    const id = "exp-cancel-ipc";
    const runId = "run-20260708-120000-cafe";
    const sessionId = `experiment:${id}:${runId}`;

    const { runAiCommand } = await import("../../src/main/services/ai-pty");
    void runAiCommand({
      command: "sleep 30",
      cwd: process.cwd(),
      sessionId,
      chatTabId: "experiment",
      requestId: runId,
      onChunk: () => {},
    });

    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (_hasActiveAiPtyForSession(sessionId)) return resolve();
        if (Date.now() - start > 5_000) return reject(new Error("PTY never registered"));
        setTimeout(tick, 10);
      };
      tick();
    });
    expect(_hasActiveAiPtyForSession(sessionId)).toBe(true);

    const handler = handlers.get("experiment:cancelRun")!;
    const result = (handler(makeEvent(), { projectRoot: root, id, runId }) as Record<string, unknown>);
    expect(result).toEqual({ ok: true });
    expect(_hasActiveAiPtyForSession(sessionId)).toBe(false);
  });

  it("snapshot returns figures/tables from the experiment workspace", async () => {
    const c = setupWithExperimentFolder();
    const created = createExperiment(c, { title: "Results scan" }, { ensureVenv: false });
    if (!created.ok) throw new Error("create failed");

    const island = join(root, "experiment", created.id);
    mkdirSync(join(island, "figures"), { recursive: true });
    writeFileSync(join(island, "figures", "loss.png"), "fake-png");
    writeFileSync(join(island, "metrics.json"), JSON.stringify({ acc: 0.9, loss: 0.1 }));
    writeFileSync(join(island, "out.csv"), "a,b\n1,2\n3,4\n");

    const handler = handlers.get("experiment:snapshot")!;
    const result = (await handler(makeEvent(), {
      projectRoot: root,
      id: created.id,
    })) as {
      ok: boolean;
      snapshot?: {
        figures: Array<{ path: string }>;
        tables: Array<{ path: string; rowCount: number }>;
        metrics: Array<{ path: string; values: Record<string, number | string> }>;
      };
      error?: string;
    };

    expect(result.ok).toBe(true);
    expect(result.snapshot?.figures.some((f) => f.path.includes("loss.png"))).toBe(true);
    expect(result.snapshot?.tables.some((t) => t.path.endsWith("out.csv") && t.rowCount === 2)).toBe(
      true,
    );
    expect(result.snapshot?.metrics.some((m) => m.path.endsWith("metrics.json"))).toBe(true);
  });
});

describe("kickoffExperimentRun (executor refactor)", () => {
  let root: string;
  let ctx: ExperimentStorageContext;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    _resetAiPtyForTests();
  });

  it("still writes the .result.json when called with resPath (legacy bridge path)", async () => {
    root = mkdtempSync(join(tmpdir(), "prism-exp-exec-"));
    mkdirSync(join(root, "experiment"), { recursive: true });
    ctx = buildExperimentStorageContext(root, "experiment");
    const created = createExperiment(ctx, { title: "Legacy" }, { ensureVenv: false });
    if (!created.ok) throw new Error("create failed");

    const resPath = join(root, "result.json");
    kickoffExperimentRun({
      ctx,
      id: created.id,
      command: "echo legacy-ok",
      resPath,
      ensureVenv: false,
    });
    const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (existsSync(resPath)) {
          resolve(JSON.parse(readFileSync(resPath, "utf-8")));
          return;
        }
        if (Date.now() - start > 30_000) return reject(new Error("result file never written"));
        setTimeout(tick, 25);
      };
      tick();
    });
    expect(data.ok).toBe(true);
    expect((data.run as { command: string }).command).toBe("echo legacy-ok");
  });

  it("invokes onComplete for the success path", async () => {
    root = mkdtempSync(join(tmpdir(), "prism-exp-exec-"));
    mkdirSync(join(root, "experiment"), { recursive: true });
    ctx = buildExperimentStorageContext(root, "experiment");
    const created = createExperiment(ctx, { title: "Oncomplete" }, { ensureVenv: false });
    if (!created.ok) throw new Error("create failed");

    const result = await new Promise<{ ok: boolean; run?: { runId: string; command: string }; error?: string }>((resolve) => {
      kickoffExperimentRun({
        ctx,
        id: created.id,
        command: "echo callback-ok",
        onComplete: resolve,
        ensureVenv: false,
      });
    });
    expect(result.ok).toBe(true);
    expect(result.run?.command).toBe("echo callback-ok");
  });

  it("defers onComplete to next microtask for the experiment_not_found early-return branch", async () => {
    root = mkdtempSync(join(tmpdir(), "prism-exp-exec-"));
    mkdirSync(join(root, "experiment"), { recursive: true });
    ctx = buildExperimentStorageContext(root, "experiment");

    const kickoffReturnedAt = { value: 0 };
    let microtaskBeforeCallback = -1;

    queueMicrotask(() => {
      kickoffReturnedAt.value = 1;
    });

    kickoffExperimentRun({
      ctx,
      id: "exp-missing",
      command: "echo x",
      onComplete: (result) => {
        microtaskBeforeCallback = kickoffReturnedAt.value;
        expect(result.ok).toBe(false);
        expect(result.error).toBe("experiment_not_found");
      },
    });

    await new Promise<void>((r) => setTimeout(r, 5));
    expect(kickoffReturnedAt.value).toBe(1);
    expect(microtaskBeforeCallback).toBe(1);
  });

  it("runs the external-interpreter lane without touching the project venv", async () => {
    root = mkdtempSync(join(tmpdir(), "prism-exp-exec-"));
    mkdirSync(join(root, "experiment"), { recursive: true });
    ctx = buildExperimentStorageContext(root, "experiment");
    const created = createExperiment(ctx, { title: "External lane" }, { ensureVenv: false });
    if (!created.ok) throw new Error("create failed");

    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      kickoffExperimentRun({
        ctx,
        id: created.id,
        command: "echo external-lane-ok",
        onComplete: resolve,
        interpreter: "external",
        pythonPath: "/bin/echo",
        ensureVenv: false,
      });
    });
    expect(result.ok).toBe(true);

    // Provenance: runs.jsonl records the real external interpreter.
    const runsPath = join(ctx.registryRoot, created.id, "runs.jsonl");
    const lines = readFileSync(runsPath, "utf-8").trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]!) as {
      env?: {
        python?: string | null;
        pythonVersion?: string | null;
        interpreter?: { kind: string; path: string | null; version: string | null } | null;
      };
    };
    // macOS /bin/echo echoes the flag verbatim → first stdout line is "--version".
    expect(last.env?.python).toBe("/bin/echo");
    expect(last.env?.pythonVersion).toBe("--version");
    expect(last.env?.interpreter).toEqual({
      kind: "external",
      path: "/bin/echo",
      version: "--version",
    });

    // The shared project venv must NOT have been created for this lane.
    expect(existsSync(join(root, ".prismnext", ".venv"))).toBe(false);
  });
});
