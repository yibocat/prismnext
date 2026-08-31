import { describe, expect, it } from "vitest";
import { SUBAGENT_ROLE_PROMPT } from "../../src/main/prompts/modules/subagent-role";
import { ALL_MODULES } from "../../src/main/prompts/modules";
import {
  composeSubagentProfileModulePrompts,
  composeOrchestratorProfileModulePrompts,
  resolveSubagentProfileModuleKeys,
  resolveOrchestratorProfileModuleKeys,
  resolveSharedProfileModules,
} from "../../src/main/prompts/resolve-active-modules";

describe("SUBAGENT_ROLE_PROMPT", () => {
  it("puts expert instructions first and avoids module/tool jargon for users", () => {
    expect(SUBAGENT_ROLE_PROMPT).toContain("Specialist subagent");
    expect(SUBAGENT_ROLE_PROMPT).not.toMatch(/^You are/m);
    expect(SUBAGENT_ROLE_PROMPT).toContain("Instructions first");
    expect(SUBAGENT_ROLE_PROMPT).toContain("priority over this module");
    expect(SUBAGENT_ROLE_PROMPT).toContain("Scope boundary");
    expect(SUBAGENT_ROLE_PROMPT).toContain("Materials and grounding");
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

    expect(resolveSubagentProfileModuleKeys()).toContain("subagent-role");
    expect(resolveOrchestratorProfileModuleKeys()).not.toContain("subagent-role");
    expect(resolveSharedProfileModules().map((m) => m.key)).not.toContain("subagent-role");

    expect(composeSubagentProfileModulePrompts({})).toContain("## Subagent role");
    expect(composeOrchestratorProfileModulePrompts({})).not.toContain("## Subagent role");
  });
});
