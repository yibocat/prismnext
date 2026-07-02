import { describe, expect, it } from "vitest";
import { BUILTIN_TOOLS } from "../../src/main/tools/index";
import { TOOL_NAMES } from "../../src/shared/tool-names";

describe("TOOL_NAMES constants", () => {
  it("matches every BUILTIN_TOOLS registry entry", () => {
    const registryNames = new Set(BUILTIN_TOOLS.map((t) => t.name));
    const constantNames = new Set(Object.values(TOOL_NAMES));
    expect(constantNames).toEqual(registryNames);
  });

  it("uses kebab-case literature tool names", () => {
    expect(TOOL_NAMES.literatureRead).toBe("literature-read");
    expect(TOOL_NAMES.literatureReadPdf).toBe("literature-read-pdf");
    expect(TOOL_NAMES.literatureStage).toBe("literature-stage");
  });
});
