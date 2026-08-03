import { describe, it, expect } from "vitest";
import {
  composeExpertProfileModulePrompts,
  composeOrchestratorProfileModulePrompts,
  composeProfileModulePrompts,
  resolveExpertActiveModuleKeys,
  resolveExpertProfileModuleKeys,
  resolveOrchestratorActiveModuleKeys,
  resolveOrchestratorProfileModuleKeys,
  resolveSharedProfileModules,
  resolveStableSystemModules,
} from "../../src/main/prompts/resolve-active-modules";
import { LITERATURE_LIBRARY_PROMPT } from "../../src/main/prompts/modules/literature-library";
import { EXPERIMENTS_PROMPT } from "../../src/main/prompts/modules/experiments";

describe("resolve-active-modules", () => {
  it("stable system modules include workspace and cognitive baselines (not Interaction)", () => {
    const keys = resolveStableSystemModules().map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining(["workspace-folders", "research-reasoning", "reply-depth"]),
    );
    expect(keys).not.toContain("interaction");
  });

  it("shared profile modules exclude orchestrator-only and expert-only", () => {
    const keys = resolveSharedProfileModules().map((m) => m.key);
    expect(keys).toContain("chat-citation-staging");
    expect(keys).toContain("literature-library");
    expect(keys).toContain("experiments");
    expect(keys).toContain("interaction");
    expect(keys).not.toContain("orchestrator-judgment");
    expect(keys).not.toContain("subagent-role");
    expect(keys).not.toContain("workspace-folders");
  });

  it("orchestrator profile keys include orchestrator-judgment but not subagent-role", () => {
    const keys = resolveOrchestratorProfileModuleKeys();
    expect(keys).toContain("orchestrator-judgment");
    expect(keys).toContain("literature-library");
    expect(keys).not.toContain("subagent-role");
  });

  it("expert profile keys exclude orchestrator-judgment and include subagent-role", () => {
    const keys = resolveExpertProfileModuleKeys();
    expect(keys).not.toContain("orchestrator-judgment");
    expect(keys).toContain("literature-library");
    expect(keys).toContain("subagent-role");
  });

  it("composeOrchestratorProfileModulePrompts inlines domain modules", () => {
    const text = composeOrchestratorProfileModulePrompts({});
    expect(text).toContain(LITERATURE_LIBRARY_PROMPT.split("\n")[0]);
    expect(text).toContain("## Orchestrator judgment");
  });

  it("composeExpertProfileModulePrompts inlines experiments and subagent role, not orchestrator judgment", () => {
    const text = composeExpertProfileModulePrompts({});
    expect(text).toContain(EXPERIMENTS_PROMPT.split("\n")[0]);
    expect(text).toContain("## Subagent role");
    expect(text).not.toContain("## Orchestrator judgment");
  });

  it("composeProfileModulePrompts still supports explicit key lists", () => {
    const text = composeProfileModulePrompts(["literature-library"], {});
    expect(text).toContain(LITERATURE_LIBRARY_PROMPT.split("\n")[0]);
    expect(text).not.toContain("## Chat paper citations");
  });

  it("resolveOrchestratorActiveModuleKeys excludes expert-only modules", () => {
    const keys = resolveOrchestratorActiveModuleKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        "orchestrator-judgment",
        "literature-library",
        "interaction",
        "workspace-folders",
      ]),
    );
    expect(keys).not.toContain("subagent-role");
  });

  it("resolveExpertActiveModuleKeys excludes orchestrator-only and includes expert-only", () => {
    const keys = resolveExpertActiveModuleKeys();
    expect(keys).toContain("literature-library");
    expect(keys).toContain("subagent-role");
    expect(keys).not.toContain("orchestrator-judgment");
  });
});
