import { describe, it, expect } from "vitest";
import { BUILTIN_TOOLS } from "../../src/main/tools/index";
import { buildOpencodeToolDescription, patchToolDescription } from "../../src/main/tools/tool-description";
import { TOOL_NAMES } from "../../src/shared/tool-names";

describe("buildOpencodeToolDescription", () => {
  it("includes description, usageHint, and workflowRules", () => {
    const meta = BUILTIN_TOOLS.find((t) => t.name === "literature-stage");
    expect(meta).toBeDefined();
    const text = buildOpencodeToolDescription(meta!);
    expect(text).toContain(meta!.description);
    expect(text).toContain("[n]");
    expect(text).toContain("Rules:");
  });

  it("adds library context for reference tools", () => {
    const meta = BUILTIN_TOOLS.find((t) => t.name === "literature-read");
    const text = buildOpencodeToolDescription(meta!);
    expect(text).toContain("library.db");
  });

  it("carries literature-stage binding rules in the tool schema only", () => {
    const meta = BUILTIN_TOOLS.find((t) => t.name === TOOL_NAMES.literatureStage)!;
    const text = buildOpencodeToolDescription(meta);
    expect(text).toContain("BINDING:");
    expect(text).toContain("literature-discover");
    expect(text).toContain("No library write");
    expect(text).toContain("Do not delegate discovery/staging to a subagent");
  });

  it("reflects registry workflow rule changes without a prompt module", () => {
    const meta = BUILTIN_TOOLS.find((t) => t.name === TOOL_NAMES.literatureStage)!;
    const custom = {
      ...meta,
      workflowRules: [...(meta.workflowRules ?? []), "CUSTOM-RULE-XYZ"],
    };
    expect(buildOpencodeToolDescription(custom)).toContain("CUSTOM-RULE-XYZ");
  });

  it("citation-health steers away from read/glob and Task in OpenCode description only", () => {
    const health = BUILTIN_TOOLS.find((t) => t.name === TOOL_NAMES.citationHealth)!;
    const text = buildOpencodeToolDescription(health);
    expect(text).toMatch(/read\/glob/i);
    expect(text).toContain("missingKeys");
    expect(text).toContain("duplicateKeys");
    expect(text).toContain("Task tool or subagents");
  });
});

describe("patchToolDescription", () => {
  const sample = `export default tool({
  description:
    "Old short description.",
  args: {
    bibkey: tool.schema.string().describe("key"),
  },
  async execute() {
    return { output: "{}" };
  },
});
`;

  it("replaces description with registry-built text", () => {
    const meta = BUILTIN_TOOLS.find((t) => t.name === "literature-read")!;
    const next = patchToolDescription(sample, buildOpencodeToolDescription(meta));
    expect(next).toContain("library.db");
    expect(next).not.toContain("Old short description");
    expect(next).toContain("args:");
  });
});
