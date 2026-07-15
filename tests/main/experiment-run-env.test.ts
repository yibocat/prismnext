import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => "/tmp/prism-experiment-run-env-test" },
}));

import { buildPythonEnvExtra } from "../../src/main/services/experiment-run-executor";
import type { ExperimentEnv } from "../../src/shared/experiment-log";

const baseEnv: ExperimentEnv = {
  python: null,
  pythonVersion: null,
  rscript: null,
  rVersion: null,
  platform: process.platform,
  gitCommit: null,
  venvPath: null,
};

describe("buildPythonEnvExtra", () => {
  it("returns only PYTHONUNBUFFERED when no python is detected", () => {
    const extra = buildPythonEnvExtra(baseEnv);
    expect(extra).toEqual({ PYTHONUNBUFFERED: "1" });
  });

  it("prepends the venv bin to PATH and sets VIRTUAL_ENV when a venv exists", () => {
    const env: ExperimentEnv = {
      ...baseEnv,
      python: "/tmp/proj/.venv/bin/python",
      pythonVersion: "3.12",
      venvPath: ".venv",
    };
    const extra = buildPythonEnvExtra(env);
    expect(extra.VIRTUAL_ENV).toBe("/tmp/proj/.venv");
    expect(extra.PATH?.startsWith("/tmp/proj/.venv/bin")).toBe(true);
    expect(extra.PATH).toContain(process.env.PATH ?? "");
  });

  it("emits bare PATH (no current PATH) when process.env.PATH is empty", () => {
    const previous = process.env.PATH;
    delete process.env.PATH;
    try {
      const env: ExperimentEnv = {
        ...baseEnv,
        python: "/tmp/proj/.venv/bin/python",
        venvPath: ".venv",
      };
      const extra = buildPythonEnvExtra(env);
      expect(extra.PATH).toBe("/tmp/proj/.venv/bin");
    } finally {
      if (previous !== undefined) process.env.PATH = previous;
    }
  });
});
