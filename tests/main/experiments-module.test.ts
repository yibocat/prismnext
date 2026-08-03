import { describe, expect, it } from "vitest";
import { EXPERIMENTS_PROMPT } from "../../src/main/prompts/modules/experiments";
import { TOOL_NAMES } from "../../src/shared/tool-names";

describe("EXPERIMENTS_PROMPT", () => {
  it("owns experiment design with route/judgment — aligns with brief without frozen gate", () => {
    expect(EXPERIMENTS_PROMPT).toContain("Experiment");
    expect(EXPERIMENTS_PROMPT).toContain("Route the request");
    expect(EXPERIMENTS_PROMPT).toContain("Project brief");
    expect(EXPERIMENTS_PROMPT).toContain("Interaction");
    expect(EXPERIMENTS_PROMPT).toContain(TOOL_NAMES.experimentRun);
    expect(EXPERIMENTS_PROMPT).toContain(TOOL_NAMES.researchBriefRead);
    expect(EXPERIMENTS_PROMPT).toContain("optional");
    expect(EXPERIMENTS_PROMPT).toContain("completion gate");

    expect(EXPERIMENTS_PROMPT).not.toContain("Frozen in brief");
    expect(EXPERIMENTS_PROMPT).not.toContain("BINDING");
    expect(EXPERIMENTS_PROMPT).not.toContain("RightArea");
  });

  it("documents shared project Python venv and non-system installs", () => {
    expect(EXPERIMENTS_PROMPT).toContain("Runtime environments");
    expect(EXPERIMENTS_PROMPT).toContain(".prismnext/.venv");
    expect(EXPERIMENTS_PROMPT).toContain("uv pip install");
    expect(EXPERIMENTS_PROMPT).toContain("Never");
    expect(EXPERIMENTS_PROMPT).toContain("system Python");
    expect(EXPERIMENTS_PROMPT).toContain("Other runtimes");
    expect(EXPERIMENTS_PROMPT).not.toContain("<experiment-dir>/.venv");
  });
});
