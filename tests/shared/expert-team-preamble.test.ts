import { describe, it, expect } from "vitest";
import { buildExpertTeamPreamble } from "../../src/shared/expert-team-preamble";

describe("buildExpertTeamPreamble", () => {
  it("returns empty string when no experts", () => {
    expect(buildExpertTeamPreamble([])).toBe("");
  });

  it("lists all experts with task delegation instructions", () => {
    const preamble = buildExpertTeamPreamble([
      {
        id: "citation-auditor",
        name: "Citation Auditor",
        description: "Audit citations",
      },
      {
        id: "literature-scout",
        name: "Literature Scout",
        description: "Find papers",
      },
    ]);
    expect(preamble).toContain("@citation-auditor");
    expect(preamble).toContain("@literature-scout");
    expect(preamble).toContain("Task tool");
  });
});
