import { describe, it, expect } from "vitest";
import {
  composeProfileModulePrompts,
  resolveActiveModuleKeys,
  resolveProfileSelectableModules,
  resolveStableSystemModules,
} from "../../src/main/prompts/resolve-active-modules";
import { LITERATURE_LIBRARY_PROMPT } from "../../src/main/prompts/modules/literature-library";

describe("resolve-active-modules", () => {
  it("stable system modules are workspace-only", () => {
    const keys = resolveStableSystemModules().map((m) => m.key);
    expect(keys).toEqual(["workspace-folders"]);
  });

  it("profile-selectable modules exclude workspace", () => {
    const keys = resolveProfileSelectableModules().map((m) => m.key);
    expect(keys).toContain("chat-citation-staging");
    expect(keys).toContain("literature-library");
    expect(keys).toContain("task-delegation");
    expect(keys).not.toContain("workspace-folders");
  });

  it("composeProfileModulePrompts inlines only profile-selected modules", () => {
    const text = composeProfileModulePrompts(["literature-library"], {});
    expect(text).toContain(LITERATURE_LIBRARY_PROMPT.split("\n")[0]);
    expect(text).not.toContain("## Chat paper citations");
  });

  it("resolveActiveModuleKeys always includes workspace plus profile picks", () => {
    expect(resolveActiveModuleKeys({})).toEqual(["workspace-folders"]);
    expect(resolveActiveModuleKeys({ profileModules: ["literature-library", "bogus"] })).toEqual([
      "literature-library",
      "workspace-folders",
    ]);
  });

  it("does not require global module toggles for profile selection", () => {
    const keys = resolveActiveModuleKeys({
      profileModules: ["chat-citation-staging", "literature-library"],
    });
    expect(keys).toEqual(["chat-citation-staging", "literature-library", "workspace-folders"]);
  });
});
