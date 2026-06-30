import { describe, it, expect } from "vitest";
import { parseStageToolResult } from "../../src/renderer/lib/literature/parse-stage-tool-result";

describe("parseStageToolResult", () => {
  it("unwraps OpenCode { output: json } wrapper", () => {
    const inner = {
      staged: true,
      verified: true,
      refId: 2,
      citation: { title: "Paper", doi: "10.1/test" },
    };
    const parsed = parseStageToolResult(JSON.stringify({ output: JSON.stringify(inner) }));
    expect(parsed?.verified).toBe(true);
    expect(parsed?.refId).toBe(2);
  });

  it("parses direct StageResult JSON", () => {
    const parsed = parseStageToolResult(JSON.stringify({ staged: true, verified: true, refId: 1 }));
    expect(parsed?.refId).toBe(1);
  });
});
