import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ensureExperimentPythonVenv,
  detectEnv,
  createExperiment,
  buildExperimentStorageContext,
  type ExperimentVenvRunner,
} from "../../src/main/services/experiment-log-service";
import { EXPERIMENT_VENV_DIR } from "../../src/shared/experiment-log";

function makeWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "prism-exp-venv-ws-"));
}

function stubPythonAt(workspaceAbs: string): string {
  const isWin = process.platform === "win32";
  const binDir = isWin
    ? join(workspaceAbs, EXPERIMENT_VENV_DIR, "Scripts")
    : join(workspaceAbs, EXPERIMENT_VENV_DIR, "bin");
  mkdirSync(binDir, { recursive: true });
  const py = join(binDir, isWin ? "python.exe" : "python");
  writeFileSync(py, "#!/bin/sh\necho Python 3.12.0\n", "utf-8");
  try {
    chmodSync(py, 0o755);
  } catch {
    // windows / no-op
  }
  return py;
}

describe("ensureExperimentPythonVenv (shared workspace)", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = makeWorkspace();
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("is a no-op when workspace .venv python already exists", () => {
    const py = stubPythonAt(workspace);
    let calls = 0;
    const result = ensureExperimentPythonVenv(workspace, {
      workspaceRel: "labs",
      runner: () => {
        calls++;
        return { ok: true };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(false);
    expect(result.method).toBe("existing");
    expect(result.python).toBe(py);
    expect(result.venvPath).toBe(`labs/${EXPERIMENT_VENV_DIR}`);
    expect(calls).toBe(0);
  });

  it("creates .venv via uv when missing", () => {
    const result = ensureExperimentPythonVenv(workspace, {
      workspaceRel: "experiment",
      runner: (cmd, cwd) => {
        expect(cwd).toBe(workspace);
        expect(cmd).toMatch(/uv venv/);
        stubPythonAt(workspace);
        return { ok: true };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(result.method).toBe("uv");
    expect(result.python).toBeTruthy();
    expect(result.venvPath).toBe(`experiment/${EXPERIMENT_VENV_DIR}`);
  });

  it("falls back to python -m venv when uv fails", () => {
    const seen: string[] = [];
    const result = ensureExperimentPythonVenv(workspace, {
      runner: (cmd) => {
        seen.push(cmd);
        if (cmd.includes("uv venv")) return { ok: false, stderr: "uv missing" };
        if (cmd.includes("-m venv")) {
          stubPythonAt(workspace);
          return { ok: true };
        }
        return { ok: false, stderr: "unexpected" };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(result.method).toBe("venv");
    expect(seen.some((c) => c.includes("uv venv"))).toBe(true);
    expect(seen.some((c) => c.includes("-m venv"))).toBe(true);
  });

  it("returns error when all create strategies fail", () => {
    const result = ensureExperimentPythonVenv(workspace, {
      runner: () => ({ ok: false, stderr: "nope" }),
    });
    expect(result.ok).toBe(false);
    expect(result.created).toBe(false);
    expect(result.error).toMatch(/failed/i);
  });
});

describe("detectEnv after ensure", () => {
  let workspace: string;

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  });

  it("reports shared workspace venv when ensure created it", () => {
    workspace = makeWorkspace();
    ensureExperimentPythonVenv(workspace, {
      workspaceRel: "labs",
      runner: () => {
        stubPythonAt(workspace);
        return { ok: true };
      },
    });
    const island = join(workspace, "exp-a");
    mkdirSync(island, { recursive: true });
    const env = detectEnv(island, { workspaceAbs: workspace, workspaceRel: "labs" });
    expect(env.venvPath).toBe(`labs/${EXPERIMENT_VENV_DIR}`);
    expect(env.python).toContain(EXPERIMENT_VENV_DIR);
    expect(env.python).not.toContain("exp-a");
  });
});

describe("createExperiment injects shared python venv", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-exp-create-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates workspace-root .venv on create (not under the island)", () => {
    const workspaceRel = "experiment";
    mkdirSync(join(root, workspaceRel), { recursive: true });
    const ctx = buildExperimentStorageContext(root, workspaceRel);

    const runner: ExperimentVenvRunner = (_cmd, cwd) => {
      expect(cwd).toBe(ctx.workspaceAbs);
      stubPythonAt(cwd);
      return { ok: true };
    };

    const created = createExperiment(
      ctx,
      { title: "Venv Create Test" },
      { ensureVenv: true, venvRunner: runner },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const isWin = process.platform === "win32";
    const sharedPy = isWin
      ? join(root, workspaceRel, EXPERIMENT_VENV_DIR, "Scripts", "python.exe")
      : join(root, workspaceRel, EXPERIMENT_VENV_DIR, "bin", "python");
    const islandPy = isWin
      ? join(root, created.path, EXPERIMENT_VENV_DIR, "Scripts", "python.exe")
      : join(root, created.path, EXPERIMENT_VENV_DIR, "bin", "python");
    expect(existsSync(sharedPy)).toBe(true);
    expect(existsSync(islandPy)).toBe(false);
  });

  it("still creates the experiment when venv ensure fails", () => {
    const workspaceRel = "experiment";
    mkdirSync(join(root, workspaceRel), { recursive: true });
    const ctx = buildExperimentStorageContext(root, workspaceRel);

    const created = createExperiment(
      ctx,
      { title: "Venv Fail Soft" },
      {
        ensureVenv: true,
        venvRunner: () => ({ ok: false, stderr: "no runtime" }),
      },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(existsSync(join(root, created.path))).toBe(true);
  });
});
