import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { info, warn, debug, error } = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));

const spawn = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp",
    getAppPath: () => "/tmp",
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock("../../src/main/app/logger", () => ({
  createLogger: () => ({ info, warn, debug, error }),
  shortLogDetail: (value: unknown, max = 160) => {
    const text = value instanceof Error ? value.message : String(value ?? "");
    const line = text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? "";
    return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
  },
}));

vi.mock("node-pty", () => ({
  spawn: (...args: unknown[]) => spawn(...args),
}));

import { kickoffExperimentRun } from "../../src/main/experiment/experiment-run-executor";
import {
  buildExperimentStorageContext,
  createExperiment,
} from "../../src/main/experiment/facade";
import { getLibraryPaths, openLibraryDb } from "../../src/main/literature/facade";
import { tempLiteratureProject } from "./helpers/temp-literature-project";
import { createSession } from "../../src/main/terminal/terminal";
import * as executionRegistry from "../../src/main/terminal/execution-registry";
import type { ExecutionRegistry } from "../../src/main/terminal/execution-registry";

const dirs: string[] = [];

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

beforeEach(() => {
  info.mockReset();
  warn.mockReset();
  debug.mockReset();
  error.mockReset();
  spawn.mockReset();
});

describe("L4 experiment / literature / terminal logs", () => {
  it("logs experiment.run.fail without start when the island is missing", async () => {
    const root = tmp("prism-l4-exp-missing-");
    mkdirSync(join(root, "experiment"), { recursive: true });
    const ctx = buildExperimentStorageContext(root, "experiment");

    await kickoffExperimentRun({
      ctx,
      id: "exp-missing",
      command: "echo x",
      ensureVenv: false,
    });

    expect(info.mock.calls.filter((call) => call[0] === "experiment.run.start")).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      "experiment.run.fail",
      expect.objectContaining({
        experimentId: "exp-missing",
        error: "experiment_not_found",
      }),
    );
  });

  it("logs experiment.run.start then experiment.run.fail when spawn throws", async () => {
    const root = tmp("prism-l4-exp-fail-");
    mkdirSync(join(root, "experiment"), { recursive: true });
    const ctx = buildExperimentStorageContext(root, "experiment");
    const created = createExperiment(ctx, { title: "Doomed" }, { ensureVenv: false });
    if (!created.ok) throw new Error("create failed");

    const registry: Pick<ExecutionRegistry, "create" | "start" | "subscribe" | "waitForFinal"> = {
      create: async () =>
        ({
          executionId: "ex-1",
          transcriptPath: join(root, "t.log"),
        }) as Awaited<ReturnType<ExecutionRegistry["create"]>>,
      subscribe: () => () => {},
      start: async () => {
        throw new Error("spawn_failed");
      },
      waitForFinal: async () => {
        throw new Error("unreachable");
      },
    };
    vi.spyOn(executionRegistry, "ensureExecutionRegistry").mockReturnValue(
      registry as ExecutionRegistry,
    );

    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      void kickoffExperimentRun({
        ctx,
        id: created.id,
        command: "echo doomed-run",
        onComplete: resolve,
        ensureVenv: false,
      });
    });

    expect(result.ok).toBe(false);
    expect(info).toHaveBeenCalledWith(
      "experiment.run.start",
      expect.objectContaining({
        experimentId: created.id,
        command: "echo doomed-run",
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      "experiment.run.fail",
      expect.objectContaining({
        experimentId: created.id,
        error: "spawn_failed",
      }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("stdout");
  });

  it("logs literature.open.fail when the library file cannot be opened", () => {
    const root = tempLiteratureProject();
    const dbPath = getLibraryPaths(root).dbPath;
    mkdirSync(dbPath, { recursive: true });
    expect(() => openLibraryDb(root)).toThrow();
    expect(warn).toHaveBeenCalledWith(
      "literature.open.fail",
      expect.objectContaining({
        project: expect.any(String),
      }),
    );
  });

  it("logs terminal.session.fail when PTY spawn throws", () => {
    spawn.mockImplementation(() => {
      throw new Error("pty missing");
    });
    expect(() =>
      createSession({
        sessionId: "tab-1:0",
        tabId: "tab-1",
        projectRoot: "/Users/me/paper",
        cwd: "/Users/me/paper",
        onData: vi.fn(),
        onExit: vi.fn(),
      }),
    ).toThrow(/Failed to spawn PTY/);
    expect(warn).toHaveBeenCalledWith(
      "terminal.session.fail",
      expect.objectContaining({
        op: "create",
        project: "paper",
        error: "pty missing",
      }),
    );
  });
});
