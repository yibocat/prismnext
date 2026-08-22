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
import { PRISMNEXT_VENV_REL } from "../../src/shared/experiments/log";

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), "prism-exp-venv-proj-"));
  mkdirSync(join(root, ".workbench"), { recursive: true });
  return root;
}

function stubPythonAtProject(projectRoot: string): string {
  const isWin = process.platform === "win32";
  const binDir = isWin
    ? join(projectRoot, ".workbench", ".venv", "Scripts")
    : join(projectRoot, ".workbench", ".venv", "bin");
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

describe("ensureExperimentPythonVenv (project .workbench/.venv)", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeProject();
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("is a no-op when .workbench/.venv python already exists", () => {
    const py = stubPythonAtProject(projectRoot);
    let calls = 0;
    const result = ensureExperimentPythonVenv(projectRoot, {
      runner: () => {
        calls++;
        return { ok: true };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(false);
    expect(result.method).toBe("existing");
    expect(result.python).toBe(py);
    expect(result.venvPath).toBe(PRISMNEXT_VENV_REL);
    expect(calls).toBe(0);
  });

  it("creates .workbench/.venv via uv when missing", () => {
    const result = ensureExperimentPythonVenv(projectRoot, {
      runner: (cmd, cwd) => {
        expect(cwd).toBe(projectRoot);
        expect(cmd).toMatch(/uv venv/);
        expect(cmd).toContain(PRISMNEXT_VENV_REL);
        stubPythonAtProject(projectRoot);
        return { ok: true };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(result.method).toBe("uv");
    expect(result.python).toBeTruthy();
    expect(result.venvPath).toBe(PRISMNEXT_VENV_REL);
  });

  it("falls back to python -m venv when uv fails", () => {
    const seen: string[] = [];
    const result = ensureExperimentPythonVenv(projectRoot, {
      runner: (cmd) => {
        seen.push(cmd);
        if (cmd.includes("uv venv")) return { ok: false, stderr: "uv missing" };
        if (cmd.includes("-m venv")) {
          stubPythonAtProject(projectRoot);
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
    const result = ensureExperimentPythonVenv(projectRoot, {
      runner: () => ({ ok: false, stderr: "nope" }),
    });
    expect(result.ok).toBe(false);
    expect(result.created).toBe(false);
    expect(result.error).toMatch(/failed/i);
  });
});

describe("detectEnv after ensure", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  });

  it("reports project .workbench/.venv (not under island or experiment folder)", () => {
    projectRoot = makeProject();
    const workspaceRel = "labs";
    mkdirSync(join(projectRoot, workspaceRel, "exp-a"), { recursive: true });
    ensureExperimentPythonVenv(projectRoot, {
      runner: () => {
        stubPythonAtProject(projectRoot);
        return { ok: true };
      },
    });
    const island = join(projectRoot, workspaceRel, "exp-a");
    const env = detectEnv(island, {
      workspaceAbs: join(projectRoot, workspaceRel),
      workspaceRel,
      projectRoot,
    });
    expect(env.venvPath).toBe(PRISMNEXT_VENV_REL);
    expect(env.python).toMatch(/\.workbench[/\\]\.venv/);
    expect(env.python).not.toContain("exp-a");
    expect(env.python).not.toMatch(/labs[/\\]\.venv/);
  });
});

describe("createExperiment injects shared python venv", () => {
  let root: string;

  beforeEach(() => {
    root = makeProject();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates project .workbench/.venv on create (not under the island or experiment folder)", () => {
    const workspaceRel = "experiment";
    mkdirSync(join(root, workspaceRel), { recursive: true });
    const ctx = buildExperimentStorageContext(root, workspaceRel);

    const runner: ExperimentVenvRunner = (_cmd, cwd) => {
      expect(cwd).toBe(ctx.projectRoot);
      stubPythonAtProject(cwd);
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
      ? join(root, ".workbench", ".venv", "Scripts", "python.exe")
      : join(root, ".workbench", ".venv", "bin", "python");
    const islandPy = isWin
      ? join(root, created.path, ".venv", "Scripts", "python.exe")
      : join(root, created.path, ".venv", "bin", "python");
    const folderPy = isWin
      ? join(root, workspaceRel, ".venv", "Scripts", "python.exe")
      : join(root, workspaceRel, ".venv", "bin", "python");
    expect(existsSync(sharedPy)).toBe(true);
    expect(existsSync(islandPy)).toBe(false);
    expect(existsSync(folderPy)).toBe(false);
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
