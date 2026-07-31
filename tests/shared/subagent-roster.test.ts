import { describe, expect, it } from "vitest";
import {
  OPEN_BUILTIN_ROSTER,
  buildSubagentRosterMarkdown,
} from "../../src/shared/subagent-roster";

describe("subagent-roster", () => {
  it("OPEN_BUILTIN_ROSTER covers open Task builtins only", () => {
    const ids = OPEN_BUILTIN_ROSTER.map((e) => e.id);
    expect(ids).toEqual(["general", "explore", "command", "scout"]);
    expect(ids).not.toContain("plan");
    expect(ids).not.toContain("build");
  });

  it("buildSubagentRosterMarkdown lists open builtins and experts with goodFor/notFor", () => {
    const md = buildSubagentRosterMarkdown([
      { id: "methodology-auditor", name: "Methodology Auditor", description: "Audit methods" },
    ]);
    expect(md).toContain("general");
    expect(md).toContain("explore");
    expect(md).toContain("methodology-auditor");
    expect(md).not.toMatch(/^- `plan`/m);
    expect(md).not.toMatch(/^- `build`/m);
    expect(md).toMatch(/Good for|擅长|good for/i);
    expect(md).toContain("### Built-in");
    expect(md).toContain("### Project experts");
    expect(md).toContain("Choose by fit");
    expect(md).toContain("Do not Task to `plan` or `build`");
  });
});
