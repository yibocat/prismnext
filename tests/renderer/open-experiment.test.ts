import { describe, expect, it } from "vitest";
import { resolveExperimentIdFromTool } from "../../src/renderer/modes/experiments-mode/open-experiment";

describe("resolveExperimentIdFromTool", () => {
  it("prefers input.id", () => {
    expect(
      resolveExperimentIdFromTool(
        { id: "exp-from-input" },
        { id: "exp-from-result", meta: { id: "exp-from-meta" } },
      ),
    ).toBe("exp-from-input");
  });

  it("falls back to result.id then meta.id", () => {
    expect(resolveExperimentIdFromTool({}, { id: "exp-result" })).toBe("exp-result");
    expect(resolveExperimentIdFromTool({}, { meta: { id: "exp-meta" } })).toBe("exp-meta");
  });

  it("returns null when nothing matches", () => {
    expect(resolveExperimentIdFromTool({}, null)).toBeNull();
    expect(resolveExperimentIdFromTool({ action: "list" }, { experiments: [] })).toBeNull();
  });
});
