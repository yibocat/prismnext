import { describe, expect, it } from "vitest";
import { SUBAGENT_ROLE_PROMPT } from "../../src/main/prompts/modules/subagent-role";
import { ALL_MODULES } from "../../src/main/prompts/modules";
import {
  composeExpertProfileModulePrompts,
  composeOrchestratorProfileModulePrompts,
  resolveExpertProfileModuleKeys,
  resolveOrchestratorProfileModuleKeys,
  resolveSharedProfileModules,
} from "../../src/main/prompts/resolve-active-modules";

describe("SUBAGENT_ROLE_PROMPT", () => {
  it("puts expert instructions first and avoids module/tool jargon for users", () => {
    expect(SUBAGENT_ROLE_PROMPT).toContain("Instructions first");
    expect(SUBAGENT_ROLE_PROMPT).toContain("Follow them first");
    expect(SUBAGENT_ROLE_PROMPT).toContain("not expected to know modules");
    expect(SUBAGENT_ROLE_PROMPT).toContain("focused deliverable");
    expect(SUBAGENT_ROLE_PROMPT).toContain("Use available tools");
    expect(SUBAGENT_ROLE_PROMPT).toContain("Do not nest Task");
    expect(SUBAGENT_ROLE_PROMPT).not.toContain("BINDING");
  });

  it("is expertOnly — on experts, not orchestrator or global shared", () => {
    const mod = ALL_MODULES.find((m) => m.key === "subagent-role");
    expect(mod?.profileOnly).toBe(true);
    expect(mod?.expertOnly).toBe(true);
    expect(mod?.orchestratorOnly).toBeFalsy();

    expect(resolveExpertProfileModuleKeys()).toContain("subagent-role");
    expect(resolveOrchestratorProfileModuleKeys()).not.toContain("subagent-role");
    expect(resolveSharedProfileModules().map((m) => m.key)).not.toContain("subagent-role");

    expect(composeExpertProfileModulePrompts({})).toContain("## Subagent role");
    expect(composeOrchestratorProfileModulePrompts({})).not.toContain("## Subagent role");
  });
});
