/**
 * OpenCode receives the registry-built description, not the source fallback in
 * interaction-write.ts. Test the exact generated text so Agent guidance and
 * implementation cannot silently diverge during tool sync.
 */
import { describe, expect, it } from "vitest";
import { BUILTIN_TOOLS } from "../../src/main/tools";
import { buildOpencodeToolDescription } from "../../src/main/tools/tool-description";
import { TOOL_NAMES } from "../../src/shared/tool-names";

const meta = BUILTIN_TOOLS.find((item) => item.name === TOOL_NAMES.interactionWrite);
if (!meta) throw new Error("interaction-write tool metadata is missing");
const DESCRIPTION = buildOpencodeToolDescription(meta);

describe("interaction-write tool description", () => {
  it("is built from the runtime capability contract", () => {
    expect(DESCRIPTION).toContain("Choose an Interaction by capability");
    expect(DESCRIPTION).toContain("data source");
    expect(DESCRIPTION).toContain("time behavior");
    expect(DESCRIPTION).toContain("rendering capability");
  });

  it("declares each supported kind and its actual dynamic boundary", () => {
    for (const kind of [
      "instrument",
      "figure.plotly",
      "plot.line",
      "plot.series",
      "plot.scatter",
      "figure.static",
      "diagram.mermaid",
      "figure.script",
    ]) {
      expect(DESCRIPTION).toContain(kind);
    }
    expect(DESCRIPTION).toContain("Only instrument supports live bindings");
    expect(DESCRIPTION).toContain("does not auto-refresh");
  });

  it("uses a generic envelope and diagnostic workflow", () => {
    expect(DESCRIPTION).toContain("{ id, title, kind }");
    expect(DESCRIPTION).toContain("field-level diagnostic");
  });
});
