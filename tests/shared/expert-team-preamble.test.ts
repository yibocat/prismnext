import { describe, it, expect } from "vitest";
import { buildExpertTeamPreamble } from "../../src/shared/expert-team-preamble";

describe("buildExpertTeamPreamble", () => {
  it("returns empty string when no experts", () => {
    expect(buildExpertTeamPreamble([])).toBe("");
  });

  it("lists @-mentioned experts as must-Task delegated subagents", () => {
    const preamble = buildExpertTeamPreamble([
      {
        id: "methodology-auditor",
        name: "Methodology Auditor",
        description: "Audit methods",
      },
    ]);
    expect(preamble).toContain("@methodology-auditor");
    expect(preamble).toContain("Delegated subagents");
    expect(preamble).toMatch(/must.*Task/i);
    expect(preamble).toMatch(/orchestrator/i);
    expect(preamble).toMatch(/allowlist/i);
  });
});
