import { describe, expect, it } from "vitest";
import { buildEnabledToolsConfig } from "../../src/main/services/opencode-tools-config";

describe("buildEnabledToolsConfig", () => {
  it("force-enables Prism Next custom tools even when missing from existing config", () => {
    const merged = buildEnabledToolsConfig({
      read: true,
      edit: true,
      bash: false,
    });
    expect(merged.delete).toBe(true);
    expect(merged.move).toBe(true);
    expect(merged.question).toBe(true);
  });

  it("applies overrides after force-enable (e.g. bash terminal mode)", () => {
    const merged = buildEnabledToolsConfig({ bash: true }, { bash: false });
    expect(merged.bash).toBe(false);
    expect(merged.delete).toBe(true);
  });
});
