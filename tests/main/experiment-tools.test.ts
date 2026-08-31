import { describe, expect, it } from "vitest";
import { EXPERIMENT_TOOLS, getNativeToolByName } from "../../src/main/agent/tools/index";
import { EXPERIMENTS_PROMPT } from "../../src/main/prompts";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";

describe("experiment tools", () => {
  it("exports four tools with promptGuidelines", () => {
    expect(EXPERIMENT_TOOLS).toHaveLength(4);
    for (const tool of EXPERIMENT_TOOLS) {
      expect(tool.promptGuidelines?.length).toBeGreaterThan(0);
    }
  });

  it("experiment-log aligns with experiments module (registry, detect_env, not execution)", () => {
    const log = getNativeToolByName(TOOL_NAMES.experimentLog)!;
    const text = log.promptGuidelines!.join(" ");
    expect(text).toContain("list");
    expect(text).toContain("detect_env");
    expect(text).toContain("briefLinks");
    expect(text).toContain("Research design");
    expect(text).toContain("experiment-run");
    expect(EXPERIMENTS_PROMPT).toContain("Scope boundary");
  });

  it("experiment-run documents venv, artifacts, and cost confirm", () => {
    const run = getNativeToolByName(TOOL_NAMES.experimentRun)!;
    const text = run.promptGuidelines!.join(" ");
    expect(text).toContain(".workbench/.venv");
    expect(text).toContain("never system Python");
    expect(text).toContain("artifacts");
    expect(text).toContain("question");
    expect(run.description).toContain("Job Monitor");
  });

  it("results-snapshot and provenance-query complement log/run", () => {
    const snap = getNativeToolByName(TOOL_NAMES.resultsSnapshot)!;
    expect(snap.promptGuidelines!.join(" ")).toContain("provenance-query");
    const prov = getNativeToolByName(TOOL_NAMES.provenanceQuery)!;
    expect(prov.description).toContain("provenance.jsonl");
    expect(prov.promptGuidelines!.join(" ")).toContain("resolve_artifact");
  });

  it("experiments module Route defers how-to to tools", () => {
    expect(EXPERIMENTS_PROMPT).toContain("Route the request");
    expect(EXPERIMENTS_PROMPT).toContain("not repeated here");
    expect(EXPERIMENTS_PROMPT).toContain(TOOL_NAMES.experimentLog);
    expect(EXPERIMENTS_PROMPT).toContain(TOOL_NAMES.provenanceQuery);
    expect(EXPERIMENTS_PROMPT).not.toMatch(/^\s*5\. \*\*Execute/m);
  });
});
