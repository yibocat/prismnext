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
    expect(text).toContain("websearch");
    expect(text).toContain("Do NOT use the Task tool");
  });

  it("reflects registry workflow rule changes without a prompt module", () => {
    const meta = BUILTIN_TOOLS.find((t) => t.name === TOOL_NAMES.literatureStage)!;
    const custom = {
      ...meta,
      workflowRules: [...(meta.workflowRules ?? []), "CUSTOM-RULE-XYZ"],
    };
    expect(buildOpencodeToolDescription(custom)).toContain("CUSTOM-RULE-XYZ");
  });

  it("cite-check tools steer away from read/glob in OpenCode description only", () => {
    const cite = BUILTIN_TOOLS.find((t) => t.name === TOOL_NAMES.literatureCiteCheck)!;
    const bib = BUILTIN_TOOLS.find((t) => t.name === TOOL_NAMES.latexBibCheck)!;
    expect(buildOpencodeToolDescription(cite)).toMatch(/read\/glob/i);
    expect(buildOpencodeToolDescription(cite)).toContain("missingKeys");
    expect(buildOpencodeToolDescription(bib)).toMatch(/read\/glob/i);
    expect(buildOpencodeToolDescription(bib)).toContain("duplicateKeys");
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
