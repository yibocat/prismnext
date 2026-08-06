import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  isPythonRelatedCommand,
  isForbiddenSystemPythonInstall,
  isExperimentPythonSetupCommand,
  isExperimentPythonScriptCommand,
  PRISMNEXT_VENV_REL,
} from "../../src/shared/experiment-log";
import {
  gateExperimentPythonExecution,
  type ExperimentVenvRunner,
} from "../../src/main/services/experiment-log-service";

describe("isPythonRelatedCommand", () => {
  it("detects python / pip / uv pip", () => {
    expect(isPythonRelatedCommand("python3 plot.py")).toBe(true);
    expect(isPythonRelatedCommand("python train.py --epochs 1")).toBe(true);
    expect(isPythonRelatedCommand("uv pip install matplotlib")).toBe(true);
    expect(isPythonRelatedCommand("pip install numpy")).toBe(true);
    expect(isPythonRelatedCommand("FOO=1 python script.py")).toBe(true);
    expect(isPythonRelatedCommand("cd labs/x && python3 a.py")).toBe(true);
  });

  it("ignores non-python commands", () => {
    expect(isPythonRelatedCommand("echo python")).toBe(false);
    expect(isPythonRelatedCommand("ls -la")).toBe(false);
    expect(isPythonRelatedCommand("Rscript analysis.R")).toBe(false);
  });

  it("sees through wrapper commands (sudo/env/time/nohup/nice/timeout)", () => {
    expect(isPythonRelatedCommand("sudo python3 plot.py")).toBe(true);
    expect(isPythonRelatedCommand("env FOO=1 python script.py")).toBe(true);
    expect(isPythonRelatedCommand("time python train.py")).toBe(true);
    expect(isPythonRelatedCommand("nohup python3 serve.py &")).toBe(true);
    expect(isPythonRelatedCommand("nice -n 5 python3 train.py")).toBe(true);
    expect(isPythonRelatedCommand("timeout 300 python3 train.py")).toBe(true);
    expect(isPythonRelatedCommand("sudo env FOO=1 python3 x.py")).toBe(true);
  });

  it("unwraps sh -c / bash -c inner commands", () => {
    expect(isPythonRelatedCommand("bash -c 'python3 plot.py'")).toBe(true);
    expect(isPythonRelatedCommand('sh -c "pip install numpy"')).toBe(true);
    expect(isPythonRelatedCommand("bash -c 'echo hi'")).toBe(false);
  });
});

describe("isExperimentPythonSetupCommand / script", () => {
  it("classifies setup vs script", () => {
    expect(isExperimentPythonSetupCommand("uv pip install matplotlib")).toBe(true);
    expect(isExperimentPythonSetupCommand("cd labs/x && uv pip install numpy")).toBe(true);
    expect(isExperimentPythonSetupCommand("uv venv")).toBe(true);
    expect(isExperimentPythonSetupCommand("python3 -m venv .venv")).toBe(true);
    expect(isExperimentPythonScriptCommand("python3 plot.py")).toBe(true);
    expect(isExperimentPythonScriptCommand("cd labs/x && python3 plot_v2.py")).toBe(true);
    expect(isExperimentPythonScriptCommand("uv run train.py")).toBe(true);
    expect(isExperimentPythonScriptCommand("uv pip install matplotlib")).toBe(false);
  });
});

describe("isForbiddenSystemPythonInstall", () => {
  it("flags --system / --user and any bare pip3 install", () => {
    expect(isForbiddenSystemPythonInstall("uv pip install matplotlib --system")).toBe(true);
    expect(isForbiddenSystemPythonInstall("pip install numpy --user")).toBe(true);
    expect(isForbiddenSystemPythonInstall("pip3 install cairosvg")).toBe(true);
    expect(
      isForbiddenSystemPythonInstall(
        'which rsvg-convert; python3 -c "import cairosvg"; pip3 install cairosvg | tail -3',
      ),
    ).toBe(true);
    expect(isForbiddenSystemPythonInstall("uv pip install matplotlib")).toBe(false);
  });

  it("flags wrapped bare-pip installs (sudo/env/bash -c)", () => {
    expect(isForbiddenSystemPythonInstall("sudo pip install numpy")).toBe(true);
    expect(isForbiddenSystemPythonInstall("env pip install x")).toBe(true);
    expect(isForbiddenSystemPythonInstall("sudo python3 -m pip install x")).toBe(true);
    expect(isForbiddenSystemPythonInstall("bash -c 'pip install numpy'")).toBe(true);
    // Wrapped uv pip still targets the project venv — allowed.
    expect(isForbiddenSystemPythonInstall("sudo uv pip install matplotlib")).toBe(false);
    expect(isExperimentPythonSetupCommand("sudo uv pip install matplotlib")).toBe(true);
  });
});

describe("gateExperimentPythonExecution (project .prismnext/.venv)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-py-gate-"));
    mkdirSync(join(root, ".prismnext"), { recursive: true });
    writeFileSync(
      join(root, ".prismnext", "settings.json"),
      JSON.stringify({
        workspaceDirs: [{ function: "experiment", name: "labs" }],
      }),
      "utf-8",
    );
    mkdirSync(join(root, "labs", "exp-demo"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function stubProjectVenv(): ExperimentVenvRunner {
    return () => {
      const bin = join(root, ".prismnext", ".venv", "bin");
      mkdirSync(bin, { recursive: true });
      const py = join(bin, "python");
      writeFileSync(py, "#!/bin/sh\necho ok\n");
      try {
        chmodSync(py, 0o755);
      } catch {
        // ignore
      }
      return { ok: true };
    };
  }

  it("passthrough for non-python commands inside island", () => {
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: join(root, "labs", "exp-demo"),
      command: "ls -la",
    });
    expect(gate.action).toBe("passthrough");
  });

  it("applies project venv for python outside the Experiment workspace folder", () => {
    mkdirSync(join(root, "other"), { recursive: true });
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: join(root, "other"),
      command: "python3 plot.py",
      ensureOpts: { runner: stubProjectVenv() },
    });
    expect(gate.action).toBe("apply");
    if (gate.action !== "apply") return;
    expect(gate.envExtra.VIRTUAL_ENV).toMatch(/\.prismnext[/\\]\.venv/);
  });

  it("applies project venv when python runs inside an island", () => {
    const island = join(root, "labs", "exp-demo");
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: island,
      command: "python3 plot.py",
      ensureOpts: { runner: stubProjectVenv() },
    });
    expect(gate.action).toBe("apply");
    if (gate.action !== "apply") return;
    expect(gate.envExtra.VIRTUAL_ENV).toMatch(/\.prismnext[/\\]\.venv/);
    expect(gate.envExtra.VIRTUAL_ENV).not.toContain("exp-demo");
    expect(gate.envExtra.VIRTUAL_ENV).not.toMatch(/labs[/\\]\.venv$/);
    expect(
      gate.envExtra.PATH?.includes(`${PRISMNEXT_VENV_REL}/bin`) ||
        gate.envExtra.PATH?.includes(".prismnext") ||
        gate.envExtra.PATH?.includes(".venv"),
    ).toBe(true);
  });

  it("allows uv pip setup at Experiment folder root (shared project venv)", () => {
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: join(root, "labs"),
      command: "uv pip install matplotlib",
      ensureOpts: { runner: stubProjectVenv() },
    });
    expect(gate.action).toBe("apply");
    if (gate.action !== "apply") return;
    expect(gate.envExtra.VIRTUAL_ENV).toMatch(/\.prismnext[/\\]\.venv/);
  });

  it("blocks python scripts at Experiment folder root (no island)", () => {
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: join(root, "labs"),
      command: "python3 plot.py",
      ensureOpts: { runner: stubProjectVenv() },
    });
    expect(gate.action).toBe("block");
    if (gate.action !== "block") return;
    expect(gate.error).toMatch(/island|experiment-run/i);
  });

  it("blocks when project venv cannot be created", () => {
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: join(root, "labs", "exp-demo"),
      command: "python3 plot.py",
      ensureOpts: { runner: () => ({ ok: false, stderr: "no uv" }) },
    });
    expect(gate.action).toBe("block");
    if (gate.action !== "block") return;
    expect(gate.error).toMatch(/\.venv|venv|prismnext/i);
  });

  it("blocks uv pip --system inside island", () => {
    const island = join(root, "labs", "exp-demo");
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: island,
      command: "uv pip install matplotlib --system",
      ensureOpts: { runner: stubProjectVenv() },
    });
    expect(gate.action).toBe("block");
    if (gate.action !== "block") return;
    expect(gate.error).toMatch(/system/i);
  });

  it("blocks bare pip3 install even from project root (system Python)", () => {
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: root,
      command:
        'which rsvg-convert 2>/dev/null; python3 -c "import cairosvg" 2>&1; pip3 install cairosvg 2>&1 | tail -3',
    });
    expect(gate.action).toBe("block");
    if (gate.action !== "block") return;
    expect(gate.error).toMatch(/system Python|pip3|uv pip/i);
  });

  it("applies when cwd is project root but command cds into island", () => {
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: root,
      command: "cd labs/exp-demo && python3 plot.py",
      ensureOpts: { runner: stubProjectVenv() },
    });
    expect(gate.action).toBe("apply");
  });

  it("uses configured Experiment folder name (not hardcoded experiment/)", () => {
    const island = join(root, "labs", "exp-demo");
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: island,
      command: "python plot.py",
      ensureOpts: { runner: stubProjectVenv() },
    });
    expect(gate.action).toBe("apply");
  });

  it("bash mode blocks script runs and allows uv pip setup", () => {
    const island = join(root, "labs", "exp-demo");
    const blocked = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: island,
      command: "python3 plot_v2.py",
      ensureOpts: { runner: stubProjectVenv() },
      blockBashPythonScripts: true,
    });
    expect(blocked.action).toBe("block");
    if (blocked.action === "block") {
      expect(blocked.error).toMatch(/experiment-run/i);
    }

    const setup = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: island,
      command: "uv pip install matplotlib numpy",
      ensureOpts: { runner: stubProjectVenv() },
      blockBashPythonScripts: true,
    });
    expect(setup.action).toBe("apply");
  });
});
