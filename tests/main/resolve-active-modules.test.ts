import { describe, it, expect } from "vitest";
import {
  composeProfileModulePrompts,
  resolveActiveModuleKeys,
  resolveProfileSelectableModules,
  resolveStableSystemModules,
} from "../../src/main/prompts/resolve-active-modules";
import { LITERATURE_LIBRARY_PROMPT } from "../../src/main/prompts/modules/literature-library";
import { EXPERIMENTS_PROMPT } from "../../src/main/prompts/modules/experiments";

describe("resolve-active-modules", () => {
  it("stable system modules include workspace and cognitive baselines", () => {
    const keys = resolveStableSystemModules().map((m) => m.key);
    // workspace-folders (project structure) + cognitive baselines (always-on for every agent)
    expect(keys).toEqual(["workspace-folders", "research-reasoning", "reply-depth"]);
  });

  it("profile-selectable modules exclude workspace", () => {
    const keys = resolveProfileSelectableModules().map((m) => m.key);
    expect(keys).toContain("chat-citation-staging");
    expect(keys).toContain("citation-audit");
    expect(keys).toContain("literature-library");
    expect(keys).toContain("task-delegation");
    expect(keys).toContain("experiments");
    expect(keys).not.toContain("workspace-folders");
  });

  it("composeProfileModulePrompts inlines only profile-selected modules", () => {
    const text = composeProfileModulePrompts(["literature-library"], {});
    expect(text).toContain(LITERATURE_LIBRARY_PROMPT.split("\n")[0]);
    expect(text).not.toContain("## Chat paper citations");
  });

  it("composeProfileModulePrompts inlines the experiments module", () => {
    const text = composeProfileModulePrompts(["experiments"], {});
    expect(text).toContain(EXPERIMENTS_PROMPT.split("\n")[0]);
    expect(text).toContain("experiment-log");
  });

  it("resolveActiveModuleKeys includes global baselines plus profile picks", () => {
    expect(resolveActiveModuleKeys({})).toEqual([
      "reply-depth",
      "research-reasoning",
      "workspace-folders",
    ]);
    expect(resolveActiveModuleKeys({ profileModules: ["literature-library", "bogus"] })).toEqual([
      "literature-library",
      "reply-depth",
      "research-reasoning",
      "workspace-folders",
    ]);
  });

  it("does not require global module toggles for profile selection", () => {
    const keys = resolveActiveModuleKeys({
      profileModules: ["chat-citation-staging", "literature-library"],
    });
    expect(keys).toEqual([
      "chat-citation-staging",
      "literature-library",
      "reply-depth",
      "research-reasoning",
      "workspace-folders",
    ]);
  });
});
