import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  isPythonRelatedCommand,
  isForbiddenSystemPythonInstall,
  isExperimentPythonSetupCommand,
  isExperimentPythonScriptCommand,
  extractAbsolutePythonPath,
  isExternalInterpreterCommand,
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

describe("extractAbsolutePythonPath", () => {
  it("extracts absolute-path python interpreters", () => {
    expect(
      extractAbsolutePythonPath("/opt/miniforge3/envs/sage/bin/python script.py"),
    ).toBe("/opt/miniforge3/envs/sage/bin/python");
    expect(extractAbsolutePythonPath("cd labs/x && /usr/bin/python3 plot.py")).toBe(
      "/usr/bin/python3",
    );
  });

  it("ignores PATH-resolved, relative, and non-python commands", () => {
    expect(extractAbsolutePythonPath("python3 plot.py")).toBeNull();
    expect(extractAbsolutePythonPath("./python plot.py")).toBeNull();
    expect(extractAbsolutePythonPath("sage -python plot.py")).toBeNull();
    expect(extractAbsolutePythonPath("ls -la")).toBeNull();
  });
});

describe("isExternalInterpreterCommand (bash backdoor, gap 3)", () => {
  it("detects sage invocations that execute code", () => {
    expect(isExternalInterpreterCommand("sage -python verify.py")).toBe(true);
    expect(isExternalInterpreterCommand("sage verify.sage")).toBe(true);
    expect(isExternalInterpreterCommand("sage -c 'factor(12)'")).toBe(true);
    expect(
      isExternalInterpreterCommand("/opt/SageMath/sage -python verify.py"),
    ).toBe(true);
    expect(isExternalInterpreterCommand("sudo sage -python verify.py")).toBe(true);
    expect(isExternalInterpreterCommand("bash -c 'sage verify.sage'")).toBe(true);
  });

  it("ignores python-lane, look-alike, and non-interpreter commands", () => {
    expect(isExternalInterpreterCommand("python3 plot.py")).toBe(false);
    expect(isExternalInterpreterCommand("sagemath build")).toBe(false);
    expect(isExternalInterpreterCommand("./run-sage-tests.sh")).toBe(false);
    expect(isExternalInterpreterCommand("echo sage")).toBe(false);
    expect(isExternalInterpreterCommand("ls -la")).toBe(false);
  });

  it("classifies sage as a script command, never as setup", () => {
    expect(isExperimentPythonScriptCommand("sage -python verify.py")).toBe(true);
    expect(isExperimentPythonScriptCommand("sage verify.sage")).toBe(true);
    expect(isExperimentPythonSetupCommand("sage -python verify.py")).toBe(false);
    // Mixed: a sage segment must break the "setup-only" classification.
    expect(
      isExperimentPythonScriptCommand("uv pip install numpy && sage -python train.py"),
    ).toBe(true);
    expect(
      isExperimentPythonSetupCommand("uv pip install numpy && sage -python train.py"),
    ).toBe(false);
  });

  it("keeps sage out of isPythonRelatedCommand (no venv injection for the gate)", () => {
    expect(isPythonRelatedCommand("sage -python verify.py")).toBe(false);
    expect(isPythonRelatedCommand("sage verify.sage")).toBe(false);
  });
});

describe("gateExperimentPythonExecution external-interpreter warning", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-py-gate-ext-"));
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

  it("warns (but applies) when the command leads with an external absolute-path python", () => {
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: join(root, "labs", "exp-demo"),
      command: "/opt/miniforge3/envs/sage/bin/python verify.py",
      ensureOpts: { runner: stubProjectVenv() },
    });
    expect(gate.action).toBe("apply");
    if (gate.action !== "apply") return;
    expect(gate.warning).toMatch(/interpreter="external"/);
    expect(gate.warning).toContain("/opt/miniforge3/envs/sage/bin/python");
  });

  it("does not warn when the absolute path IS the project venv python", () => {
    const venvPy = join(root, ".prismnext", ".venv", "bin", "python");
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: join(root, "labs", "exp-demo"),
      command: `${venvPy} verify.py`,
      ensureOpts: { runner: stubProjectVenv() },
    });
    expect(gate.action).toBe("apply");
    if (gate.action !== "apply") return;
    expect(gate.warning).toBeUndefined();
  });

  it("does not warn for bare PATH-resolved python", () => {
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: join(root, "labs", "exp-demo"),
      command: "python3 verify.py",
      ensureOpts: { runner: stubProjectVenv() },
    });
    expect(gate.action).toBe("apply");
    if (gate.action !== "apply") return;
    expect(gate.warning).toBeUndefined();
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

describe("gateExperimentPythonExecution external-interpreter bash lane (gap 3)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-py-gate-sage-"));
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

  /** The sage lane must never ensure the project venv. */
  function explodingVenvRunner(): ExperimentVenvRunner {
    return () => {
      throw new Error("project venv must not be ensured for external interpreters");
    };
  }

  it("blocks `sage -python` via bash inside an island", () => {
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: join(root, "labs", "exp-demo"),
      command: "sage -python verify.py",
      ensureOpts: { runner: explodingVenvRunner() },
      blockBashPythonScripts: true,
    });
    expect(gate.action).toBe("block");
    if (gate.action === "block") {
      expect(gate.error).toMatch(/experiment-run/i);
      expect(gate.error).toMatch(/interpreter="external"/);
    }
  });

  it("blocks .sage scripts and absolute-path sage via bash inside an island", () => {
    const island = join(root, "labs", "exp-demo");
    for (const command of [
      "sage verify.sage",
      "/opt/SageMath/sage -python verify.py",
      "uv pip install numpy && sage -python train.py",
      // Consistent with `python --version`: queries via bash are blocked too.
      "sage --version",
    ]) {
      const gate = gateExperimentPythonExecution({
        projectRoot: root,
        cwd: island,
        command,
        ensureOpts: { runner: explodingVenvRunner() },
        blockBashPythonScripts: true,
      });
      expect(gate.action, `command: ${command}`).toBe("block");
    }
  });

  it("passes through without the bash flag (experiment-run executor path unaffected)", () => {
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: join(root, "labs", "exp-demo"),
      command: "sage -python verify.py",
      ensureOpts: { runner: explodingVenvRunner() },
    });
    expect(gate.action).toBe("passthrough");
  });

  it("passes through outside the Experiment workspace even in bash mode", () => {
    mkdirSync(join(root, "scratch"), { recursive: true });
    const gate = gateExperimentPythonExecution({
      projectRoot: root,
      cwd: join(root, "scratch"),
      command: "sage -python scratch.py",
      ensureOpts: { runner: explodingVenvRunner() },
      blockBashPythonScripts: true,
    });
    expect(gate.action).toBe("passthrough");
  });
});
