import { describe, expect, it } from "vitest";
import {
  AGENT_LIFECYCLE_PHASES,
  PROJECT_WARM_PHASES,
  isAgentLifecyclePhase,
  isProjectWarmPhase,
} from "../../src/shared/agent-status";

describe("agent-status", () => {
  it("accepts known lifecycle phases", () => {
    for (const phase of AGENT_LIFECYCLE_PHASES) {
      expect(isAgentLifecyclePhase(phase)).toBe(true);
    }
  });

  it("accepts known project warm phases", () => {
    for (const phase of PROJECT_WARM_PHASES) {
      expect(isProjectWarmPhase(phase)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isAgentLifecyclePhase("available")).toBe(false);
    expect(isProjectWarmPhase("hot")).toBe(false);
    expect(isAgentLifecyclePhase("")).toBe(false);
    expect(isAgentLifecyclePhase(null)).toBe(false);
  });
});
